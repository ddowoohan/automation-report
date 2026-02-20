export type BenchmarkMode = "overall" | "club1000";

export interface PreparedOrder {
  orderNo: string;
  bizNo: string;
  agency: string;
  memberType: string;
  orderAmount: number;
  orderDate: Date | null;
  city: string;
  district: string;
  dong: string;
}

export interface PreparedCustomer {
  bizNo: string;
  agency: string;
  customerName: string;
  memberType: string;
  industryMajor: string;
  industryDetail: string;
  firstOrderAmount: number;
}

export interface PreparedProduct {
  orderNo: string;
  midCategory: string;
  quantity: number;
  salesAmount: number;
  isNewProduct: boolean;
}

export interface AnalysisDataset {
  orders: PreparedOrder[];
  customers: PreparedCustomer[];
  products: PreparedProduct[];
}

export interface KpiCard {
  id: string;
  label: string;
  value: string;
  delta: number;
  tone: "up" | "down" | "neutral";
}

export interface RegionStat {
  region: string;
  sales: number;
  share: number;
}

export interface RegionOpportunityStat extends RegionStat {
  assignedSales: number;
  registeredSales: number;
  assignedRegisteredRatio: number;
  assignedCustomerCount: number;
  registeredCustomerCount: number;
  customerGap: number;
}

export interface RegionIndustryStat {
  industry: string;
  sales: number;
  customerCount: number;
  share: number;
}

export interface CommonRegionIndustry {
  region: string;
  overlapCount: number;
  totalSales: number;
  topIndustries: RegionIndustryStat[];
}

export interface GrowthCustomer {
  bizNo: string;
  customerName: string;
  agency: string;
  firstOrderAmount: number;
  cumulativeAmount: number;
  purchaseCount: number;
  growthMultiplier: number;
  highPotential: boolean;
}

export interface GrowthScatterPoint {
  bizNo: string;
  customerName: string;
  agency: string;
  firstOrderAmount: number;
  cumulativeAmount: number;
  purchaseCount: number;
  growthMultiplier: number;
  isSelectedAgency: boolean;
}

export interface GrowthScatterSummary {
  points: GrowthScatterPoint[];
  averageGrowthMultiplier: number;
  averagePurchaseCount: number;
  selectedAverageGrowthMultiplier: number;
  selectedAveragePurchaseCount: number;
  minFirstOrderAmount: number;
  minPurchaseCount: number;
}

export interface MonthlyNewProduct {
  month: string;
  quantity: number;
  amount: number;
}

export interface AnalysisResult {
  agency: string;
  benchmark: BenchmarkMode;
  kpis: KpiCard[];
  b2bRegionAll: RegionStat[];
  regionAll: RegionStat[];
  regionMain: RegionOpportunityStat[];
  regionExpansion: RegionOpportunityStat[];
  regionRegistrationPotential: RegionOpportunityStat[];
  regionCommonIndustries: CommonRegionIndustry[];
  growthCustomers: GrowthCustomer[];
  growthScatter: GrowthScatterSummary;
  monthlyNewProducts: MonthlyNewProduct[];
  crossSellRatio: {
    solo: number;
    crossSell: number;
  };
}
