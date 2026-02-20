"use client";

import { useMemo } from "react";
import { CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

import type { GrowthScatterPoint } from "@/types/domain";

interface GrowthCustomerScatterProps {
  points: GrowthScatterPoint[];
  averageGrowthMultiplier: number;
  averagePurchaseCount: number;
}

interface ChartPoint extends GrowthScatterPoint {
  growthMultiplierDisplay: number;
}

const MAX_GROWTH_MULTIPLIER = 70;

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("ko-KR") : "0";
}

export function GrowthCustomerScatter({ points, averageGrowthMultiplier, averagePurchaseCount }: GrowthCustomerScatterProps) {
  const { selectedPoints, otherPoints, overRangeCount } = useMemo(() => {
    const chartPoints: ChartPoint[] = points.map((point) => ({
      ...point,
      growthMultiplierDisplay: Math.min(point.growthMultiplier, MAX_GROWTH_MULTIPLIER)
    }));

    return {
      selectedPoints: chartPoints.filter((point) => point.isSelectedAgency),
      otherPoints: chartPoints.filter((point) => !point.isSelectedAgency),
      overRangeCount: points.filter((point) => point.growthMultiplier > MAX_GROWTH_MULTIPLIER).length
    };
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-[460px] items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">
        필터 조건(최초주문금액 100만원 이상, 구매횟수 2회 이상)에 맞는 고객 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="h-[460px] w-full rounded-lg border bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-700">
        <span className="font-medium text-blue-600">X 평균 {averageGrowthMultiplier.toFixed(2)}</span>
        <span className="font-medium text-rose-600">Y 평균 {averagePurchaseCount.toFixed(2)}</span>
        {overRangeCount > 0 ? <span className="text-slate-500">성장률 {MAX_GROWTH_MULTIPLIER} 초과 고객 {overRangeCount}개(우측 경계 표시)</span> : null}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 28, bottom: 44, left: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            type="number"
            dataKey="growthMultiplierDisplay"
            name="최초주문금액 대비 누적금액 성장률"
            domain={[0, MAX_GROWTH_MULTIPLIER]}
            allowDataOverflow
            tickCount={8}
            tick={{ fill: "#64748b", fontSize: 12 }}
            label={{ value: "최초주문금액 대비 누적금액 성장률", position: "bottom", offset: 16, fill: "#334155", fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="purchaseCount"
            name="구매횟수"
            allowDecimals={false}
            tick={{ fill: "#64748b", fontSize: 12 }}
            label={{ value: "구매횟수", angle: -90, position: "insideLeft", offset: -8, fill: "#334155", fontSize: 12 }}
          />
          <ZAxis type="number" dataKey="cumulativeAmount" range={[80, 2400]} />
          <Tooltip
            cursor={{ strokeDasharray: "4 4" }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as ChartPoint | undefined;
              if (!active || !point) {
                return null;
              }

              return (
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
                  <p className="font-semibold text-slate-900">
                    {point.agency}
                  </p>
                  <p className="mt-1 text-slate-700">회사명: {point.customerName || "-"}</p>
                  <p className="text-slate-700">사업자번호: {point.bizNo}</p>
                  <p className="text-slate-700">성장률: {point.growthMultiplier.toFixed(2)}</p>
                  <p className="text-slate-700">구매횟수: {point.purchaseCount.toLocaleString("ko-KR")}</p>
                  <p className="text-slate-700">누적금액: {formatNumber(point.cumulativeAmount)}원</p>
                </div>
              );
            }}
          />
          <Legend />

          <ReferenceLine
            x={Math.min(averageGrowthMultiplier, MAX_GROWTH_MULTIPLIER)}
            stroke="#2563eb"
            strokeDasharray="6 6"
          />
          <ReferenceLine
            y={averagePurchaseCount}
            stroke="#ef4444"
            strokeDasharray="6 6"
          />

          <Scatter name="기타" data={otherPoints} fill="#9ca3af" fillOpacity={0.75} />
          <Scatter name="선택 대리점" data={selectedPoints} fill="#dc2626" fillOpacity={0.88} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
