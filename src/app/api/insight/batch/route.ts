import { NextResponse } from "next/server";
import { z } from "zod";

import { generateInsightMessages } from "@/features/insight/generate";
import { getInsightPreset, type InsightPresetId } from "@/features/insight/presets";

export const runtime = "nodejs";

const insightRequestSchema = z.object({
  agency: z.string().min(1),
  benchmark: z.enum(["overall", "club1000"]),
  presetId: z.string().min(1),
  analysisSnapshot: z.record(z.string(), z.unknown()).optional()
});

const requestSchema = z.object({
  requests: z.array(insightRequestSchema).min(1).max(20)
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);

    const results = await Promise.all(
      parsed.requests.map(async (item) => {
        const preset = getInsightPreset(item.presetId);
        if (!preset) {
          return {
            presetId: item.presetId,
            messages: [{ role: "assistant" as const, content: "유효하지 않은 presetId 입니다." }],
            error: "invalid_preset"
          };
        }

        const messages = await generateInsightMessages({
          agency: item.agency,
          benchmark: item.benchmark,
          presetId: item.presetId as InsightPresetId,
          analysisSnapshot: item.analysisSnapshot
        });

        return {
          presetId: preset.id,
          messages: messages.map((content) => ({ role: "assistant" as const, content }))
        };
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "배치 인사이트 생성 오류";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

