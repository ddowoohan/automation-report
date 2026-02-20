import { NextResponse } from "next/server";
import { z } from "zod";
import { generateInsightMessages } from "@/features/insight/generate";
import { getInsightPreset, type InsightPresetId } from "@/features/insight/presets";

export const runtime = "nodejs";

const requestSchema = z.object({
  agency: z.string().min(1),
  benchmark: z.enum(["overall", "club1000"]),
  presetId: z.string().min(1),
  analysisSnapshot: z.record(z.string(), z.unknown()).optional()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);
    const preset = getInsightPreset(parsed.presetId);
    if (!preset) {
      return NextResponse.json({ error: "유효하지 않은 presetId 입니다." }, { status: 400 });
    }

    const messages = await generateInsightMessages({
      agency: parsed.agency,
      benchmark: parsed.benchmark,
      presetId: parsed.presetId as InsightPresetId,
      analysisSnapshot: parsed.analysisSnapshot
    });

    return NextResponse.json({
      presetId: preset.id,
      messages: messages.map((content) => ({ role: "assistant" as const, content }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "인사이트 생성 오류";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
