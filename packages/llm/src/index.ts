/**
 * Direct Amazon Bedrock Chat Completions (ChogSmith Mantle pattern).
 * BEDROCK_MODEL_ID default: zai.glm-4.7-flash
 */

const BEDROCK_REGION = process.env.BEDROCK_REGION || "us-east-1";
const BEDROCK_OPENAI_BASE_URL = (
  process.env.BEDROCK_OPENAI_BASE_URL ||
  `https://bedrock-mantle.${BEDROCK_REGION}.api.aws/v1`
).replace(/\/+$/, "");
const BEDROCK_API_KEY = process.env.BEDROCK_API_KEY || "";
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "zai.glm-4.7-flash";
const LLM_TIMEOUT_MS = Number(process.env.BEDROCK_TIMEOUT_MS || 90000);

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: { input: number; output: number };
}

export async function callBedrock(
  messages: LLMMessage[],
  options: { model?: string; temperature?: number; maxTokens?: number } = {},
): Promise<LLMResponse> {
  if (!BEDROCK_API_KEY) {
    throw new Error("BEDROCK_API_KEY is required");
  }
  const model = options.model || BEDROCK_MODEL_ID;
  const response = await fetch(`${BEDROCK_OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BEDROCK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 8000,
      stream: false,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Bedrock ${response.status}: ${text.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Bedrock returned empty content");

  return {
    content,
    model: data.model || model,
    tokensUsed: {
      input: data.usage?.prompt_tokens || 0,
      output: data.usage?.completion_tokens || 0,
    },
  };
}

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() || text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("No JSON object in model output");
  return JSON.parse(raw.slice(start, end + 1));
}
