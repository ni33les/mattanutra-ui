import type {
  HealthScoreAdvice,
  HealthScorePaywallFeature,
  HealthScoreResult,
  LocalizedHealthScoreText
} from "@/lib/health-score";
import type { Locale } from "@/lib/i18n";

type XaiChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  id?: string;
  model?: string;
  usage?: unknown;
};

const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_GROK_MODEL = "grok-4-1-fast-reasoning";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 120_000;

function configured(value: string | undefined) {
  return value?.trim() ?? "";
}

function grokConfig() {
  const apiKey = configured(process.env.XAI_API_KEY);

  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured");
  }

  return {
    apiKey,
    model: configured(process.env.GROK_MODEL) || DEFAULT_GROK_MODEL
  };
}

function systemPrompt() {
  return [
    "You are MattaNutra's HealthScore interpretation engine.",
    "This is wellness education, not medical advice, diagnosis, treatment, or a prescription.",
    "Use the completed assessment and HealthScore domains to write concise consumer-facing guidance.",
    "Do not recommend supplements, doses, products, brands, marketplace searches, or medical treatments.",
    "Do not make disease claims.",
    "Return JSON only. The first character must be { and the last character must be }."
  ].join("\n");
}

function userPrompt({
  answers,
  healthScore,
  locale
}: Readonly<{
  answers: unknown;
  healthScore: HealthScoreResult;
  locale: Locale;
}>) {
  return JSON.stringify(
    {
      assessment: answers,
      contract: {
        advice: {
          overview: {
            en: "One short English paragraph combining the main focus area from the lowest-scoring HealthScore domain with practical wellness next steps. No supplement advice.",
            th: "One short Thai paragraph combining the main focus area from the lowest-scoring HealthScore domain with practical wellness next steps. No supplement advice."
          },
          paywallEyebrow: {
            en: "Short English eyebrow adapted from: Choose your brief.",
            th: "Short Thai eyebrow adapted from: Choose your brief."
          },
          paywallFeatures: [
            {
              description: {
                en: "One English sentence explaining why this feature matters for this person's profile.",
                th: "One Thai sentence explaining why this feature matters for this person's profile."
              },
              name: {
                en: "Short English feature name",
                th: "Short Thai feature name"
              }
            }
          ],
          paywallSubtitle: {
            en: "One English sentence adapted from: Choose the level of guidance you want before we prepare your formulation.",
            th: "One Thai sentence adapted from: Choose the level of guidance you want before we prepare your formulation."
          },
          paywallTitle: {
            en: "Short English paywall heading adapted to this person's needs",
            th: "Short Thai paywall heading adapted to this person's needs"
          }
        }
      },
      healthScore,
      instructions: [
        "Return exactly one top-level key: advice.",
        "advice must include overview, paywallEyebrow, paywallTitle, paywallSubtitle, and paywallFeatures.",
        "overview, paywallEyebrow, paywallTitle, and paywallSubtitle must each be localized objects with exactly en and th strings.",
        "paywallFeatures must contain exactly 3 items.",
        "Each paywallFeatures item must include name and description.",
        "Each paywallFeatures item name and description must be localized objects with exactly en and th strings.",
        "Base the overview on the lowest-scoring HealthScore domain and include one practical way to improve.",
        "Mention the relevant domain naturally, but do not repeat long score tables.",
        "Keep overview to 2 concise sentences.",
        "Keep paywallEyebrow under 34 characters in English.",
        "Keep paywallTitle under 70 characters in English.",
        "Keep paywallSubtitle under 160 characters in English.",
        "Keep each paywallFeatures name under 42 characters in English.",
        "Keep each paywallFeatures description under 150 characters in English.",
        "The paywall copy should adapt the core offer: unlock a bespoke nutrition plan that shows what the user's body may need in the right amount.",
        "The three feature cards should explain relevant product benefits, such as focus-domain prioritisation, right-amount guidance, routine support, lab awareness, or reassessment.",
        "Give practical lifestyle, behaviour, tracking, or lab-awareness guidance only.",
        "Do not include supplement recommendations, product names, ingredient names, doses, links, prices, plan names, discounts, false urgency, fear-based copy, or medical instructions.",
        "Return both English and Thai regardless of the requested locale."
      ],
      locale
    },
    null,
    2
  );
}

function retryPrompt(errors: string[]) {
  return [
    "The previous JSON response failed validation.",
    "Return corrected JSON only.",
    "Do not include markdown or prose.",
    "Validation errors:",
    ...errors.map((error) => `- ${error}`)
  ].join("\n");
}

