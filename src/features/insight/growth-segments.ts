export interface GrowthSegmentPoint {
  bizNo: string;
  customerName: string;
  cumulativeAmount: number;
  purchaseCount: number;
  growthMultiplier: number;
}

export interface GrowthSegmentTopCustomer {
  name: string;
  reason: string;
}

export interface GrowthSegmentRow {
  segment: "성장형 고객" | "전환 관리형 고객" | "유지·관계형 고객";
  criteria: string[];
  traits: string[];
  interpretation: string[];
  salesDirection: string[];
  topCustomers: GrowthSegmentTopCustomer[];
}

export interface GenerateGrowthSegmentsParams {
  agency: string;
  benchmark: "overall" | "club1000";
  averageGrowthMultiplier: number;
  averagePurchaseCount: number;
  selectedAverageGrowthMultiplier: number;
  selectedAveragePurchaseCount: number;
  selectedPoints: GrowthSegmentPoint[];
}

interface SegmentBuckets {
  growth: GrowthSegmentPoint[];
  transition: GrowthSegmentPoint[];
  retention: GrowthSegmentPoint[];
}

interface OpenAiRowsResponse {
  rows?: Array<{
    segment?: string;
    criteria?: string[];
    traits?: string[];
    interpretation?: string[];
    salesDirection?: string[];
    topCustomers?: Array<{ name?: string; reason?: string }>;
  }>;
}

const MODEL_DEFAULT = "gpt-4o-mini";
const SEGMENT_ORDER: GrowthSegmentRow["segment"][] = ["성장형 고객", "전환 관리형 고객", "유지·관계형 고객"];

