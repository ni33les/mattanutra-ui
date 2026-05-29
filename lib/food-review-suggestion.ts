import { recordXaiUsageCost } from "@/lib/finance-ledger";
import {
  callGrokChatCompletion,
  configuredGrokModel,
  configuredGrokValue,
  getRequiredXaiApiKey
} from "@/lib/grok-client";
import type { Locale } from "@/lib/i18n";

export type FoodReviewSuggestionInput = Readonly<{
  currentFrequency?: string | null;
  currentRationale?: string | null;
  currentServing?: string | null;
  flagReason?: string | null;
  foodName: string;
  locale: Locale;
  reviewKind?: string | null;
}>;

export type FoodReviewSuggestion = Readonly<{
  frequency: string;
  rationale: string;
  responseId?: string;
  reviewerNote: string;
  serving: string;
}>;

const DEFAULT_REASONING_EFFORT = "low";
const REQUEST_TIMEOUT_MS = 90_000;
const displayLocaleNames = {
  en: "English",
  th: "Thai",
  "zh-CN": "Simplified Chinese"
} satisfies Record<Locale, string>;

function config() {
  return {
    apiKey: getRequiredXaiApiKey(),
    model: configuredGrokModel(process.env.GROK_MODEL),
    reasoningEffort:
      configuredGrokValue(process.env.FOOD_REVIEW_REASONING_EFFORT) ||
      configuredGrokValue(process.env.FOOD_GUIDANCE_REASONING_EFFORT) ||
      DEFAULT_REASONING_EFFORT
  };
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
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
    }

    throw new Error("Model returned invalid JSON");
  }
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 800)
    : fallback;
}

async function callGrok(input: FoodReviewSuggestionInput) {
  const grok = config();

  const completion = await callGrokChatCompletion({
    apiKey: grok.apiKey,
    maxTokens: 350,
    messages: [
      {
        content: [
              "You draft conservative food guidance details for MattaNutra human review.",
              "This is internal wellness review support, not medical advice.",
              "Return JSON only. No markdown, no prose outside JSON.",
              "Return exactly one root JSON object with only these keys: serving, frequency, rationale, reviewerNote.",
              "Do not approve, reject, override allergies, or override safety rules.",
              "Use short practical serving sizes, ordinary food language, and conservative frequency.",
              "Avoid extreme dieting, fasting, detox language, weight-loss pressure, and medical treatment claims.",
              `Write serving, frequency, rationale, and reviewerNote as plain strings in ${displayLocaleNames[input.locale]} (${input.locale}).`,
              "Return only the requested locale for prose. Do not return localized maps or parallel English/Thai/Chinese copies."
        ].join("\n"),
        role: "system"
      },
      {
        content: JSON.stringify(
              {
                foodReview: input,
                output: {
                  frequency: "short practical frequency",
                  rationale:
                    "one concise sentence explaining the general wellness reason",
                  reviewerNote:
                    "short admin-facing note about why this draft is conservative",
                  serving: "short practical serving, e.g. 1 tbsp or 1 small bowl"
                }
              },
              null,
              2
        ),
        role: "user"
      }
    ],
    model: grok.model,
    purpose: "food review suggestion",
    reasoningEffort: grok.reasoningEffort,
    temperature: 0.1,
    timeoutMs: REQUEST_TIMEOUT_MS
  });

  await recordXaiUsageCost({
    metadata: {
      foodName: input.foodName,
      locale: input.locale,
      outputLocaleMode: "single_display_locale",
      reviewKind: input.reviewKind
    },
    model: completion.model ?? grok.model,
    purpose: "food_review_suggestion",
    reasoningEffort: grok.reasoningEffort,
    responseId: completion.id,
    usage: completion.usage
  });

  return completion;
}

export async function suggestFoodReviewDetails(
  input: FoodReviewSuggestionInput
): Promise<FoodReviewSuggestion> {
  if (!input.foodName.trim()) {
    throw new Error("Food name is required");
  }

  const response = await callGrok(input);
  const parsed = parseJsonObject(response.choices?.[0]?.message?.content);

  return {
    frequency: text(parsed.frequency, input.currentFrequency ?? ""),
    rationale: text(parsed.rationale, input.currentRationale ?? ""),
    responseId: response.id,
    reviewerNote: text(
      parsed.reviewerNote,
      "Conservative AI-drafted food guidance details for human review."
    ),
    serving: text(parsed.serving, input.currentServing ?? "")
  };
}
