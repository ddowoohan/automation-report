import type {
  AnalysisDataset,
  AnalysisResult,
  BenchmarkMode,
  GrowthCustomer,
  KpiCard,
  MonthlyNewProduct,
  RegionStat
} from "@/types/domain";
import { getClub1000Agencies } from "@/features/preprocessing/agency-normalization";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

function safeDelta(base: number, current: number): number {
  if (base === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - base) / base) * 100;
}

function toneFromDelta(delta: number): "up" | "down" | "neutral" {
  if (delta > 0.5) {
    return "up";
  }
  if (delta < -0.5) {
    return "down";
  }
  return "neutral";
}

function getBaselineAgencies(dataset: AnalysisDataset, benchmark: BenchmarkMode): string[] {
  const agencies = Array.from(new Set(dataset.orders.map((order) => order.agency)));
  if (benchmark === "overall") {
    return agencies;
  }

  const club = new Set(getClub1000Agencies());
  return agencies.filter((agency) => club.has(agency));
}

function agencyOrders(dataset: AnalysisDataset, agency: string) {
  return dataset.orders.filter((order) => order.agency === agency);
}

function averageByAgency(dataset: AnalysisDataset, agencies: string[]): { sales: number; orderCount: number; newProductRatio: number } {
  if (agencies.length === 0) {
    return { sales: 0, orderCount: 0, newProductRatio: 0 };
  }

  const totals = agencies.map((agency) => {
    const orders = agencyOrders(dataset, agency);
    const sales = orders.reduce((sum, order) => sum + order.orderAmount, 0);
    const orderCount = orders.length;

    const orderSet = new Set(orders.map((order) => order.orderNo));
    const products = dataset.products.filter((product) => orderSet.has(product.orderNo));

    const totalProductSales = products.reduce((sum, product) => sum + product.salesAmount, 0);
    const newProductSales = products.filter((product) => product.isNewProduct).reduce((sum, product) => sum + product.salesAmount, 0);
    const ratio = totalProductSales > 0 ? (newProductSales / totalProductSales) * 100 : 0;

    return { sales, orderCount, newProductRatio: ratio };
  });

  return {
    sales: totals.reduce((sum, item) => sum + item.sales, 0) / agencies.length,
    orderCount: totals.reduce((sum, item) => sum + item.orderCount, 0) / agencies.length,
    newProductRatio: totals.reduce((sum, item) => sum + item.newProductRatio, 0) / agencies.length
  };
}

function growthCustomers(dataset: AnalysisDataset, agency: string): GrowthCustomer[] {
  const orders = agencyOrders(dataset, agency);

  const cumulativeByBiz = new Map<string, number>();
  for (const order of orders) {
    cumulativeByBiz.set(order.bizNo, (cumulativeByBiz.get(order.bizNo) ?? 0) + order.orderAmount);
  }

  const customers = dataset.customers.filter((customer) => customer.agency === agency);
  const cumulativeValues = customers.map((customer) => cumulativeByBiz.get(customer.bizNo) ?? 0);
  const threshold = percentile(cumulativeValues, 0.7);

  return customers
    .map((customer) => {
      const cumulativeAmount = cumulativeByBiz.get(customer.bizNo) ?? 0;
      const growthMultiplier = customer.firstOrderAmount > 0 ? cumulativeAmount / customer.firstOrderAmount : 0;
      const highPotential = growthMultiplier >= 2 && cumulativeAmount >= threshold;

      return {
        bizNo: customer.bizNo,
        customerName: customer.customerName || customer.bizNo,
        firstOrderAmount: customer.firstOrderAmount,
        cumulativeAmount,
        growthMultiplier,
        highPotential
      };
    })
    .sort((a, b) => b.cumulativeAmount - a.cumulativeAmount);
}

function regionStatsFromOrders(orders: AnalysisDataset["orders"]): { all: RegionStat[]; main: RegionStat[]; expansion: RegionStat[] } {
  const total = orders.reduce((sum, order) => sum + order.orderAmount, 0);

  const grouped = new Map<string, number>();
  for (const order of orders) {
    const region = [order.city, order.district, order.dong].filter(Boolean).join(" ");
    if (!region) {
      continue;
    }
    grouped.set(region, (grouped.get(region) ?? 0) + order.orderAmount);
  }

  const stats = Array.from(grouped.entries())
    .map(([region, sales]) => ({ region, sales, share: total > 0 ? (sales / total) * 100 : 0 }))
    .sort((a, b) => b.sales - a.sales);

  return {
    all: stats,
    main: stats.slice(0, 8),
    expansion: [...stats].sort((a, b) => a.share - b.share).slice(0, 5)
  };
}

