import { NextResponse } from "next/server";
import { z } from "zod";

import { generateGrowthSegmentRows } from "@/features/insight/growth-segments";

export const runtime = "nodejs";

const pointSchema = z.object({
  bizNo: z.string().min(1),
  customerName: z.string().min(1),
  cumulativeAmount: z.number(),
  purchaseCount: z.number(),
  growthMultiplier: z.number()
});

const requestSchema = z.object({
  agency: z.string().min(1),
  benchmark: z.enum(["overall", "club1000"]),
  averageGrowthMultiplier: z.number(),
  averagePurchaseCount: z.number(),
  selectedAverageGrowthMultiplier: z.number(),
  selectedAveragePurchaseCount: z.number(),
  selectedPoints: z.array(pointSchema)
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);

    const rows = await generateGrowthSegmentRows({
      agency: parsed.agency,
      benchmark: parsed.benchmark,
      averageGrowthMultiplier: parsed.averageGrowthMultiplier,
      averagePurchaseCount: parsed.averagePurchaseCount,
      selectedAverageGrowthMultiplier: parsed.selectedAverageGrowthMultiplier,
      selectedAveragePurchaseCount: parsed.selectedAveragePurchaseCount,
      selectedPoints: parsed.selectedPoints
    });

    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "성장 고객군 생성 오류";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
