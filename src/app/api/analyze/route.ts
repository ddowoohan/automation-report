import { NextResponse } from "next/server";
import { z } from "zod";

import { calculateAnalysis } from "@/features/metrics/calculate";
import { getSession } from "@/lib/session-store";

export const runtime = "nodejs";

const requestSchema = z.object({
  sessionId: z.string().min(1),
  agency: z.string().min(1),
  benchmark: z.enum(["overall", "club1000"]).default("overall")
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);

    const dataset = getSession(parsed.sessionId);
    if (!dataset) {
      return NextResponse.json({ error: "세션이 만료되었습니다. 기본 데이터를 다시 불러와주세요." }, { status: 404 });
    }

    const analysis = calculateAnalysis(dataset, parsed.agency, parsed.benchmark);
    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "분석 요청 오류";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
