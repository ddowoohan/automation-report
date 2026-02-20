import type {
  AnalysisDataset,
  AnalysisResult,
  BenchmarkMode,
  CommonRegionIndustry,
  GrowthCustomer,
  GrowthScatterSummary,
  KpiCard,
  MonthlyNewProduct,
  RegionOpportunityStat,
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

interface CustomerMetric {
  bizNo: string;
  customerName: string;
  agency: string;
  firstOrderAmount: number;
  cumulativeAmount: number;
  purchaseCount: number;
  growthMultiplier: number;
}

const MIN_FIRST_ORDER_AMOUNT_FOR_GROWTH_SCATTER = 1_000_000;
const MIN_PURCHASE_COUNT_FOR_GROWTH_SCATTER = 2;

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildCustomerMetrics(dataset: AnalysisDataset): CustomerMetric[] {
  const cumulativeByCustomer = new Map<string, number>();
  const orderCountByCustomer = new Map<string, number>();

  for (const order of dataset.orders) {
    const key = `${order.bizNo}::${order.agency}`;
    cumulativeByCustomer.set(key, (cumulativeByCustomer.get(key) ?? 0) + order.orderAmount);
    orderCountByCustomer.set(key, (orderCountByCustomer.get(key) ?? 0) + 1);
  }

  return dataset.customers.map((customer) => {
    const key = `${customer.bizNo}::${customer.agency}`;
    const cumulativeAmount = cumulativeByCustomer.get(key) ?? 0;
    const purchaseCount = orderCountByCustomer.get(key) ?? 0;
    const growthMultiplier = customer.firstOrderAmount > 0 ? cumulativeAmount / customer.firstOrderAmount : 0;

    return {
      bizNo: customer.bizNo,
      customerName: customer.customerName || customer.bizNo,
      agency: customer.agency,
      firstOrderAmount: customer.firstOrderAmount,
      cumulativeAmount,
      purchaseCount,
      growthMultiplier
    };
  });
}

function growthCustomers(metrics: CustomerMetric[], agency: string): GrowthCustomer[] {
  const agencyMetrics = metrics.filter((metric) => metric.agency === agency);
  const cumulativeValues = agencyMetrics.map((metric) => metric.cumulativeAmount);
  const threshold = percentile(cumulativeValues, 0.7);

  return agencyMetrics
    .map((metric) => {
      const highPotential = metric.growthMultiplier >= 2 && metric.cumulativeAmount >= threshold;
      return {
        bizNo: metric.bizNo,
        customerName: metric.customerName,
        agency: metric.agency,
        firstOrderAmount: metric.firstOrderAmount,
        cumulativeAmount: metric.cumulativeAmount,
        purchaseCount: metric.purchaseCount,
        growthMultiplier: metric.growthMultiplier,
        highPotential
      };
    })
    .sort((a, b) => b.cumulativeAmount - a.cumulativeAmount);
}

function buildGrowthScatter(metrics: CustomerMetric[], agency: string): GrowthScatterSummary {
  const filtered = metrics.filter(
    (metric) => metric.firstOrderAmount >= MIN_FIRST_ORDER_AMOUNT_FOR_GROWTH_SCATTER && metric.purchaseCount >= MIN_PURCHASE_COUNT_FOR_GROWTH_SCATTER
  );

  const points = filtered.map((metric) => ({
    bizNo: metric.bizNo,
    customerName: metric.customerName,
    agency: metric.agency,
    firstOrderAmount: metric.firstOrderAmount,
    cumulativeAmount: metric.cumulativeAmount,
    purchaseCount: metric.purchaseCount,
    growthMultiplier: metric.growthMultiplier,
    isSelectedAgency: metric.agency === agency
  }));

  const selected = points.filter((point) => point.isSelectedAgency);

  return {
    points,
    averageGrowthMultiplier: mean(points.map((point) => point.growthMultiplier)),
    averagePurchaseCount: mean(points.map((point) => point.purchaseCount)),
    selectedAverageGrowthMultiplier: mean(selected.map((point) => point.growthMultiplier)),
    selectedAveragePurchaseCount: mean(selected.map((point) => point.purchaseCount)),
    minFirstOrderAmount: MIN_FIRST_ORDER_AMOUNT_FOR_GROWTH_SCATTER,
    minPurchaseCount: MIN_PURCHASE_COUNT_FOR_GROWTH_SCATTER
  };
}

const REGION_SCOPE_EXTENSIONS: Record<string, string[]> = {
  부산광역시: ["부산광역시", "경상남도"],
  대전광역시: ["대전광역시", "충청북도", "충청남도"],
  대구광역시: ["대구광역시", "경상북도"],
  광주광역시: ["광주광역시", "전라북도", "전라남도"]
};

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function normalizeMetro(value: string): string {
  const normalized = normalizeLabel(value);
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("부산")) return "부산광역시";
  if (normalized.startsWith("대전")) return "대전광역시";
  if (normalized.startsWith("대구")) return "대구광역시";
  if (normalized.startsWith("광주")) return "광주광역시";
  if (normalized.startsWith("서울")) return "서울특별시";
  if (normalized.startsWith("인천")) return "인천광역시";
  if (normalized.startsWith("울산")) return "울산광역시";
  if (normalized.startsWith("세종")) return "세종특별자치시";
  if (normalized.startsWith("경기")) return "경기도";
  if (normalized.startsWith("강원")) return "강원특별자치도";
  if (normalized.startsWith("충북")) return "충청북도";
  if (normalized.startsWith("충남")) return "충청남도";
  if (normalized.startsWith("전북")) return "전라북도";
  if (normalized.startsWith("전남")) return "전라남도";
  if (normalized.startsWith("경북")) return "경상북도";
  if (normalized.startsWith("경남")) return "경상남도";
  if (normalized.startsWith("제주")) return "제주특별자치도";

  return value.trim();
}

