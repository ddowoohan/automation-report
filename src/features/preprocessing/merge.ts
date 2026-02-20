import type { AnalysisDataset, PreparedCustomer, PreparedOrder, PreparedProduct } from "@/types/domain";
import { normalizeAgencyName } from "@/features/preprocessing/agency-normalization";
import { pickValue, type RawCsvRecord } from "@/features/preprocessing/csv-schema";

function parseNumber(value: string): number {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) {
    return 0;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\./g, "-").trim();
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function customerKey(bizNo: string, agency: string): string {
  return `${bizNo}::${agency}`;
}

export function prepareOrders(rows: RawCsvRecord[]): PreparedOrder[] {
  return rows.map((row) => {
    const agency = normalizeAgencyName(pickValue(row, ["실적대리점", "대리점", "대리점명", "agency", "agency_name"]));

    return {
      orderNo: pickValue(row, ["수주번호", "주문번호", "오더번호", "order_no", "orderno"]),
      bizNo: pickValue(row, ["사업자 등록번호", "사업자등록번호", "사업자번호", "biz_no", "business_no"]),
      agency,
      orderAmount: parseNumber(pickValue(row, ["수주금액", "주문금액", "매출금액", "합계금액", "order_amount", "sales_amount"])),
      orderDate: parseDate(pickValue(row, ["기준일자", "기준일자일", "주문일자", "수주일자", "일자", "date", "order_date"])),
      city: pickValue(row, ["시", "시도", "광역시도", "city"]),
      district: pickValue(row, ["구", "시군구", "군구", "district"]),
      dong: pickValue(row, ["동", "읍면동", "행정동", "법정동", "town"])
    };
  });
}

export function prepareCustomers(rows: RawCsvRecord[], orders: PreparedOrder[]): PreparedCustomer[] {
  const oldestOrderAmountByExact = new Map<string, { date: Date; amount: number }>();
  const oldestOrderAmountByBiz = new Map<string, { date: Date; amount: number }>();

  for (const order of orders) {
    if (!order.orderDate || order.orderAmount <= 0) {
      continue;
    }

    const exactKey = customerKey(order.bizNo, order.agency);
    const currentExact = oldestOrderAmountByExact.get(exactKey);
    if (!currentExact || order.orderDate < currentExact.date) {
      oldestOrderAmountByExact.set(exactKey, { date: order.orderDate, amount: order.orderAmount });
    }

    const currentBiz = oldestOrderAmountByBiz.get(order.bizNo);
    if (!currentBiz || order.orderDate < currentBiz.date) {
      oldestOrderAmountByBiz.set(order.bizNo, { date: order.orderDate, amount: order.orderAmount });
    }
  }

  return rows.map((row) => {
    const agency = normalizeAgencyName(pickValue(row, ["실적대리점", "대리점", "대리점명", "agency", "agency_name"]));
    const bizNo = pickValue(row, ["사업자 등록번호", "사업자등록번호", "사업자번호", "biz_no", "business_no"]);
    const exactKey = customerKey(bizNo, agency);

    const firstOrderRaw = parseNumber(pickValue(row, ["최초주문금액", "최초주문 금액", "first_order_amount", "first_amount"]));
    const imputedExact = oldestOrderAmountByExact.get(exactKey)?.amount ?? 0;
    const imputedBiz = oldestOrderAmountByBiz.get(bizNo)?.amount ?? 0;

    return {
      bizNo,
      agency,
      customerName: pickValue(row, ["회사명", "고객명", "상호", "고객사명", "customer_name", "company_name"]),
      firstOrderAmount: firstOrderRaw > 0 ? firstOrderRaw : imputedExact || imputedBiz
    };
  });
}

export function prepareProducts(rows: RawCsvRecord[]): PreparedProduct[] {
  return rows.map((row) => ({
    orderNo: pickValue(row, ["수주번호", "주문번호", "오더번호", "order_no", "orderno"]),
    midCategory: pickValue(row, ["카테고리(중분류)", "카테고리중분류", "중분류", "품목중분류", "mid_category"]),
    quantity: parseNumber(pickValue(row, ["수량", "판매수량", "qty", "quantity"])),
    salesAmount: parseNumber(pickValue(row, ["수주금액", "주문금액", "품목금액", "amount", "sales_amount"])),
    isNewProduct: ["신제품", "Y", "1", "TRUE"].includes(
      pickValue(row, ["신제품구분", "신제품여부", "신제품", "new_product", "is_new_product"]).toUpperCase()
    )
  }));
}

function buildCustomerIndices(customers: PreparedCustomer[]) {
  const byExact = new Map<string, PreparedCustomer>();

  for (const customer of customers) {
    if (customer.bizNo && customer.agency) {
      byExact.set(customerKey(customer.bizNo, customer.agency), customer);
    }
  }

  return { byExact };
}

export function buildAnalysisDataset(
  orders: PreparedOrder[],
  customers: PreparedCustomer[],
  products: PreparedProduct[]
): AnalysisDataset {
  const validOrders = orders.filter((order) => order.orderAmount > 0 && order.orderNo && order.bizNo && order.agency);
  const customerIndices = buildCustomerIndices(customers);

  const matchedCustomers = validOrders
    .map((order) => customerIndices.byExact.get(customerKey(order.bizNo, order.agency)))
    .filter((customer): customer is PreparedCustomer => Boolean(customer));

  const knownOrderSet = new Set(validOrders.map((order) => order.orderNo));
  const filteredProducts = products.filter((product) => knownOrderSet.has(product.orderNo));

  return {
    orders: validOrders,
    customers: dedupeCustomers(matchedCustomers),
    products: filteredProducts
  };
}

function dedupeCustomers(customers: PreparedCustomer[]): PreparedCustomer[] {
  const map = new Map<string, PreparedCustomer>();
  for (const customer of customers) {
    map.set(customerKey(customer.bizNo, customer.agency || "unknown"), customer);
  }
  return Array.from(map.values());
}
