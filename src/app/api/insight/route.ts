import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  agency: z.string().min(1),
  benchmark: z.enum(["overall", "club1000"]),
  userPrompt: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);

    const defaultMessage = `${parsed.agency}은(는) ${parsed.benchmark === "club1000" ? "Club 1000" : "전체 평균"} 대비 신제품 비중과 성장고객 확보율을 우선 개선하는 전략이 필요합니다.`;
    const userRefined = parsed.userPrompt
      ? `요청 반영: ${parsed.userPrompt} 중심으로 실행안(지역, 고객, 제품)을 재정렬하세요.`
      : "우선순위: 1) 확장 필요 지역 Top 5 공략 2) High Potential 고객 집중 제안 3) 크로스셀 묶음 제안 강화";

    return NextResponse.json({
      messages: [
        { role: "assistant", content: defaultMessage },
        { role: "assistant", content: userRefined }
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "인사이트 생성 오류";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