function regionLabel(order: AnalysisDataset["orders"][number]): string {
  const city = normalizeMetro(order.city);
  const district = order.district?.trim();
  if (city && district) {
    return `${city} ${district}`;
  }
  return city || district || order.dong || "기타";
}

function regionStatsFromOrders(orders: AnalysisDataset["orders"]): { all: RegionStat[] } {
  const total = orders.reduce((sum, order) => sum + order.orderAmount, 0);
  const grouped = new Map<string, number>();

  for (const order of orders) {
    const region = regionLabel(order);
    grouped.set(region, (grouped.get(region) ?? 0) + order.orderAmount);
  }

  const stats = Array.from(grouped.entries())
    .map(([region, sales]) => ({
      region,
      sales,
      share: total > 0 ? (sales / total) * 100 : 0
    }))
    .sort((a, b) => b.sales - a.sales);

  return { all: stats };
}

function inferAgencyMetro(agency: string, orders: AnalysisDataset["orders"]): string {
  const normalizedAgency = normalizeLabel(agency);
  if (normalizedAgency.includes("부산")) return "부산광역시";
  if (normalizedAgency.includes("대전")) return "대전광역시";
  if (normalizedAgency.includes("대구")) return "대구광역시";
  if (normalizedAgency.includes("광주")) return "광주광역시";

  const citySales = new Map<string, number>();
  for (const order of orders) {
    const city = normalizeMetro(order.city);
    if (!city) {
      continue;
    }
    citySales.set(city, (citySales.get(city) ?? 0) + order.orderAmount);
  }

  return Array.from(citySales.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function scopedMetros(baseMetro: string): Set<string> {
  const scope = REGION_SCOPE_EXTENSIONS[baseMetro] ?? [baseMetro];
  return new Set(scope.map((city) => normalizeMetro(city)));
}

function classifyMemberType(memberType: string): "assigned" | "registered" | "unknown" {
  const normalized = normalizeLabel(memberType);
  if (normalized.includes("배정")) {
    return "assigned";
  }
  if (normalized.includes("등록")) {
    return "registered";
  }
  return "unknown";
}

interface RegionBucket {
  region: string;
  sales: number;
  assignedSales: number;
  registeredSales: number;
  assignedBizNos: Set<string>;
  registeredBizNos: Set<string>;
  industryMap: Map<string, { sales: number; bizNos: Set<string> }>;
}

function toOpportunityStats(bucket: RegionBucket, scopeTotalSales: number): RegionOpportunityStat {
  const assignedCustomerCount = bucket.assignedBizNos.size;
  const registeredCustomerCount = bucket.registeredBizNos.size;

  return {
    region: bucket.region,
    sales: bucket.sales,
    share: scopeTotalSales > 0 ? (bucket.sales / scopeTotalSales) * 100 : 0,
    assignedSales: bucket.assignedSales,
    registeredSales: bucket.registeredSales,
    assignedRegisteredRatio: bucket.registeredSales > 0 ? bucket.assignedSales / bucket.registeredSales : 0,
    assignedCustomerCount,
    registeredCustomerCount,
    customerGap: assignedCustomerCount - registeredCustomerCount
  };
}

function topIndustriesFromBucket(bucket: RegionBucket): CommonRegionIndustry["topIndustries"] {
  const total = bucket.sales;
  return Array.from(bucket.industryMap.entries())
    .map(([industry, values]) => ({
      industry,
      sales: values.sales,
      customerCount: values.bizNos.size,
      share: total > 0 ? (values.sales / total) * 100 : 0
    }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 3);
}

function buildRegionOpportunities(
  dataset: AnalysisDataset,
  agency: string
): {
  regionMain: RegionOpportunityStat[];
  regionExpansion: RegionOpportunityStat[];
  regionRegistrationPotential: RegionOpportunityStat[];
  regionCommonIndustries: CommonRegionIndustry[];
} {
  const selectedAgencyOrders = agencyOrders(dataset, agency);
  const agencyMetro = inferAgencyMetro(agency, selectedAgencyOrders);
  const scope = scopedMetros(agencyMetro);
  const scopedOrders =
    agencyMetro && scope.size > 0
      ? selectedAgencyOrders.filter((order) => scope.has(normalizeMetro(order.city)))
      : selectedAgencyOrders;

  const customersByExact = new Map(dataset.customers.map((customer) => [`${customer.bizNo}::${customer.agency}`, customer]));
  const customersByBiz = new Map<string, AnalysisDataset["customers"][number]>();
  for (const customer of dataset.customers) {
    if (!customersByBiz.has(customer.bizNo)) {
      customersByBiz.set(customer.bizNo, customer);
    }
  }

  const scopeTotalSales = scopedOrders.reduce((sum, order) => sum + order.orderAmount, 0);
  const buckets = new Map<string, RegionBucket>();

  for (const order of scopedOrders) {
    const region = regionLabel(order);
    const bucket = buckets.get(region) ?? {
      region,
      sales: 0,
      assignedSales: 0,
      registeredSales: 0,
      assignedBizNos: new Set<string>(),
      registeredBizNos: new Set<string>(),
      industryMap: new Map<string, { sales: number; bizNos: Set<string> }>()
    };

    bucket.sales += order.orderAmount;

    const customer =
      customersByExact.get(`${order.bizNo}::${order.agency}`) ??
      customersByBiz.get(order.bizNo);
    const memberType = order.memberType || customer?.memberType || "";
    const memberClass = classifyMemberType(memberType);
    if (memberClass === "assigned") {
      bucket.assignedSales += order.orderAmount;
      bucket.assignedBizNos.add(order.bizNo);
    } else if (memberClass === "registered") {
      bucket.registeredSales += order.orderAmount;
      bucket.registeredBizNos.add(order.bizNo);
    }

    const industry = customer?.industryDetail || customer?.industryMajor || "미분류";
    const industryBucket = bucket.industryMap.get(industry) ?? { sales: 0, bizNos: new Set<string>() };
    industryBucket.sales += order.orderAmount;
    industryBucket.bizNos.add(order.bizNo);
    bucket.industryMap.set(industry, industryBucket);

    buckets.set(region, bucket);
  }

  const allStats = Array.from(buckets.values()).map((bucket) => toOpportunityStats(bucket, scopeTotalSales));
  const statsByRegion = new Map(allStats.map((stat) => [stat.region, stat]));

  const regionMain = [...allStats].sort((a, b) => b.sales - a.sales).slice(0, 5);

  const regionExpansion = allStats
    .filter((stat) => stat.assignedRegisteredRatio >= 0.8 && stat.assignedRegisteredRatio <= 1.2 && stat.sales > 0)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  const regionRegistrationPotential = allStats
    .filter((stat) => stat.customerGap > 0)
    .sort((a, b) => b.customerGap - a.customerGap || b.sales - a.sales)
    .slice(0, 5);

  const overlapCounter = new Map<string, number>();
  for (const row of regionMain) overlapCounter.set(row.region, (overlapCounter.get(row.region) ?? 0) + 1);
  for (const row of regionExpansion) overlapCounter.set(row.region, (overlapCounter.get(row.region) ?? 0) + 1);
  for (const row of regionRegistrationPotential) overlapCounter.set(row.region, (overlapCounter.get(row.region) ?? 0) + 1);

  const rankedCommonRegions = Array.from(overlapCounter.entries()).sort((a, b) => {
    const overlapDiff = b[1] - a[1];
    if (overlapDiff !== 0) {
      return overlapDiff;
    }
    return (statsByRegion.get(b[0])?.sales ?? 0) - (statsByRegion.get(a[0])?.sales ?? 0);
  });

  const commonCandidates = rankedCommonRegions.filter(([, count]) => count >= 2);
  const fallbackCandidates = rankedCommonRegions.filter(([, count]) => count < 2);
  const selectedCommon = [...commonCandidates];
  for (const entry of fallbackCandidates) {
    if (selectedCommon.length >= 4) {
      break;
    }
    selectedCommon.push(entry);
  }

  const regionCommonIndustries: CommonRegionIndustry[] = selectedCommon.slice(0, 4).map(([region, overlapCount]) => {
    const bucket = buckets.get(region);
    return {
      region,
      overlapCount,
      totalSales: bucket?.sales ?? 0,
      topIndustries: bucket ? topIndustriesFromBucket(bucket) : []
    };
  });

  return {
    regionMain,
    regionExpansion,
    regionRegistrationPotential,
    regionCommonIndustries
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
  const customerMetrics = buildCustomerMetrics(dataset);
  const growthList = growthCustomers(customerMetrics, agency);
  const growthScatter = buildGrowthScatter(customerMetrics, agency);
  const agencyRegionStats = regionStatsFromOrders(agencyOrders(dataset, agency));
  const b2bRegions = regionStatsFromOrders(dataset.orders);
  const regionOpportunities = buildRegionOpportunities(dataset, agency);

  return {
    agency,
    benchmark,
    kpis: buildKpis(dataset, agency, benchmark, growthList),
    b2bRegionAll: b2bRegions.all,
    regionAll: agencyRegionStats.all,
    regionMain: regionOpportunities.regionMain,
    regionExpansion: regionOpportunities.regionExpansion,
    regionRegistrationPotential: regionOpportunities.regionRegistrationPotential,
    regionCommonIndustries: regionOpportunities.regionCommonIndustries,
    growthCustomers: growthList.slice(0, 20),
    growthScatter,
    monthlyNewProducts: monthlyNewProducts(dataset, agency),
    crossSellRatio: crossSellRatio(dataset, agency)
  };
}