function monthlyNewProducts(dataset: AnalysisDataset, agency: string): MonthlyNewProduct[] {
  const orderByNo = new Map(dataset.orders.map((order) => [order.orderNo, order]));
  const monthly = new Map<string, MonthlyNewProduct>();

  for (const product of dataset.products) {
    if (!product.isNewProduct) {
      continue;
    }

    const order = orderByNo.get(product.orderNo);
    if (!order || order.agency !== agency || !order.orderDate) {
      continue;
    }

    const month = `${order.orderDate.getFullYear()}-${String(order.orderDate.getMonth() + 1).padStart(2, "0")}`;
    const current = monthly.get(month) ?? { month, quantity: 0, amount: 0 };

    current.quantity += product.quantity;
    current.amount += product.salesAmount;

    monthly.set(month, current);
  }

  return Array.from(monthly.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function crossSellRatio(dataset: AnalysisDataset, agency: string): { solo: number; crossSell: number } {
  const agencyOrderSet = new Set(agencyOrders(dataset, agency).map((order) => order.orderNo));

  const categoryByOrder = new Map<string, Set<string>>();
  for (const product of dataset.products) {
    if (!agencyOrderSet.has(product.orderNo)) {
      continue;
    }

    const bucket = categoryByOrder.get(product.orderNo) ?? new Set<string>();
    if (product.midCategory) {
      bucket.add(product.midCategory);
    }
    categoryByOrder.set(product.orderNo, bucket);
  }

  let solo = 0;
  let crossSell = 0;

  for (const set of categoryByOrder.values()) {
    if (set.size >= 2) {
      crossSell += 1;
    } else {
      solo += 1;
    }
  }

  return { solo, crossSell };
}

function buildKpis(
  dataset: AnalysisDataset,
  agency: string,
  benchmark: BenchmarkMode,
  growthList: GrowthCustomer[]
): KpiCard[] {
  const orders = agencyOrders(dataset, agency);
  const totalSales = orders.reduce((sum, order) => sum + order.orderAmount, 0);
  const orderCount = orders.length;

  const productsByOrder = new Set(orders.map((order) => order.orderNo));
  const products = dataset.products.filter((product) => productsByOrder.has(product.orderNo));
  const totalProductSales = products.reduce((sum, product) => sum + product.salesAmount, 0);
  const newProductSales = products.filter((product) => product.isNewProduct).reduce((sum, product) => sum + product.salesAmount, 0);
  const newProductRatio = totalProductSales > 0 ? (newProductSales / totalProductSales) * 100 : 0;

  const highPotentialCount = growthList.filter((customer) => customer.highPotential).length;

  const baseline = averageByAgency(dataset, getBaselineAgencies(dataset, benchmark));

  const kpis: KpiCard[] = [
    {
      id: "sales",
      label: "총 매출",
      value: `${formatCurrency(totalSales)}원`,
      delta: safeDelta(baseline.sales, totalSales),
      tone: toneFromDelta(safeDelta(baseline.sales, totalSales))
    },
    {
      id: "orders",
      label: "구매 횟수",
      value: `${formatCurrency(orderCount)}건`,
      delta: safeDelta(baseline.orderCount, orderCount),
      tone: toneFromDelta(safeDelta(baseline.orderCount, orderCount))
    },
    {
      id: "new-product",
      label: "신제품 비중",
      value: `${newProductRatio.toFixed(1)}%`,
      delta: safeDelta(baseline.newProductRatio, newProductRatio),
      tone: toneFromDelta(safeDelta(baseline.newProductRatio, newProductRatio))
    },
    {
      id: "high-potential",
      label: "성장 잠재 고객",
      value: `${formatCurrency(highPotentialCount)}명`,
      delta: 0,
      tone: "neutral"
    }
  ];

  return kpis;
}

export function calculateAnalysis(dataset: AnalysisDataset, agency: string, benchmark: BenchmarkMode): AnalysisResult {
  const growthList = growthCustomers(dataset, agency);
  const regions = regionStatsFromOrders(agencyOrders(dataset, agency));
  const b2bRegions = regionStatsFromOrders(dataset.orders);

  return {
    agency,
    benchmark,
    kpis: buildKpis(dataset, agency, benchmark, growthList),
    b2bRegionAll: b2bRegions.all,
    regionAll: regions.all,
    regionMain: regions.main,
    regionExpansion: regions.expansion,
    growthCustomers: growthList.slice(0, 20),
    monthlyNewProducts: monthlyNewProducts(dataset, agency),
    crossSellRatio: crossSellRatio(dataset, agency)
  };
}