async function callGrok({
  apiKey,
  messages,
  model
}: Readonly<{
  apiKey: string;
  messages: Array<{ content: string; role: "assistant" | "system" | "user" }>;
  model: string;
}>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(XAI_CHAT_COMPLETIONS_URL, {
      body: JSON.stringify({
        messages,
        model,
        response_format: { type: "json_object" },
        stream: false,
        temperature: 0.2
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
        `xAI HealthScore request failed with ${response.status}: ${body.slice(0, 500)}`
      );
    }

    return (await response.json()) as XaiChatCompletion;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonObject(content: string | null | undefined) {
  if (!content) {
    throw new Error("Model returned empty content");
  }

  const trimmed = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(
        trimmed.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1")
      ) as unknown;
    }

    throw new Error("Model returned content that was not valid JSON");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readText(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function readLocalizedTextValue(
  value: unknown,
  path: string,
  errors: string[]
): LocalizedHealthScoreText {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object with en and th strings`);
    return { en: "", th: "" };
  }

  const unexpectedKeys = Object.keys(value).filter(
    (localizedKey) => localizedKey !== "en" && localizedKey !== "th"
  );

  if (unexpectedKeys.length > 0) {
    errors.push(
      `${path} must only include en and th, found: ${unexpectedKeys.join(", ")}`
    );
  }

  const en = readText(value, "en");
  const th = readText(value, "th");

  if (!en) {
    errors.push(`${path}.en is required`);
  }

  if (!th) {
    errors.push(`${path}.th is required`);
  }

  return { en, th };
}

function readLocalizedText(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
) {
  return readLocalizedTextValue(record[key], `advice.${key}`, errors);
}

function readPaywallFeatures(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
) {
  const value = record[key];

  if (!Array.isArray(value)) {
    errors.push(`advice.${key} must be an array`);
    return [];
  }

  if (value.length !== 3) {
    errors.push(`advice.${key} must contain exactly 3 items`);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      errors.push(
        `advice.${key}[${index}] must be an object with name and description`
      );

      return {
        description: { en: "", th: "" },
        name: { en: "", th: "" }
      };
    }

    const unexpectedKeys = Object.keys(item).filter(
      (itemKey) => itemKey !== "description" && itemKey !== "name"
    );

    if (unexpectedKeys.length > 0) {
      errors.push(
        `advice.${key}[${index}] must only include name and description, found: ${unexpectedKeys.join(", ")}`
      );
    }

    return {
      description: readLocalizedTextValue(
        item.description,
        `advice.${key}[${index}].description`,
        errors
      ),
      name: readLocalizedTextValue(
        item.name,
        `advice.${key}[${index}].name`,
        errors
      )
    };
  }) satisfies HealthScorePaywallFeature[];
}

function validateAdvice(value: unknown) {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { errors: ["Top-level response must be a JSON object"] };
  }

  const unexpectedTopLevelKeys = Object.keys(value).filter(
    (key) => key !== "advice"
  );

  if (unexpectedTopLevelKeys.length > 0) {
    errors.push(
      `Top-level response must only include advice, found: ${unexpectedTopLevelKeys.join(", ")}`
    );
  }

  if (!isRecord(value.advice)) {
    return { errors: [...errors, "advice must be an object"] };
  }

  const unexpectedAdviceKeys = Object.keys(value.advice).filter(
    (key) =>
      key !== "overview" &&
      key !== "paywallEyebrow" &&
      key !== "paywallFeatures" &&
      key !== "paywallSubtitle" &&
      key !== "paywallTitle"
  );

  if (unexpectedAdviceKeys.length > 0) {
    errors.push(
      `advice includes unexpected keys: ${unexpectedAdviceKeys.join(", ")}`
    );
  }

  const advice = {
    overview: readLocalizedText(value.advice, "overview", errors),
    paywallEyebrow: readLocalizedText(value.advice, "paywallEyebrow", errors),
    paywallFeatures: readPaywallFeatures(
      value.advice,
      "paywallFeatures",
      errors
    ),
    paywallSubtitle: readLocalizedText(value.advice, "paywallSubtitle", errors),
    paywallTitle: readLocalizedText(value.advice, "paywallTitle", errors)
  } satisfies HealthScoreAdvice;

  return errors.length > 0 ? { errors } : { advice, errors };
}

export async function analyzeHealthScoreAdvice({
  answers,
  healthScore,
  locale
}: Readonly<{
  answers: unknown;
  healthScore: HealthScoreResult;
  locale: Locale;
}>) {
  const config = grokConfig();
  const messages: Array<{
    content: string;
    role: "assistant" | "system" | "user";
  }> = [
    { content: systemPrompt(), role: "system" },
    { content: userPrompt({ answers, healthScore, locale }), role: "user" }
  ];
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const completion = await callGrok({
        apiKey: config.apiKey,
        messages,
        model: config.model
      });
      const content = completion.choices?.[0]?.message?.content;
      const validation = validateAdvice(parseJsonObject(content));

      if (validation.advice) {
        return validation.advice;
      }

      lastErrors = validation.errors;
      messages.push({ content: content ?? "", role: "assistant" });
      messages.push({ content: retryPrompt(lastErrors), role: "user" });
    } catch (error) {
      lastErrors = [
        error instanceof Error
          ? error.message
          : "Unknown HealthScore analysis error"
      ];
      messages.push({ content: retryPrompt(lastErrors), role: "user" });
    }
  }

  throw new Error(
    `HealthScore analysis failed after ${MAX_ATTEMPTS} attempts: ${lastErrors.join("; ")}`
  );
}
