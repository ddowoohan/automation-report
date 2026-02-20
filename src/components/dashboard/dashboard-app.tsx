"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, FileDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AnalysisResult, BenchmarkMode } from "@/types/domain";

interface UploadResponse {
  sessionId: string;
  agencies: string[];
  counts: {
    orders: number;
    customers: number;
    products: number;
  };
}

interface AnalyzeResponse {
  analysis: AnalysisResult;
}

type InsightMessage = { role: "assistant" | "user"; content: string };

interface InsightResponse {
  presetId?: string;
  messages: InsightMessage[];
}

interface InsightBatchResponse {
  results: InsightResponse[];
}

interface GrowthSegmentTopCustomer {
  name: string;
  reason: string;
}

interface GrowthSegmentRow {
  segment: "성장형 고객" | "전환 관리형 고객" | "유지·관계형 고객";
  criteria: string[];
  traits: string[];
  interpretation: string[];
  salesDirection: string[];
  topCustomers: GrowthSegmentTopCustomer[];
}

interface GrowthSegmentResponse {
  rows: GrowthSegmentRow[];
}

interface LoadDefaultResponse extends UploadResponse {
  defaultFiles?: {
    orders: string;
    customers: string;
    products: string;
  };
}

const RegionSalesMap = dynamic(
  () => import("@/components/dashboard/region-sales-map").then((module) => module.RegionSalesMap),
  {
    ssr: false,
    loading: () => <div className="flex h-[460px] items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">지도 로딩 중...</div>
  }
);

const GrowthCustomerScatter = dynamic(
  () => import("@/components/dashboard/growth-customer-scatter").then((module) => module.GrowthCustomerScatter),
  {
    ssr: false,
    loading: () => <div className="flex h-[460px] items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">차트 로딩 중...</div>
  }
);