function round(value: number, digits = 2): number {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function safeMeanFallback(primary: number, fallback: number, defaultValue: number): number {
  if (primary > 0) {
    return primary;
  }
  if (fallback > 0) {
    return fallback;
  }
  return defaultValue;
}

function thresholds(params: GenerateGrowthSegmentsParams) {
  const growthThreshold = round(safeMeanFallback(params.selectedAverageGrowthMultiplier, params.averageGrowthMultiplier, 3.0));
  const purchaseAvg = round(safeMeanFallback(params.selectedAveragePurchaseCount, params.averagePurchaseCount, 3.0));
  const conversionLower = 1.5;
  const conversionUpper = round(Math.max(conversionLower + 0.1, growthThreshold - 0.01));

  return {
    growthThreshold,
    purchaseAvg,
    conversionLower,
    conversionUpper
  };
}

function classifyPoints(params: GenerateGrowthSegmentsParams): SegmentBuckets {
  const { growthThreshold, purchaseAvg } = thresholds(params);
  const growthMinPurchase = Math.max(2, purchaseAvg - 0.5);

  const buckets: SegmentBuckets = {
    growth: [],
    transition: [],
    retention: []
  };

  for (const point of params.selectedPoints) {
    if (point.growthMultiplier >= growthThreshold && point.purchaseCount >= growthMinPurchase) {
      buckets.growth.push(point);
      continue;
    }

    if (point.growthMultiplier < 1.5 || point.purchaseCount <= 2) {
      buckets.retention.push(point);
      continue;
    }

    buckets.transition.push(point);
  }

  return buckets;
}

function scoreGrowth(point: GrowthSegmentPoint): number {
  return point.growthMultiplier * 4 + point.purchaseCount * 2 + Math.log10(Math.max(1, point.cumulativeAmount));
}

function scoreTransition(point: GrowthSegmentPoint, growthThreshold: number): number {
  const distance = Math.abs(growthThreshold - point.growthMultiplier);
  return point.purchaseCount * 2 + Math.log10(Math.max(1, point.cumulativeAmount)) - distance;
}

function scoreRetention(point: GrowthSegmentPoint): number {
  return Math.log10(Math.max(1, point.cumulativeAmount)) + Math.max(0, 2.2 - point.growthMultiplier);
}

function topCustomers(points: GrowthSegmentPoint[], segment: GrowthSegmentRow["segment"], growthThreshold: number): GrowthSegmentTopCustomer[] {
  const sorted = [...points]
    .sort((a, b) => {
      const aScore =
        segment === "성장형 고객"
          ? scoreGrowth(a)
          : segment === "전환 관리형 고객"
            ? scoreTransition(a, growthThreshold)
            : scoreRetention(a);
      const bScore =
        segment === "성장형 고객"
          ? scoreGrowth(b)
          : segment === "전환 관리형 고객"
            ? scoreTransition(b, growthThreshold)
            : scoreRetention(b);
      return bScore - aScore;
    })
    .slice(0, 5);

  return sorted.map((point) => ({
    name: point.customerName || point.bizNo,
    reason:
      segment === "성장형 고객"
        ? `성장배수 ${round(point.growthMultiplier)}와 반복 구매 패턴이 뚜렷합니다.`
        : segment === "전환 관리형 고객"
          ? `성장배수 ${round(point.growthMultiplier)}로 평균선 인근이며 다음 제안 전환 여지가 있습니다.`
          : `구매횟수 ${point.purchaseCount}회 중심의 안정형으로 관계 유지 관리가 적합합니다.`
  }));
}

function fallbackRows(params: GenerateGrowthSegmentsParams): GrowthSegmentRow[] {
  const bucketed = classifyPoints(params);
  const { growthThreshold, purchaseAvg, conversionLower, conversionUpper } = thresholds(params);

  return [
    {
      segment: "성장형 고객",
      criteria: [
        `성장배수 >= ${growthThreshold.toFixed(2)}`,
        `구매횟수 평균(${purchaseAvg.toFixed(2)}) 이상 또는 평균 근접`,
        "누적구매금액 중~대형"
      ],
      traits: [
        "반복 구매 경험이 명확하고 확장 구매가 확인됩니다.",
        "초기 구매 이후 추가 구매가 누적되며 관계 기반이 형성되어 있습니다."
      ],
      interpretation: [
        "단발성 프로젝트보다 관계 기반 성장이 확인되는 고객군입니다.",
        "증설·리뉴얼·재배치 상황에서 재구매 가능성이 높은 전략 계정 후보입니다."
      ],
      salesDirection: [
        "분기/반기 단위 정기 컨택을 유지합니다.",
        "증설/리뉴얼 패키지와 운영 편의성(납기·설치·조건)을 강조한 제안을 우선 적용합니다."
      ],
      topCustomers: topCustomers(bucketed.growth, "성장형 고객", growthThreshold)
    },
    {
      segment: "전환 관리형 고객",
      criteria: [
        `성장배수 ${conversionLower.toFixed(2)} ~ ${conversionUpper.toFixed(2)}`,
        "구매횟수 평균 근접 또는 2~3회 구간",
        "누적구매금액 중간 규모"
      ],
      traits: [
        "재구매는 발생하지만 확장 속도는 완만한 구간입니다.",
        "추가 구매 제안 타이밍에 따라 성장형으로 전환될 가능성이 큽니다."
      ],
      interpretation: [
        "가장 중요한 관리 구간으로, 컨택 시점과 제안 방식의 영향이 큽니다.",
        "고객이 한 번 더 살 이유를 명확히 제시하면 상위군 전환 여지가 있습니다."
      ],
      salesDirection: [
        "구매 3회 전후, 평균선 근접 시점에 선제 컨택합니다.",
        "인원 변화/공간 재배치 가정의 가벼운 시나리오와 세트 제안을 우선 적용합니다."
      ],
      topCustomers: topCustomers(bucketed.transition, "전환 관리형 고객", growthThreshold)
    },
    {
      segment: "유지·관계형 고객",
      criteria: [
        `성장배수 < ${conversionLower.toFixed(2)}`,
        "구매횟수 1~2회 중심",
        "누적구매금액 소~중규모(일부 예외 포함)"
      ],
      traits: [
        "초기 구매 이후 추가 구매 빈도가 낮은 안정/정체 구간입니다.",
        "당장의 확장보다 관계 유지 성격이 강한 고객군입니다."
      ],
      interpretation: [
        "단기 매출 확대보다 장기 접점 유지가 중요한 구간입니다.",
        "이전·리뉴얼·조직 변화 이벤트가 생길 때 기회가 열릴 가능성이 큽니다."
      ],
      salesDirection: [
        "신제품/사례 중심의 저강도 컨택을 연 1~2회 유지합니다.",
        "필요 시점에 다시 떠올릴 수 있도록 브랜드 인지와 신뢰를 관리합니다."
      ],
      topCustomers: topCustomers(bucketed.retention, "유지·관계형 고객", growthThreshold)
    }
  ];
}

function parseRows(raw: string, allowedNames: Set<string>): GrowthSegmentRow[] | null {
  try {
    const parsed = JSON.parse(raw) as OpenAiRowsResponse;
    if (!Array.isArray(parsed.rows)) {
      return null;
    }

    const rows = parsed.rows
      .map((row): GrowthSegmentRow | null => {
        if (
          row.segment !== "성장형 고객" &&
          row.segment !== "전환 관리형 고객" &&
          row.segment !== "유지·관계형 고객"
        ) {
          return null;
        }

        const criteria = Array.isArray(row.criteria) ? row.criteria.map((item) => String(item).trim()).filter(Boolean) : [];
        const traits = Array.isArray(row.traits) ? row.traits.map((item) => String(item).trim()).filter(Boolean) : [];
        const interpretation = Array.isArray(row.interpretation)
          ? row.interpretation.map((item) => String(item).trim()).filter(Boolean)
          : [];
        const salesDirection = Array.isArray(row.salesDirection)
          ? row.salesDirection.map((item) => String(item).trim()).filter(Boolean)
          : [];

        const topCustomers = Array.isArray(row.topCustomers)
          ? row.topCustomers
              .map((item) => ({
                name: String(item?.name ?? "").trim(),
                reason: String(item?.reason ?? "").trim()
              }))
              .filter((item) => item.name && item.reason && allowedNames.has(item.name))
              .slice(0, 5)
          : [];

        if (!criteria.length || !traits.length || !interpretation.length || !salesDirection.length) {
          return null;
        }

        return {
          segment: row.segment,
          criteria,
          traits,
          interpretation,
          salesDirection,
          topCustomers
        };
      })
      .filter((row): row is GrowthSegmentRow => Boolean(row));

    if (!rows.length) {
      return null;
    }

    const bySegment = new Map(rows.map((row) => [row.segment, row]));
    const ordered = SEGMENT_ORDER.map((segment) => bySegment.get(segment)).filter((row): row is GrowthSegmentRow => Boolean(row));

    return ordered.length ? ordered : null;
  } catch {
    return null;
  }
}

function buildPrompt(params: GenerateGrowthSegmentsParams, baseRows: GrowthSegmentRow[]): string {
  const candidates = params.selectedPoints.map((point) => ({
    name: point.customerName || point.bizNo,
    bizNo: point.bizNo,
    cumulativeAmount: point.cumulativeAmount,
    purchaseCount: point.purchaseCount,
    growthMultiplier: round(point.growthMultiplier)
  }));

  return [
    `대리점: ${params.agency}`,
    `비교기준: ${params.benchmark === "club1000" ? "Club 1000" : "전체 평균"}`,
    "요청: 선택된 대리점 고객(빨간 점)만 기준으로 아래 3개 그룹 표를 완성한다.",
    "중요: 고객명은 candidates에 있는 이름만 사용한다. 각 그룹 Top5를 제시한다.",
    '출력은 JSON만 반환: {"rows":[{"segment":"성장형 고객","criteria":[],"traits":[],"interpretation":[],"salesDirection":[],"topCustomers":[{"name":"","reason":""}]}]}',
    "",
    "fallbackRows(JSON):",
    JSON.stringify(baseRows, null, 2),
    "",
    "candidates(JSON):",
    JSON.stringify(candidates, null, 2)
  ].join("\n");
}

async function requestOpenAi(params: GenerateGrowthSegmentsParams, baseRows: GrowthSegmentRow[]): Promise<GrowthSegmentRow[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_MODEL ?? MODEL_DEFAULT;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const allowedNames = new Set(params.selectedPoints.map((point) => point.customerName || point.bizNo));

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: [
              "너는 B2B 영업 분석가다.",
              "한국어로 답한다.",
              "출력은 JSON만 반환한다.",
              "없는 고객명은 생성하지 않는다."
            ].join("\n")
          },
          { role: "user", content: buildPrompt(params, baseRows) }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = payload.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return null;
    }

    return parseRows(raw, allowedNames);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateGrowthSegmentRows(params: GenerateGrowthSegmentsParams): Promise<GrowthSegmentRow[]> {
  const baseRows = fallbackRows(params);
  const aiRows = await requestOpenAi(params, baseRows);
  if (!aiRows) {
    return baseRows;
  }

  const fallbackBySegment = new Map(baseRows.map((row) => [row.segment, row]));
  return SEGMENT_ORDER.map((segment) => {
    const aiRow = aiRows.find((row) => row.segment === segment);
    if (!aiRow) {
      return fallbackBySegment.get(segment)!;
    }
    if (!aiRow.topCustomers.length) {
      return {
        ...aiRow,
        topCustomers: fallbackBySegment.get(segment)?.topCustomers ?? []
      };
    }
    return aiRow;
  });
}
