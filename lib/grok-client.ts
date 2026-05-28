export type GrokChatMessage = Readonly<{
  content: unknown;
  role: "assistant" | "system" | "user";
}>;

export type GrokChatCompletion = Readonly<{
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  id?: string;
  model?: string;
  usage?: unknown;
}>;

export type GrokChatCompletionInput = Readonly<{
  apiKey: string;
  messages: GrokChatMessage[];
  model: string;
  maxTokens?: number;
  purpose?: string;
  reasoningEffort?: string;
  temperature?: number;
  timeoutMs?: number;
}>;

export const DEFAULT_GROK_MODEL = "grok-4.3";

const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 120_000;

export function configuredGrokValue(value: string | undefined) {
  return value?.trim() ?? "";
}

export function getRequiredXaiApiKey() {
  const apiKey = configuredGrokValue(process.env.XAI_API_KEY);

  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured");
  }

  return apiKey;
}

export function configuredGrokModel(...candidates: Array<string | undefined>) {
  return candidates
    .map(configuredGrokValue)
    .find(Boolean) || DEFAULT_GROK_MODEL;
}

export async function callGrokChatCompletion({
  apiKey,
  maxTokens,
  messages,
  model,
  purpose = "request",
  reasoningEffort,
  temperature,
  timeoutMs = DEFAULT_TIMEOUT_MS
}: GrokChatCompletionInput) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(XAI_CHAT_COMPLETIONS_URL, {
      body: JSON.stringify({
        messages,
        model,
        ...(typeof maxTokens === "number" ? { max_tokens: maxTokens } : {}),
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        response_format: { type: "json_object" },
        stream: false,
        ...(typeof temperature === "number" ? { temperature } : {})
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `xAI ${purpose} failed with ${response.status}: ${body.slice(0, 500)}`
      );
    }

    return (await response.json()) as GrokChatCompletion;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `xAI ${purpose} timed out after ${Math.round(timeoutMs / 1000)} seconds`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
