export type InsightPresetId =
  | "geo_interpretation"
  | "geo_insight"
  | "region_interpretation"
  | "region_insight"
  | "region_common_industry_insight"
  | "growth_interpretation"
  | "cross_sell_interpretation"
  | "weak_products_interpretation"
  | "strong_products_interpretation";

export interface InsightPreset {
  id: InsightPresetId;
  title: string;
  objective: string;
  focus: string[];
  outputHint: string;
}

export const INSIGHT_PRESETS: Record<InsightPresetId, InsightPreset> = {
  geo_interpretation: {
    id: "geo_interpretation",
    title: "지역별 매출 분포 해석",
    objective: "지역 분포 패턴을 해석한다.",
    focus: ["주요 권역 집중도", "저비중 권역 확장 여지", "평균 대비 편차"],
    outputHint: "해석형 문장 위주로 3~4개 불릿"
  },
  geo_insight: {
    id: "geo_insight",
    title: "지역별 매출 분포 인사이트",
    objective: "지역 기반 실행안을 제시한다.",
    focus: ["핵심 권역 유지 전략", "확장 권역 전환 전략", "우선순위 실행안"],
    outputHint: "실행형 제안 3~4개 불릿"
  },
  region_interpretation: {
    id: "region_interpretation",
    title: "핵심/공략 지역 Top5 해석",
    objective: "핵심비중/추가매출/등록회원추가 지역 구조를 해석한다.",
    focus: ["핵심비중 Top5", "추가 매출 발생 가능 지역 Top5", "등록회원 추가 발생 가능 지역 Top5"],
    outputHint: "해석형 문장 위주로 3~4개 불릿"
  },
  region_insight: {
    id: "region_insight",
    title: "핵심/공략 지역 Top5 인사이트",
    objective: "지역 리스트 기반 실행 전략을 제시한다.",
    focus: ["핵심 지역 유지 전략", "추가 매출 발생 가능 지역 공략 전략", "등록회원 확장 전략"],
    outputHint: "실행형 제안 3~4개 불릿"
  },
  region_common_industry_insight: {
    id: "region_common_industry_insight",
    title: "공통 지역 업종 분포 배경 해석",
    objective: "공통 지역의 주요 업종이 많은 이유를 설명한다.",
    focus: ["공통 지역 3~4개", "지역별 상위 업종 3개", "업종 분포 배경"],
    outputHint: "지역별 1문장 근거 + 가능하면 출처 표기"
  },
  growth_interpretation: {
    id: "growth_interpretation",
    title: "성장 가능 고객 버블차트 해석",
    objective: "전체/선택 대리점 분포를 해석한다.",
    focus: ["회색(전체) 분포", "빨간색(선택 대리점) 분포", "평균선 기반 위치 해석"],
    outputHint: "전체 분포 2개 + 선택 대리점 2개 불릿"
  },
  cross_sell_interpretation: {
    id: "cross_sell_interpretation",
    title: "크로스셀링 비중 해석",
    objective: "동시구매/단독구매 구조를 해석한다.",
    focus: ["동시구매 비중", "현재 포트폴리오 성숙도", "개선 시사점"],
    outputHint: "해석형 3~4개 불릿"
  },
  weak_products_interpretation: {
    id: "weak_products_interpretation",
    title: "저판매 제품군 해석",
    objective: "클럽1000 대비 저판매 제품군의 원인을 해석한다.",
    focus: ["갭 원인 가설", "우선 개선 제품군", "영업 전환 포인트"],
    outputHint: "원인+시사점 3~4개 불릿"
  },
  strong_products_interpretation: {
    id: "strong_products_interpretation",
    title: "고판매 제품군 해석",
    objective: "클럽1000 대비 고판매 제품군의 성공 요인을 해석한다.",
    focus: ["성공 요인", "재현 가능한 요소", "확장 포인트"],
    outputHint: "성공요인+재현전략 3~4개 불릿"
  }
};

export function getInsightPreset(id: string): InsightPreset | null {
  return INSIGHT_PRESETS[id as InsightPresetId] ?? null;
}

export function fallbackMessages(agency: string, preset: InsightPreset): string[] {
  return [
    `[${preset.title}] ${agency} 기준으로 핵심 지표를 읽어 해석했습니다.`,
    `${preset.objective}에 맞춰 ${preset.focus.join(", ")} 중심으로 확인이 필요합니다.`,
    `권장 출력 형식: ${preset.outputHint}`
  ];
}
