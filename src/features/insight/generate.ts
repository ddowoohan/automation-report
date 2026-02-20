import { fallbackMessages, getInsightPreset, type InsightPresetId } from "@/features/insight/presets";

interface GenerateInsightParams {
  agency: string;
  benchmark: "overall" | "club1000";
  presetId: InsightPresetId;
  analysisSnapshot?: Record<string, unknown>;
}

interface OpenAiJsonResponse {
  messages?: string[];
}

function buildSystemPrompt(): string {
  return [
    "너는 B2B 영업 데이터 분석가다.",
    "항상 한국어로 답변한다.",
    "출력은 JSON만 반환한다.",
    '형식: {"messages":["문장1","문장2","문장3"]}',
    "각 문장은 2줄 이내로 짧고 실행 가능해야 한다.",
    "근거 없는 추측은 피하고, 제공된 데이터 범위 안에서 해석한다.",
    "외부 검색 근거가 없으면 출처를 임의로 만들지 말고 '출처: 내부 데이터'로 표기한다."
  ].join("\n");
}

function buildUserPrompt(params: GenerateInsightParams): string {
  const preset = getInsightPreset(params.presetId);
  if (!preset) {
    return "";
  }

  return [
    `대리점: ${params.agency}`,
    `비교기준: ${params.benchmark === "club1000" ? "Club 1000" : "전체 평균"}`,
    `요청 제목: ${preset.title}`,
    `목적: ${preset.objective}`,
    `중점: ${preset.focus.join(", ")}`,
    `출력 힌트: ${preset.outputHint}`,
    "",
    "분석 데이터(JSON):",
    JSON.stringify(params.analysisSnapshot ?? {}, null, 2)
  ].join("\n");
}

function parseJsonMessages(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw) as OpenAiJsonResponse;
    if (!Array.isArray(parsed.messages)) {
      return null;
    }
    const messages = parsed.messages.map((message) => String(message).trim()).filter(Boolean).slice(0, 5);
    return messages.length > 0 ? messages : null;
  } catch {
    return null;
  }
}

async function requestOpenAi(params: GenerateInsightParams): Promise<string[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

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
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(params) }
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

    return parseJsonMessages(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateInsightMessages(params: GenerateInsightParams): Promise<string[]> {
  const preset = getInsightPreset(params.presetId);
  if (!preset) {
    return ["정의되지 않은 프리셋입니다."];
  }

  const aiMessages = await requestOpenAi(params);
  if (aiMessages && aiMessages.length > 0) {
    return aiMessages;
  }

  return fallbackMessages(params.agency, preset);
}