export function DashboardApp() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agencies, setAgencies] = useState<string[]>([]);
  const [selectedAgency, setSelectedAgency] = useState<string>("");
  const [benchmark, setBenchmark] = useState<BenchmarkMode>("overall");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [growthSegmentBusy, setGrowthSegmentBusy] = useState(false);
  const [growthSegmentRows, setGrowthSegmentRows] = useState<GrowthSegmentRow[]>([]);
  const [defaultDataLabel, setDefaultDataLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analysisRequestKeyRef = useRef<string>("");
  const insightBatchKeyRef = useRef<string>("");
  const growthSegmentKeyRef = useRef<string>("");
  const hasAnalysis = Boolean(analysis);
  type SectionId = "geo" | "region" | "regionCommon" | "growth" | "monthly" | "weakProduct" | "strongProduct";
  type MessageKind = "interpretation" | "insight";
  type InsightPresetId =
    | "geo_interpretation"
    | "geo_insight"
    | "region_interpretation"
    | "region_insight"
    | "region_common_industry_insight"
    | "growth_interpretation"
    | "cross_sell_interpretation"
    | "weak_products_interpretation"
    | "strong_products_interpretation";
  interface PresetBinding {
    section: SectionId;
    kind: MessageKind;
    presetId: InsightPresetId;
  }
  const PRESET_BINDINGS: PresetBinding[] = [
    { section: "geo", kind: "interpretation", presetId: "geo_interpretation" },
    { section: "geo", kind: "insight", presetId: "geo_insight" },
    { section: "region", kind: "interpretation", presetId: "region_interpretation" },
    { section: "region", kind: "insight", presetId: "region_insight" },
    { section: "regionCommon", kind: "insight", presetId: "region_common_industry_insight" },
    { section: "monthly", kind: "interpretation", presetId: "cross_sell_interpretation" },
    { section: "weakProduct", kind: "interpretation", presetId: "weak_products_interpretation" },
    { section: "strongProduct", kind: "interpretation", presetId: "strong_products_interpretation" }
  ];
  const EMPTY_MESSAGES: Record<SectionId, InsightMessage[]> = {
    geo: [],
    region: [],
    regionCommon: [],
    growth: [],
    monthly: [],
    weakProduct: [],
    strongProduct: []
  };
  const [interpretationMessagesBySection, setInterpretationMessagesBySection] =
    useState<Record<SectionId, InsightMessage[]>>({ ...EMPTY_MESSAGES });
  const [insightMessagesBySection, setInsightMessagesBySection] = useState<Record<SectionId, InsightMessage[]>>({ ...EMPTY_MESSAGES });

  const regionMainTop5 = useMemo(() => analysis?.regionMain.slice(0, 5) ?? [], [analysis]);
  const regionExpansionTop5 = useMemo(() => analysis?.regionExpansion.slice(0, 5) ?? [], [analysis]);
  const regionRegistrationPotentialTop5 = useMemo(() => analysis?.regionRegistrationPotential.slice(0, 5) ?? [], [analysis]);
  const regionCommonIndustryTop = useMemo(() => analysis?.regionCommonIndustries.slice(0, 4) ?? [], [analysis]);

  const geoInterpretationLines = useMemo(() => {
    if (!analysis) {
      return [
        "기본 데이터를 불러오면 대리점별 지역 매출 집중도 해석이 표시됩니다.",
        "핵심 권역과 확장 권역을 분리해 읽을 수 있도록 구성됩니다."
      ];
    }

    const top = analysis.regionMain[0];
    const second = analysis.regionMain[1];
    const b2bTop = analysis.b2bRegionAll[0];
    const highPotentialCount = analysis.growthCustomers.filter((customer) => customer.highPotential).length;

    const topText = top ? `${top.region} (${top.share.toFixed(1)}%)` : "주요 권역";
    const secondText = second ? `${second.region} (${second.share.toFixed(1)}%)` : "차순위 권역";
    const b2bTopText = b2bTop ? `${b2bTop.region} (${b2bTop.share.toFixed(1)}%)` : "전체 기준 주요 권역";

    return [
      `전체 B2B 기준 주요 권역은 ${b2bTopText}이며, ${analysis.agency}는 ${topText}, ${secondText} 중심으로 형성되어 있습니다.`,
      `반복 구매 기반은 안정적이며, 현재 성장 잠재 고객은 ${highPotentialCount}명으로 집계됩니다.`
    ];
  }, [analysis]);

  const geoInsightItems = useMemo(() => {
    if (!analysis) {
      return [
        "핵심 권역 유지 전략과 확장 권역 전환 전략을 분리해 수립합니다.",
        "고성장 고객군을 우선 타겟으로 제안 빈도를 높입니다.",
        "성과는 신규수보다 재구매율/전환율 지표로 추적합니다."
      ];
    }

    const expansionTargets = analysis.regionExpansion
      .slice(0, 3)
      .map((region) => region.region)
      .filter(Boolean);
    const targetText = expansionTargets.length > 0 ? expansionTargets.join(", ") : "저비중 권역";
    const highPotentialCount = analysis.growthCustomers.filter((customer) => customer.highPotential).length;

    return [
      `${targetText} 권역은 단기 매출보다 첫 구매 경험 축적과 재접촉 캠페인 중심으로 운영합니다.`,
      `성장 잠재 고객 ${highPotentialCount}명을 기준으로 신제품+연관품목 동시 제안 시나리오를 적용합니다.`,
      "영업 관점은 '이미 장악한 지역'보다 '확장 여지가 남은 권역'의 전환률 개선에 둡니다."
    ];
  }, [analysis]);

  const regionInterpretationLines = useMemo(() => {
    if (!analysis) {
      return [
        "핵심비중/추가매출/등록회원 확장 지역을 함께 보면 실행 우선순위를 나눌 수 있습니다.",
        "공통으로 반복 노출되는 지역은 단기 실행 타깃으로 해석할 수 있습니다."
      ];
    }

    const main = regionMainTop5[0];
    const expansion = regionExpansionTop5[0];
    const registration = regionRegistrationPotentialTop5[0];
    const commonTop = regionCommonIndustryTop[0];

    return [
      `핵심비중 1위는 ${main ? `${main.region} (${main.share.toFixed(1)}%)` : "데이터 없음"}입니다.`,
      `추가 매출 발생 가능 1순위는 ${expansion ? `${expansion.region} (배정/등록 비율 ${expansion.assignedRegisteredRatio.toFixed(2)})` : "데이터 없음"}입니다.`,
      `등록회원 추가 가능 1순위는 ${registration ? `${registration.region} (고객수 격차 ${registration.customerGap})` : "데이터 없음"}입니다.`,
      `공통 후보 상위 지역은 ${commonTop ? `${commonTop.region} (중복 ${commonTop.overlapCount}회)` : "데이터 없음"}입니다.`
    ];
  }, [analysis, regionMainTop5, regionExpansionTop5, regionRegistrationPotentialTop5, regionCommonIndustryTop]);

  const regionInsightItems = useMemo(() => {
    if (!analysis) {
      return [
        "핵심비중 지역은 유지, 추가매출 가능 지역은 전환, 등록회원 확장 지역은 풀 확장 전략으로 운영합니다.",
        "공통 지역은 업종 맞춤형 제안으로 단기 실행 우선순위를 높입니다.",
        "지역군별 KPI를 분리해 주간 단위로 추적합니다."
      ];
    }

    const mainNames = regionMainTop5.slice(0, 2).map((region) => region.region).join(", ") || "핵심 지역";
    const expansionNames = regionExpansionTop5.slice(0, 2).map((region) => region.region).join(", ") || "추가 매출 지역";
    const registrationNames =
      regionRegistrationPotentialTop5.slice(0, 2).map((region) => region.region).join(", ") || "등록회원 확장 지역";

    return [
      `${mainNames}는 재구매/교체 수요 중심 제안으로 점유율을 유지합니다.`,
      `${expansionNames}는 배정/등록 균형 구간이라 업종별 패키지 제안으로 매출 확장을 노립니다.`,
      `${registrationNames}는 등록회원 전환 캠페인으로 고객 풀을 넓히는 전략이 유효합니다.`
    ];
  }, [analysis, regionExpansionTop5, regionMainTop5, regionRegistrationPotentialTop5]);

  const growthScatter = analysis?.growthScatter;
  const growthScatterPoints = growthScatter?.points ?? [];
  const selectedGrowthPoints = useMemo(
    () => growthScatterPoints.filter((point) => point.isSelectedAgency),
    [growthScatterPoints]
  );
  const otherGrowthPoints = useMemo(
    () => growthScatterPoints.filter((point) => !point.isSelectedAgency),
    [growthScatterPoints]
  );

  function quantile(values: number[], q: number): number {
    if (values.length === 0) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)));
    return sorted[index];
  }

  const growthOverallInterpretationLines = useMemo(() => {
    if (!growthScatter || otherGrowthPoints.length === 0) {
      return [
        "필터 조건(최초주문금액 100만원 이상, 구매횟수 2회 이상)에 해당하는 전체 고객 분포가 없습니다.",
        "조건을 완화하거나 데이터 적재 상태를 확인해주세요."
      ];
    }

    const avgX = growthScatter.averageGrowthMultiplier;
    const avgY = growthScatter.averagePurchaseCount;
    const lowerLeftCount = otherGrowthPoints.filter(
      (point) => point.growthMultiplier <= avgX && point.purchaseCount <= avgY
    ).length;
    const lowerLeftRatio = lowerLeftCount / otherGrowthPoints.length;

    const cumulativeAmounts = otherGrowthPoints.map((point) => point.cumulativeAmount);
    const medianAmount = quantile(cumulativeAmounts, 0.5);
    const largeAmountThreshold = quantile(cumulativeAmounts, 0.9);
    const standoutRatio =
      otherGrowthPoints.filter((point) => point.cumulativeAmount >= largeAmountThreshold).length / otherGrowthPoints.length;

    const longTailThreshold = Math.max(avgX * 2, 10);
    const longTailRatio =
      otherGrowthPoints.filter((point) => point.growthMultiplier >= longTailThreshold).length / otherGrowthPoints.length;
    const bubbleSpread = medianAmount > 0 ? largeAmountThreshold / medianAmount : 1;

    return [
      lowerLeftRatio >= 0.55
        ? "회색 원은 평균선 좌하단에 비교적 밀집해 있어, 다수 고객이 초기 재구매 구간에서 관계가 형성되는 패턴입니다."
        : "회색 원이 평균선 주변으로 퍼져 있어, 고객 성장 단계가 한 구간에만 몰리지 않고 분산된 구조입니다.",
      bubbleSpread >= 3
        ? "원 크기는 작은 버블이 넓게 깔린 상태에서 일부 대형 버블이 섞인 롱테일 형태로 보입니다."
        : "원 크기가 중간 규모 중심으로 형성되어 특정 초대형 고객 의존도가 과도하게 높지는 않은 구조입니다.",
      longTailRatio >= 0.1
        ? "x축 분포가 우측으로 길게 늘어져, 일부 고객에서 초기 주문 대비 누적금액이 크게 확장된 흐름이 관찰됩니다."
        : "x축 분포는 평균선 인근에 상대적으로 모여 있어 급격한 성장보다 안정적 확장 흐름이 중심입니다.",
      standoutRatio >= 0.08
        ? "대형 버블이 산발적으로 보여 소수 핵심 고객이 매출의 질을 끌어올리는 형태가 함께 나타납니다."
        : "버블 크기 편차가 과도하지 않아 전반적으로 완만한 고객 포트폴리오로 해석할 수 있습니다."
    ];
  }, [growthScatter, otherGrowthPoints]);

  const growthSelectedInterpretationLines = useMemo(() => {
    if (!analysis || !growthScatter || selectedGrowthPoints.length === 0) {
      return [
        "선택된 대리점 고객(빨간 원)이 필터 조건에 맞지 않거나 데이터가 없습니다.",
        "대리점을 변경하거나 필터 조건/원천 데이터를 확인해주세요."
      ];
    }

    const selectedAvgX = growthScatter.selectedAverageGrowthMultiplier;
    const selectedAvgY = growthScatter.selectedAveragePurchaseCount;
    const nearMeanCount = selectedGrowthPoints.filter(
      (point) =>
        Math.abs(point.growthMultiplier - selectedAvgX) <= Math.max(selectedAvgX * 0.5, 1) &&
        Math.abs(point.purchaseCount - selectedAvgY) <= Math.max(selectedAvgY * 0.5, 1)
    ).length;
    const nearMeanRatio = nearMeanCount / selectedGrowthPoints.length;

    const extremeRatio =
      selectedGrowthPoints.filter(
      (point) => point.growthMultiplier >= selectedAvgX * 2 || point.purchaseCount >= selectedAvgY * 2
      ).length / selectedGrowthPoints.length;
    const aboveMeanRatio =
      selectedGrowthPoints.filter(
      (point) => point.growthMultiplier >= selectedAvgX && point.purchaseCount >= selectedAvgY
      ).length / selectedGrowthPoints.length;

    return [
      nearMeanRatio >= 0.5
        ? `${analysis.agency}의 빨간 원은 평균선 부근에 주로 모여 있어 급격한 스파이크보다 안정적인 재구매형 포트폴리오 성격이 강합니다.`
        : `${analysis.agency}의 빨간 원은 평균선 주변과 외곽이 함께 보여, 유지형과 성장형이 혼합된 분포를 보입니다.`,
      aboveMeanRatio >= 0.25
        ? "우상단으로 이동한 점들이 함께 보여 평균 구간을 넘어서는 성장 후보군이 분명히 존재합니다."
        : "평균선을 동시에 넘는 점은 제한적이어서, 현재는 유지형 관리와 전환형 육성의 균형이 중요한 구간입니다.",
      extremeRatio >= 0.15
        ? "외곽 구간의 점도 일부 보여 특정 고객에서 확장 시그널이 강하게 나타나는 모습입니다."
        : "극단 구간 점이 많지 않아 전체적으로 완만한 상승 흐름을 유지하는 패턴에 가깝습니다.",
      "운영 관점에서는 평균선 인접 고객의 관계 유지와, 우상향 이동 고객의 추가 제안을 분리 운영하는 방식이 적합합니다."
    ];
  }, [analysis, growthScatter, selectedGrowthPoints]);

  const crossSellTotal = (analysis?.crossSellRatio.solo ?? 0) + (analysis?.crossSellRatio.crossSell ?? 0);
  const crossSellRatioPercent = crossSellTotal > 0 ? ((analysis?.crossSellRatio.crossSell ?? 0) / crossSellTotal) * 100 : 0;

  const crossSellInterpretationLines = useMemo(() => {
    if (!analysis) {
      return [
        "선택 대리점의 단독구매/동시구매 비중을 통해 크로스셀링 성숙도를 확인합니다.",
        "크로스셀링 비중이 높을수록 제품 조합 제안의 효율이 높다고 해석할 수 있습니다."
      ];
    }

    return [
      `${analysis.agency}의 동시구매 비중은 ${crossSellRatioPercent.toFixed(1)}%입니다.`,
      `현재 동시구매 ${analysis.crossSellRatio.crossSell}건, 단독구매 ${analysis.crossSellRatio.solo}건으로 집계됩니다.`
    ];
  }, [analysis, crossSellRatioPercent]);

  const growthSegmentByName = useMemo(() => {
    const rowMap = new Map(growthSegmentRows.map((row) => [row.segment, row]));
    return {
      growth: rowMap.get("성장형 고객"),
      transition: rowMap.get("전환 관리형 고객"),
      retention: rowMap.get("유지·관계형 고객")
    };
  }, [growthSegmentRows]);

  const weakProductsPlaceholder = [
    "제품 데이터 연동 예정 (예: 모션데스크 라인)",
    "제품 데이터 연동 예정 (예: 수납장 라인)",
    "제품 데이터 연동 예정 (예: 파티션 라인)"
  ];

  const strongProductsPlaceholder = [
    "제품 데이터 연동 예정 (예: 의자 라인)",
    "제품 데이터 연동 예정 (예: 테이블 라인)",
    "제품 데이터 연동 예정 (예: 액세서리 라인)"
  ];

  const productComparisonSampleRows = [
    { product: "샘플 제품 A", mate: 46, club: 70 },
    { product: "샘플 제품 B", mate: 58, club: 52 },
    { product: "샘플 제품 C", mate: 34, club: 63 }
  ];

  function resetAiSections() {
    setInterpretationMessagesBySection({ ...EMPTY_MESSAGES });
    setInsightMessagesBySection({ ...EMPTY_MESSAGES });
    setGrowthSegmentRows([]);
  }

  function applyMessagesByPreset(presetId: string, messages: InsightMessage[]) {
    const binding = PRESET_BINDINGS.find((item) => item.presetId === presetId);
    if (!binding) {
      return;
    }

    if (binding.kind === "interpretation") {
      setInterpretationMessagesBySection((prev) => ({ ...prev, [binding.section]: messages }));
      return;
    }

    setInsightMessagesBySection((prev) => ({ ...prev, [binding.section]: messages }));
  }

  function buildAnalysisSnapshot(currentAnalysis: AnalysisResult, presetId: InsightPresetId): Record<string, unknown> {
    const base = {
      agency: currentAnalysis.agency,
      benchmark: currentAnalysis.benchmark,
      kpis: currentAnalysis.kpis
    };

    switch (presetId) {
      case "geo_interpretation":
      case "geo_insight":
        return {
          ...base,
          b2bRegionTop5: currentAnalysis.b2bRegionAll.slice(0, 5),
          agencyRegionTop5: currentAnalysis.regionAll.slice(0, 5),
          expansionTop5: currentAnalysis.regionExpansion.slice(0, 5)
        };
      case "region_interpretation":
      case "region_insight":
        return {
          ...base,
          regionMainTop5: currentAnalysis.regionMain.slice(0, 5),
          regionExpansionTop5: currentAnalysis.regionExpansion.slice(0, 5),
          regionRegistrationPotentialTop5: currentAnalysis.regionRegistrationPotential.slice(0, 5),
          regionCommonIndustries: currentAnalysis.regionCommonIndustries.slice(0, 4)
        };
      case "region_common_industry_insight":
        return {
          ...base,
          regionMainTop5: currentAnalysis.regionMain.slice(0, 5),
          regionExpansionTop5: currentAnalysis.regionExpansion.slice(0, 5),
          regionRegistrationPotentialTop5: currentAnalysis.regionRegistrationPotential.slice(0, 5),
          regionCommonIndustries: currentAnalysis.regionCommonIndustries.slice(0, 4)
        };
      case "growth_interpretation":
        return {
          ...base,
          growthScatter: currentAnalysis.growthScatter,
          growthTopCustomers: currentAnalysis.growthCustomers.slice(0, 10)
        };
      case "cross_sell_interpretation":
        return {
          ...base,
          crossSellRatio: currentAnalysis.crossSellRatio
        };
      case "weak_products_interpretation":
      case "strong_products_interpretation":
        return {
          ...base,
          productComparisonSampleRows
        };
      default:
        return base;
    }
  }

  async function requestSinglePreset(binding: PresetBinding, currentAnalysis: AnalysisResult) {
    setAiBusy(true);
    try {
      const response = await fetch("/api/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency: currentAnalysis.agency,
          benchmark: currentAnalysis.benchmark,
          presetId: binding.presetId,
          analysisSnapshot: buildAnalysisSnapshot(currentAnalysis, binding.presetId)
        })
      });

      const payload = (await response.json()) as InsightResponse & { error?: string };
      if (!response.ok || !payload.messages) {
        throw new Error(payload.error || "AI 생성 실패");
      }

      applyMessagesByPreset(binding.presetId, payload.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 생성 오류");
    } finally {
      setAiBusy(false);
    }
  }

  async function requestBatchPresets(currentAnalysis: AnalysisResult, requestKey: string) {
    setAiBusy(true);
    try {
      const response = await fetch("/api/insight/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: PRESET_BINDINGS.map((binding) => ({
            agency: currentAnalysis.agency,
            benchmark: currentAnalysis.benchmark,
            presetId: binding.presetId,
            analysisSnapshot: buildAnalysisSnapshot(currentAnalysis, binding.presetId)
          }))
        })
      });

      const payload = (await response.json()) as InsightBatchResponse & { error?: string };
      if (!response.ok || !payload.results) {
        throw new Error(payload.error || "배치 AI 생성 실패");
      }

      if (insightBatchKeyRef.current !== requestKey) {
        return;
      }

      payload.results.forEach((result) => {
        if (!result.presetId || !result.messages) {
          return;
        }
        applyMessagesByPreset(result.presetId, result.messages);
      });
    } catch (err) {
      if (insightBatchKeyRef.current === requestKey) {
        setError(err instanceof Error ? err.message : "배치 AI 생성 오류");
      }
    } finally {
      if (insightBatchKeyRef.current === requestKey) {
        setAiBusy(false);
      }
    }
  }

  async function requestGrowthSegments(currentAnalysis: AnalysisResult, requestKey: string) {
    setGrowthSegmentBusy(true);
    try {
      const selectedPoints = currentAnalysis.growthScatter.points
        .filter((point) => point.isSelectedAgency)
        .map((point) => ({
          bizNo: point.bizNo,
          customerName: point.customerName || point.bizNo,
          cumulativeAmount: point.cumulativeAmount,
          purchaseCount: point.purchaseCount,
          growthMultiplier: point.growthMultiplier
        }));

      const response = await fetch("/api/insight/growth-segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency: currentAnalysis.agency,
          benchmark: currentAnalysis.benchmark,
          averageGrowthMultiplier: currentAnalysis.growthScatter.averageGrowthMultiplier,
          averagePurchaseCount: currentAnalysis.growthScatter.averagePurchaseCount,
          selectedAverageGrowthMultiplier: currentAnalysis.growthScatter.selectedAverageGrowthMultiplier,
          selectedAveragePurchaseCount: currentAnalysis.growthScatter.selectedAveragePurchaseCount,
          selectedPoints
        })
      });

      const payload = (await response.json()) as GrowthSegmentResponse & { error?: string };
      if (!response.ok || !Array.isArray(payload.rows)) {
        throw new Error(payload.error || "성장 고객군 표 생성 실패");
      }

      if (growthSegmentKeyRef.current !== requestKey) {
        return;
      }
      setGrowthSegmentRows(payload.rows);
    } catch (err) {
      if (growthSegmentKeyRef.current === requestKey) {
        setError(err instanceof Error ? err.message : "성장 고객군 표 생성 오류");
      }
    } finally {
      if (growthSegmentKeyRef.current === requestKey) {
        setGrowthSegmentBusy(false);
      }
    }
  }

  function getPresetBinding(section: SectionId, kind: MessageKind): PresetBinding | null {
    return PRESET_BINDINGS.find((binding) => binding.section === section && binding.kind === kind) ?? null;
  }

  function triggerSingle(section: SectionId, kind: MessageKind) {
    if (!analysis) {
      return;
    }
    const binding = getPresetBinding(section, kind);
    if (!binding) {
      return;
    }
    void requestSinglePreset(binding, analysis);
  }

  function triggerBatch() {
    if (!analysis || !sessionId || !selectedAgency) {
      return;
    }
    const requestKey = `${sessionId}|${selectedAgency}|${benchmark}|manual|${Date.now()}`;
    insightBatchKeyRef.current = requestKey;
    growthSegmentKeyRef.current = requestKey;
    void requestGrowthSegments(analysis, requestKey);
    void requestBatchPresets(analysis, requestKey);
  }

  useEffect(() => {
    if (!sessionId || !selectedAgency) {
      return;
    }
    const currentSessionId = sessionId;
    const currentAgency = selectedAgency;

    const requestKey = `${currentSessionId}|${currentAgency}|${benchmark}`;
    if (analysisRequestKeyRef.current === requestKey) {
      return;
    }
    analysisRequestKeyRef.current = requestKey;

    let cancelled = false;

    async function run() {
      try {
        setBusy(true);
        setError(null);
        const nextAnalysis = await runAnalysis(currentSessionId, currentAgency, benchmark);
        if (cancelled) {
          return;
        }
        setAnalysis(nextAnalysis);
        resetAiSections();
        insightBatchKeyRef.current = requestKey;
        growthSegmentKeyRef.current = requestKey;
        void requestGrowthSegments(nextAnalysis, requestKey);
        void requestBatchPresets(nextAnalysis, requestKey);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "분석 오류";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [sessionId, selectedAgency, benchmark]);

  async function applyLoadedSession(payload: UploadResponse) {
    setSessionId(payload.sessionId);
    setAgencies(payload.agencies);

    const nextAgency = payload.agencies.includes(selectedAgency) ? selectedAgency : payload.agencies[0] ?? "";
    setSelectedAgency(nextAgency);
  }

  async function loadDefaultCsvs() {
    try {
      setBusy(true);
      setCsvLoading(true);
      setError(null);

      const response = await fetch("/api/load-default", {
        method: "POST"
      });
      const payload = (await response.json()) as LoadDefaultResponse & { error?: string };

      if (!response.ok || !payload.sessionId) {
        throw new Error(payload.error || "기본 데이터 로드에 실패했습니다.");
      }

      await applyLoadedSession(payload);

      if (payload.defaultFiles) {
        setDefaultDataLabel(
          `기본 데이터 로드됨: ${payload.defaultFiles.orders}, ${payload.defaultFiles.customers}, ${payload.defaultFiles.products}`
        );
      } else {
        setDefaultDataLabel("기본 데이터 로드됨");
      }
    } catch (err) {
      setDefaultDataLabel(null);
      setError(err instanceof Error ? err.message : "기본 데이터 로드 오류");
    } finally {
      setCsvLoading(false);
      setBusy(false);
    }
  }

  async function runAnalysis(currentSession: string, agency: string, currentBenchmark: BenchmarkMode): Promise<AnalysisResult> {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: currentSession,
        agency,
        benchmark: currentBenchmark
      })
    });

    const payload = (await response.json()) as AnalyzeResponse & { error?: string };

    if (!response.ok || !payload.analysis) {
      throw new Error(payload.error || "분석 실패");
    }

    return payload.analysis;
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1240px] bg-stone-50 p-4 md:p-8">
      {csvLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-lg border bg-white px-5 py-4 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm font-semibold">CSV 로딩 및 전처리 중...</p>
          </div>
        </div>
      ) : null}

      <section className="mb-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm md:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Sales Strategy Report</p>
        <div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900 md:text-4xl">DESKER 영업 전략 리포트</h1>
          <p className="mt-2 text-sm text-stone-500">보고서 흐름: 시각화 → 데이터 해석 → 영업 인사이트</p>
        </div>
      </section>

      <Card className="mb-8 border-stone-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>리포트 입력 조건</CardTitle>
          <CardDescription>기본 데이터를 다시 로드한 뒤 대리점/비교기준을 선택하면 보고서 섹션이 갱신됩니다.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[220px_1fr_1fr_220px]">
          <Button variant="secondary" className="w-full" onClick={loadDefaultCsvs} disabled={busy}>
            기본 데이터 다시 불러오기
          </Button>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">대리점 선택</p>
            <Select value={selectedAgency} onValueChange={(value) => setSelectedAgency(value)}>
              <SelectTrigger>
                <SelectValue placeholder="대리점 선택" />
              </SelectTrigger>
              <SelectContent>
                {agencies.map((agency) => (
                  <SelectItem key={agency} value={agency}>
                    {agency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">비교 기준</p>
            <Select value={benchmark} onValueChange={(value) => setBenchmark(value as BenchmarkMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overall">전체 평균</SelectItem>
                <SelectItem value="club1000">Club 1000 평균</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="ghost" className="gap-2" disabled>
            <FileDown className="h-4 w-4" /> PDF 다운로드 (Phase 4)
          </Button>

          <div className="flex items-center gap-2 md:col-span-4">
            <Button variant="secondary" className="gap-2" onClick={triggerBatch} disabled={busy || aiBusy || growthSegmentBusy || !analysis}>
              {aiBusy || growthSegmentBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              AI 해석/인사이트 일괄 생성
            </Button>
            {aiBusy || growthSegmentBusy ? <p className="text-xs text-muted-foreground">AI 문구/고객군 표를 생성 중입니다...</p> : null}
          </div>

          {defaultDataLabel ? <p className="text-xs text-teal-700 md:col-span-4">{defaultDataLabel}</p> : null}
          {error ? <p className="text-sm text-red-600 md:col-span-4">{error}</p> : null}
        </CardContent>
      </Card>

      <section className="mb-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">0</span>
          <h2 className="text-xl font-semibold text-stone-900 md:text-2xl">요약 KPI</h2>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
          {(analysis?.kpis ?? []).map((kpi, idx) => (
            <motion.div
              key={kpi.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>{kpi.label}</CardDescription>
                  <CardTitle className="text-xl">{kpi.value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className={`text-xs ${
                      kpi.tone === "up" ? "text-teal-700" : kpi.tone === "down" ? "text-orange-700" : "text-muted-foreground"
                    }`}
                  >
                    비교 대비 {kpi.delta.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {!hasAnalysis ? (
            <Card className="md:col-span-2 xl:col-span-4">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">기본 데이터를 로드하면 KPI 요약이 표시됩니다.</CardContent>
            </Card>
          ) : null}
        </motion.div>
      </section>

      <section className="space-y-8 pb-8">
        <Card className="border-stone-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-stone-900">
              <BarChart3 className="h-4 w-4" /> 1. 지역별 매출 분포 (Geographic View)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">1-1. 시각화</p>
              <RegionSalesMap overallStats={analysis?.b2bRegionAll ?? []} agencyStats={analysis?.regionAll ?? []} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
                <p className="mb-2 text-sm font-semibold text-amber-900">1-2. 데이터 해석 (GPT Pro 활용)</p>
                <div className="space-y-2 text-sm text-amber-950">
                  {geoInterpretationLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
                <div className="mt-3">
                  <Button variant="secondary" disabled={busy || aiBusy || !analysis} onClick={() => triggerSingle("geo", "interpretation")}>
                    {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "해석 다시 생성"}
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {interpretationMessagesBySection.geo.map((msg, idx) => (
                    <div key={`${msg.role}-geo-${idx}`} className="rounded-md border bg-white px-3 py-2 text-sm">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{msg.role === "assistant" ? "AI" : "사용자"}</p>
                      <p>{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-indigo-300 bg-indigo-50/60 p-4">
                <p className="mb-2 text-sm font-semibold text-indigo-900">1-3. 인사이트 (GPT Pro 활용)</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-indigo-950">
                  {geoInsightItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="mt-3">
                  <Button variant="secondary" disabled={busy || aiBusy || !analysis} onClick={() => triggerSingle("geo", "insight")}>
                    {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "인사이트 다시 생성"}
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {insightMessagesBySection.geo.map((msg, idx) => (
                    <div key={`${msg.role}-geo-insight-${idx}`} className="rounded-md border bg-white px-3 py-2 text-sm">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{msg.role === "assistant" ? "AI" : "사용자"}</p>
                      <p>{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-stone-900">2. 핵심비중 / 추가 매출 / 등록회원 확장 지역 분석</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">2-1. 시각화</p>
              <div className="grid gap-4 xl:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">핵심비중 TOP 5</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {regionMainTop5.map((row) => (
                      <div key={row.region} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>{row.region}</span>
                          <span>{row.sales.toLocaleString("ko-KR")}원</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(row.share, 100)}%` }} />
                        </div>
                      </div>
                    ))}
                    {!regionMainTop5.length ? <p className="text-sm text-muted-foreground">표시할 데이터가 없습니다.</p> : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">추가 매출 발생 가능 지역 TOP 5</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {regionExpansionTop5.map((row) => (
                      <div key={row.region} className="flex items-center justify-between rounded-md bg-orange-50 px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium">{row.region}</p>
                          <p className="text-xs text-muted-foreground">배정/등록 비율 {row.assignedRegisteredRatio.toFixed(2)}</p>
                        </div>
                        <span className="font-semibold text-orange-700">{row.sales.toLocaleString("ko-KR")}원</span>
                      </div>
                    ))}
                    {!regionExpansionTop5.length ? <p className="text-sm text-muted-foreground">표시할 데이터가 없습니다.</p> : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">등록회원 추가 발생 가능 지역 TOP 5</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {regionRegistrationPotentialTop5.map((row) => (
                      <div key={row.region} className="flex items-center justify-between rounded-md bg-teal-50 px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium">{row.region}</p>
                          <p className="text-xs text-muted-foreground">
                            고객수 격차(배정-등록) {row.customerGap}
                          </p>
                        </div>
                        <span className="font-semibold text-teal-700">{row.sales.toLocaleString("ko-KR")}원</span>
                      </div>
                    ))}
                    {!regionRegistrationPotentialTop5.length ? <p className="text-sm text-muted-foreground">표시할 데이터가 없습니다.</p> : null}
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="rounded-xl border border-violet-300 bg-violet-50/60 p-4">
              <p className="mb-2 text-sm font-semibold text-violet-900">2-2. 공통 지역(3~4개) 및 상위 업종 분포 (GPT Pro 활용)</p>
              {regionCommonIndustryTop.length === 0 ? (
                <p className="text-sm text-violet-950">공통 지역 후보가 없습니다.</p>
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {regionCommonIndustryTop.map((region) => (
                    <div key={region.region} className="rounded-md border bg-white p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">{region.region}</p>
                        <span className="text-xs text-slate-500">공통 출현 {region.overlapCount}회</span>
                      </div>
                      <p className="mb-2 text-xs text-slate-500">지역 매출 {region.totalSales.toLocaleString("ko-KR")}원</p>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                        {region.topIndustries.map((industry) => (
                          <li key={`${region.region}-${industry.industry}`}>
                            {industry.industry} ({industry.sales.toLocaleString("ko-KR")}원, {industry.customerCount}개사)
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3">
                <Button variant="secondary" disabled={busy || aiBusy || !analysis} onClick={() => triggerSingle("regionCommon", "insight")}>
                  {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "업종 분포 배경 해석 생성"}
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {insightMessagesBySection.regionCommon.map((msg, idx) => (
                  <div key={`${msg.role}-region-common-${idx}`} className="rounded-md border bg-white px-3 py-2 text-sm">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">{msg.role === "assistant" ? "AI" : "사용자"}</p>
                    <p>{msg.content}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
                <p className="mb-2 text-sm font-semibold text-amber-900">2-3. 데이터 해석 (GPT Pro 활용)</p>
                <div className="space-y-2 text-sm text-amber-950">
                  {regionInterpretationLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
                <div className="mt-3">
                  <Button variant="secondary" disabled={busy || aiBusy || !analysis} onClick={() => triggerSingle("region", "interpretation")}>
                    {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "해석 다시 생성"}
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {interpretationMessagesBySection.region.map((msg, idx) => (
                    <div key={`${msg.role}-region-${idx}`} className="rounded-md border bg-white px-3 py-2 text-sm">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{msg.role === "assistant" ? "AI" : "사용자"}</p>
                      <p>{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-indigo-300 bg-indigo-50/60 p-4">
                <p className="mb-2 text-sm font-semibold text-indigo-900">2-4. 인사이트 (GPT Pro 활용)</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-indigo-950">
                  {regionInsightItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="mt-3">
                  <Button variant="secondary" disabled={busy || aiBusy || !analysis} onClick={() => triggerSingle("region", "insight")}>
                    {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "인사이트 다시 생성"}
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {insightMessagesBySection.region.map((msg, idx) => (
                    <div key={`${msg.role}-region-insight-${idx}`} className="rounded-md border bg-white px-3 py-2 text-sm">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{msg.role === "assistant" ? "AI" : "사용자"}</p>
                      <p>{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-stone-900">3. 성장 가능 고객</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">3-1. 시각화</p>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">성장 가능 고객 버블 차트</CardTitle>
                  <CardDescription>
                    x축: 최초주문금액 대비 누적금액 성장률(0~70) / y축: 구매횟수 / 원크기: 구매 누적금액 / 색상: 선택 대리점(빨간색), 기타(회색)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <GrowthCustomerScatter
                    points={growthScatterPoints}
                    averageGrowthMultiplier={growthScatter?.averageGrowthMultiplier ?? 0}
                    averagePurchaseCount={growthScatter?.averagePurchaseCount ?? 0}
                  />
                  <p className="text-xs text-muted-foreground">
                    필터링값: 최초주문금액 {growthScatter?.minFirstOrderAmount.toLocaleString("ko-KR") ?? "1,000,000"}원 이상, 구매횟수{" "}
                    {growthScatter?.minPurchaseCount ?? 2}회 이상
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
              <p className="mb-2 text-sm font-semibold text-amber-900">1. 전체 그래프 분포에 대한 해석 (회색 원)</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-950">
                {growthOverallInterpretationLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-rose-300 bg-rose-50/60 p-4">
              <p className="mb-2 text-sm font-semibold text-rose-900">2. 선택된 대리점에 대한 해석 (빨간 원)</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-rose-950">
                {growthSelectedInterpretationLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-indigo-300 bg-indigo-50/60 p-4">
              <p className="mb-2 text-sm font-semibold text-indigo-900">3-2. 선택된 대리점 고객군 분류 (GPT Pro 활용)</p>
              <p className="text-sm text-indigo-950">
                빨간색 점(선택 대리점 고객)만 기준으로 성장형/전환 관리형/유지·관계형 그룹을 자동 분류해 표로 제공합니다.
              </p>

              {growthSegmentBusy ? (
                <div className="mt-3 flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  고객군 표 생성 중...
                </div>
              ) : growthSegmentRows.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">표시할 고객군 데이터가 없습니다.</p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-md border bg-white">
                  <table className="min-w-[1300px] table-fixed text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="w-[180px] border-b px-3 py-2 text-center font-semibold">구분</th>
                        <th className="w-[370px] border-b px-3 py-2 text-center font-semibold">성장형 고객</th>
                        <th className="w-[370px] border-b px-3 py-2 text-center font-semibold">전환 관리형 고객</th>
                        <th className="w-[370px] border-b px-3 py-2 text-center font-semibold">유지·관계형 고객</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="align-top">
                        <td className="border-b bg-slate-50 px-3 py-3 font-semibold text-slate-900">기준</td>
                        <td className="border-b px-3 py-3">
                          <ul className="list-disc space-y-1 pl-4 text-slate-700">
                            {(growthSegmentByName.growth?.criteria ?? []).map((item) => (
                              <li key={`growth-criteria-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="border-b px-3 py-3">
                          <ul className="list-disc space-y-1 pl-4 text-slate-700">
                            {(growthSegmentByName.transition?.criteria ?? []).map((item) => (
                              <li key={`transition-criteria-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="border-b px-3 py-3">
                          <ul className="list-disc space-y-1 pl-4 text-slate-700">
                            {(growthSegmentByName.retention?.criteria ?? []).map((item) => (
                              <li key={`retention-criteria-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>

                      <tr className="align-top">
                        <td className="border-b bg-slate-50 px-3 py-3 font-semibold text-slate-900">특징</td>
                        <td className="border-b px-3 py-3">
                          <ul className="list-disc space-y-1 pl-4 text-slate-700">
                            {(growthSegmentByName.growth?.traits ?? []).map((item) => (
                              <li key={`growth-traits-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="border-b px-3 py-3">
                          <ul className="list-disc space-y-1 pl-4 text-slate-700">
                            {(growthSegmentByName.transition?.traits ?? []).map((item) => (
                              <li key={`transition-traits-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="border-b px-3 py-3">
                          <ul className="list-disc space-y-1 pl-4 text-slate-700">
                            {(growthSegmentByName.retention?.traits ?? []).map((item) => (
                              <li key={`retention-traits-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>

                      <tr className="align-top">
                        <td className="border-b bg-slate-50 px-3 py-3 font-semibold text-slate-900">해석</td>
                        <td className="border-b px-3 py-3">
                          <ul className="list-disc space-y-1 pl-4 text-slate-700">
                            {(growthSegmentByName.growth?.interpretation ?? []).map((item) => (
                              <li key={`growth-interpret-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="border-b px-3 py-3">
                          <ul className="list-disc space-y-1 pl-4 text-slate-700">
                            {(growthSegmentByName.transition?.interpretation ?? []).map((item) => (
                              <li key={`transition-interpret-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="border-b px-3 py-3">
                          <ul className="list-disc space-y-1 pl-4 text-slate-700">
                            {(growthSegmentByName.retention?.interpretation ?? []).map((item) => (
                              <li key={`retention-interpret-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>

                      <tr className="align-top">
                        <td className="border-b bg-slate-50 px-3 py-3 font-semibold text-slate-900">영업 방향 (or 컨택 방향)</td>
                        <td className="border-b px-3 py-3">
                          <ol className="list-decimal space-y-1 pl-5 text-slate-700">
                            {(growthSegmentByName.growth?.salesDirection ?? []).map((item) => (
                              <li key={`growth-sales-${item}`}>{item}</li>
                            ))}
                          </ol>
                        </td>
                        <td className="border-b px-3 py-3">
                          <ol className="list-decimal space-y-1 pl-5 text-slate-700">
                            {(growthSegmentByName.transition?.salesDirection ?? []).map((item) => (
                              <li key={`transition-sales-${item}`}>{item}</li>
                            ))}
                          </ol>
                        </td>
                        <td className="border-b px-3 py-3">
                          <ol className="list-decimal space-y-1 pl-5 text-slate-700">
                            {(growthSegmentByName.retention?.salesDirection ?? []).map((item) => (
                              <li key={`retention-sales-${item}`}>{item}</li>
                            ))}
                          </ol>
                        </td>
                      </tr>

                      <tr className="align-top">
                        <td className="border-b bg-slate-50 px-3 py-3 font-semibold text-slate-900">⭐TOP5 고객</td>
                        <td className="border-b px-3 py-3">
                          {!(growthSegmentByName.growth?.topCustomers.length ?? 0) ? (
                            <p className="text-slate-500">해당 조건 고객이 없습니다.</p>
                          ) : (
                            <ol className="list-decimal space-y-2 pl-5 text-slate-700">
                              {(growthSegmentByName.growth?.topCustomers ?? []).map((item) => (
                                <li key={`growth-top-${item.name}`}>
                                  <p className="font-medium text-slate-900">{item.name}</p>
                                  <p className="text-xs leading-5 text-slate-600">{item.reason}</p>
                                </li>
                              ))}
                            </ol>
                          )}
                        </td>
                        <td className="border-b px-3 py-3">
                          {!(growthSegmentByName.transition?.topCustomers.length ?? 0) ? (
                            <p className="text-slate-500">해당 조건 고객이 없습니다.</p>
                          ) : (
                            <ol className="list-decimal space-y-2 pl-5 text-slate-700">
                              {(growthSegmentByName.transition?.topCustomers ?? []).map((item) => (
                                <li key={`transition-top-${item.name}`}>
                                  <p className="font-medium text-slate-900">{item.name}</p>
                                  <p className="text-xs leading-5 text-slate-600">{item.reason}</p>
                                </li>
                              ))}
                            </ol>
                          )}
                        </td>
                        <td className="border-b px-3 py-3">
                          {!(growthSegmentByName.retention?.topCustomers.length ?? 0) ? (
                            <p className="text-slate-500">해당 조건 고객이 없습니다.</p>
                          ) : (
                            <ol className="list-decimal space-y-2 pl-5 text-slate-700">
                              {(growthSegmentByName.retention?.topCustomers ?? []).map((item) => (
                                <li key={`retention-top-${item.name}`}>
                                  <p className="font-medium text-slate-900">{item.name}</p>
                                  <p className="text-xs leading-5 text-slate-600">{item.reason}</p>
                                </li>
                              ))}
                            </ol>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-stone-900">4. 판매 제품 분석</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">4-1. 크로스셀링 분석</p>
              <p className="text-sm text-muted-foreground">
                설명: {analysis?.agency ?? "선택된 대리점"}의 크로스셀링 비중(동시구매 비중)을 시각화합니다.
              </p>
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <div className="text-sm font-semibold text-stone-900">시각화</div>
                  <div className="rounded-md bg-muted p-3">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span>동시구매</span>
                      <span>{crossSellRatioPercent.toFixed(1)}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-stone-200">
                      <div className="h-3 rounded-full bg-teal-600" style={{ width: `${Math.min(crossSellRatioPercent, 100)}%` }} />
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="rounded-md border bg-white px-3 py-2 text-sm">동시구매: {analysis?.crossSellRatio.crossSell ?? 0}건</div>
                    <div className="rounded-md border bg-white px-3 py-2 text-sm">단독구매: {analysis?.crossSellRatio.solo ?? 0}건</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
              <p className="mb-2 text-sm font-semibold text-amber-900">4-2. 시각화 데이터 해석</p>
              <div className="space-y-2 text-sm text-amber-950">
                {crossSellInterpretationLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <div className="mt-3">
                <Button variant="secondary" disabled={busy || aiBusy || !analysis} onClick={() => triggerSingle("monthly", "interpretation")}>
                  {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "해석 다시 생성"}
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {interpretationMessagesBySection.monthly.map((msg, idx) => (
                  <div key={`${msg.role}-monthly-${idx}`} className="rounded-md border bg-white px-3 py-2 text-sm">
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">{msg.role === "assistant" ? "AI" : "사용자"}</p>
                    <p>{msg.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-stone-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-stone-900">5. 선택된 메이트 vs 클럽 1,000메이트 제품별 판매량 비교</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">5-1. 시각화</p>
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <p className="text-xs text-muted-foreground">구조 샘플 시각화 (실데이터 연동 전)</p>
                  {productComparisonSampleRows.map((row) => (
                    <div key={row.product} className="space-y-2 rounded-md border bg-white p-3">
                      <p className="text-sm font-semibold">{row.product}</p>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>선택 메이트</span>
                          <span>{row.mate}</span>
                        </div>
                        <div className="h-2 rounded-full bg-stone-200">
                          <div className="h-2 rounded-full bg-sky-600" style={{ width: `${row.mate}%` }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>클럽 1,000메이트</span>
                          <span>{row.club}</span>
                        </div>
                        <div className="h-2 rounded-full bg-stone-200">
                          <div className="h-2 rounded-full bg-indigo-600" style={{ width: `${row.club}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-orange-300 bg-orange-50/60 p-4">
                <p className="mb-2 text-sm font-semibold text-orange-900">5-2. 클럽 1,000메이트 대비 못팔고 있는 제품</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-orange-950">
                  {weakProductsPlaceholder.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
                <p className="mb-2 text-sm font-semibold text-amber-900">5-3. 데이터 해석</p>
                <p className="text-sm text-amber-950">클럽 1,000메이트 대비 저판매 제품군의 원인과 우선 공략 제품을 해석합니다.</p>
                <div className="mt-3">
                  <Button variant="secondary" disabled={busy || aiBusy || !analysis} onClick={() => triggerSingle("weakProduct", "interpretation")}>
                    {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "해석 다시 생성"}
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {interpretationMessagesBySection.weakProduct.map((msg, idx) => (
                    <div key={`${msg.role}-weak-${idx}`} className="rounded-md border bg-white px-3 py-2 text-sm">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{msg.role === "assistant" ? "AI" : "사용자"}</p>
                      <p>{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-teal-300 bg-teal-50/60 p-4">
                <p className="mb-2 text-sm font-semibold text-teal-900">5-4. 클럽 1,000 메이트 대비 잘 팔고 있는 제품</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-teal-950">
                  {strongProductsPlaceholder.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-indigo-300 bg-indigo-50/60 p-4">
                <p className="mb-2 text-sm font-semibold text-indigo-900">5-5. 데이터 해석</p>
                <p className="text-sm text-indigo-950">상대적으로 잘 팔리는 제품군의 성공 요인을 해석하고 재현 전략을 제시합니다.</p>
                <div className="mt-3">
                  <Button variant="secondary" disabled={busy || aiBusy || !analysis} onClick={() => triggerSingle("strongProduct", "interpretation")}>
                    {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "해석 다시 생성"}
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {interpretationMessagesBySection.strongProduct.map((msg, idx) => (
                    <div key={`${msg.role}-strong-${idx}`} className="rounded-md border bg-white px-3 py-2 text-sm">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">{msg.role === "assistant" ? "AI" : "사용자"}</p>
                      <p>{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
