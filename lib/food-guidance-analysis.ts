import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type {
  FoodGuidanceBlueprint,
  FoodGuidanceItem,
  FormulationBlueprint,
  FormulationStatus,
  LocalizedText,
  PlanChatMessage,
  PlanFeedbackItem
} from "@/lib/formulation-types";
import {
  callGrokChatCompletion,
  configuredGrokModel,
  configuredGrokValue,
  getRequiredXaiApiKey
} from "@/lib/grok-client";
import { type Locale } from "@/lib/i18n";

type AnalysisAuditEvent = {
  eventType: string;
  level?: "critical" | "high" | "low" | "medium";
  payload?: Record<string, unknown>;
};

type AnalysisInput = Readonly<{
  answers: unknown;
  audit?: (event: AnalysisAuditEvent) => Promise<void>;
  chatMessages?: PlanChatMessage[];
  locale: Locale;
  plan: AssessmentPlan;
  planFeedback?: PlanFeedbackItem[];
  planId: string;
  previousFoodGuidance?: FoodGuidanceBlueprint | null;
  previousFormulation?: FormulationBlueprint | null;
  taskId?: string | null;
}>;

type AnalysisResult = Readonly<{
  attempts: number;
  foodGuidance: FoodGuidanceBlueprint;
  model: string;
  promptVersion: string;
  reasoningEffort: string;
  responseId?: string;
  usage?: unknown;
}>;

const DEFAULT_REASONING_EFFORT = "low";
const DEFAULT_PROMPT_VERSION = "v1";
const MAX_ATTEMPTS = 3;
const MAX_RESPONSE_TOKENS = 5_000;
const REQUEST_TIMEOUT_MS = 360_000;
const VALID_STATUSES = new Set<FormulationStatus>([
  "add",
  "covered",
  "review"
]);

function getGrokConfig() {
  return {
    apiKey: getRequiredXaiApiKey(),
    model: configuredGrokModel(process.env.GROK_MODEL),
    promptVersion:
      configuredGrokValue(process.env.FOOD_GUIDANCE_PROMPT_VERSION) ||
      configuredGrokValue(process.env.FORMULATION_PROMPT_VERSION) ||
      DEFAULT_PROMPT_VERSION,
    reasoningEffort:
      configuredGrokValue(process.env.FOOD_GUIDANCE_REASONING_EFFORT) ||
      configuredGrokValue(process.env.FORMULATION_REASONING_EFFORT) ||
      DEFAULT_REASONING_EFFORT
  };
}

function systemPrompt(promptVersion: string) {
  return [
    `MattaNutra food guidance engine ${promptVersion}.`,
    "You are generating wellness-oriented food guidance, not a medical diagnosis, prescription, or treatment plan.",
    "Use the completed assessment to suggest practical foods and ingredients such as seeds, pulses, teas, fermented foods, fish, whole grains, fruit, vegetables, herbs, spices, and Thai staples.",
    "Safety is mandatory: never recommend foods matching disclosed allergies or avoidances; avoid extreme low-carb, fasting, juice cleanse, detox, weight-loss-pressure, raw high-risk foods, or one-size-fits-all elimination plans.",
    "For diabetes, kidney disease, sodium or heart concerns, pregnancy, breastfeeding, digestive disease, medication interactions, minors, older adults, red-flag symptoms, or eating disorder history, choose conservative general wellness foods and use status=review where clinician review is prudent.",
    "Do not include supplements, product recommendations, marketplace links, personal contact data, markdown, explanations outside JSON, or medical claims.",
    "The first character of your response must be { and the last character must be }.",
    "Every foodGuidance entry must be a JSON object, never a string.",
    "Use double-quoted JSON only. Do not use comments, markdown fences, or trailing commas.",
    "Return JSON only."
  ].join("\n");
}

function userPrompt({
  answers,
  chatMessages,
  locale,
  plan,
  planFeedback,
  previousFoodGuidance,
  previousFormulation,
  planId
}: Pick<
  AnalysisInput,
  | "answers"
  | "chatMessages"
  | "locale"
  | "plan"
  | "planFeedback"
  | "previousFoodGuidance"
  | "previousFormulation"
  | "planId"
>) {
  return JSON.stringify(
    {
      assessment: answers,
      currentPlanContext: {
        chatMessages: (chatMessages ?? []).map((message) => ({
          body: message.body,
          createdAt: message.createdAt,
          role: message.role
        })),
        planFeedback: planFeedback ?? [],
        previousFoodGuidance,
        previousSupplementGuidance: previousFormulation
      },
      contract: {
        foodGuidance: [
          {
            category:
              "Seeds | Pulses | Teas | Fermented foods | Fish | Whole grains | Fruit and vegetables | Herbs and spices | Thai staples | Other",
            effectivenessRank:
              "integer starting at 1; 1 is the most effective/highest-impact suggestion for this person",
            food: "food or ingredient name in the requested display locale",
            frequency: "short frequency in the requested display locale, e.g. 3-4 times/week",
            id: "stable kebab-case identifier",
            rationale: "one sentence explaining the wellness benefit in the requested display locale",
            serving: "short practical serving in the requested display locale, e.g. 1 tbsp or 1 small bowl",
            status: "covered | add | review"
          }
        ]
      },
      instructions: [
        "Return a JSON object with exactly one top-level key: foodGuidance.",
        "foodGuidance must contain 6 to 18 items.",
        "Every item must include id, category, food, serving, frequency, effectivenessRank, status, and rationale.",
        "Set effectivenessRank as a unique integer from 1 to the number of items, where 1 is the most effective/highest-impact food suggestion.",
        "Order foodGuidance by effectivenessRank ascending.",
        "food, serving, frequency, and rationale must each be plain strings in the requested display locale.",
        "Keep category and status as canonical English values for internal processing.",
        "Use status=review for anything that should be checked before use because of medication, pregnancy, breastfeeding, condition, allergy uncertainty, or digestive sensitivity.",
        "Return only the requested display locale for user-facing prose. Do not return parallel English/Thai/Chinese copies.",
        "When currentPlanContext.planFeedback is present, treat it as client-stated food preferences, avoidances, cuisine preferences, and safety disclosures for this new version.",
        "Do not reintroduce foods the client asked to remove, avoid, or dislikes.",
        "Use previousFoodGuidance only as context; this response must be a fresh full version, not a patch."
      ],
      locale,
      outputLocaleMode: "single_display_locale",
      plan,
      planId
    },
    null,
    2
  );
}

function retryPrompt(errors: string[]) {
  return [
    "The previous JSON response failed validation.",
    "Return corrected JSON only, matching the required contract.",
    "Do not include markdown or prose.",
    "Every foodGuidance item must be a JSON object, not a string.",
    "Every item must include a unique integer effectivenessRank where 1 is highest impact.",
    "If a field is uncertain, set status to review and still return valid JSON.",
    "Validation errors:",
    ...errors.map((error) => `- ${error}`)
  ].join("\n");
}

async function audit(input: AnalysisInput, event: AnalysisAuditEvent) {
  await input.audit?.(event);
}

async function callGrok({
  apiKey,
  messages,
  model,
  reasoningEffort
}: Readonly<{
  apiKey: string;
  messages: Array<{ content: string; role: "assistant" | "system" | "user" }>;
  model: string;
  reasoningEffort?: string;
}>) {
  return callGrokChatCompletion({
    apiKey,
    maxTokens: MAX_RESPONSE_TOKENS,
    messages,
    model,
    purpose: "food guidance request",
    reasoningEffort,
    temperature: 0.2,
    timeoutMs: REQUEST_TIMEOUT_MS
  });
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
      const candidate = trimmed
        .slice(start, end + 1)
        .replace(/,\s*([}\]])/g, "$1");

      return JSON.parse(candidate) as unknown;
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

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || fallback;
}

function readLocalizedText(
  record: Record<string, unknown>,
  key: string,
  index: number,
  errors: string[]
): LocalizedText {
  const value = record[key];

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (!isRecord(value)) {
    errors.push(
      `foodGuidance[${index}].${key} must be an object with localized string values`
    );
    return {};
  }

  const entries = Object.fromEntries(
    Object.entries(value)
      .filter(([localizedKey, text]) =>
        /^[a-z]{2}(?:-[A-Z0-9]{2,8})?$/.test(localizedKey) &&
        typeof text === "string" &&
        text.trim().length > 0
      )
      .map(([localizedKey, text]) => [localizedKey, String(text).trim()])
  );

  if (Object.keys(entries).length < 1) {
    errors.push(`foodGuidance[${index}].${key} requires at least one localized string`);
  }

  return entries;
}

function textFromLocalizedCandidate(value: unknown) {
  if (typeof value === "string" || !isRecord(value)) {
    return "";
  }

  return readText(value, "en") || Object.values(value).find(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  ) || "";
}

function validateFoodGuidance(value: unknown) {
  const errors: string[] = [];
  const foodGuidance: FoodGuidanceItem[] = [];
  const response = Array.isArray(value) ? { foodGuidance: value } : value;

  if (!isRecord(response)) {
    return { errors: ["Top-level response must be a JSON object"] };
  }

  const unexpectedTopLevelKeys = Object.keys(response).filter(
    (key) => key !== "foodGuidance"
  );

  if (unexpectedTopLevelKeys.length > 0) {
    errors.push(
      `Top-level response must only include foodGuidance, found: ${unexpectedTopLevelKeys.join(", ")}`
    );
  }

  const rawItems = response.foodGuidance;

  if (!Array.isArray(rawItems)) {
    return { errors: ["foodGuidance must be an array"] };
  }

  if (rawItems.length < 1) {
    errors.push("foodGuidance must contain at least one item");
  }

  if (rawItems.length > 30) {
    errors.push("foodGuidance must contain no more than 30 items");
  }

  const seenIds = new Set<string>();
  const seenRanks = new Set<number>();

  rawItems.forEach((item, index) => {
    if (typeof item === "string" || !isRecord(item)) {
      errors.push(`foodGuidance[${index}] must be an object`);
      return;
    }

    const foodText = textFromLocalizedCandidate(item.food);
    const id = readText(item, "id") || slugify(foodText, `food-${index + 1}`);
    const category = readText(item, "category") || "Other";
    const food = readLocalizedText(item, "food", index, errors);
    const serving = readLocalizedText(item, "serving", index, errors);
    const frequency = readLocalizedText(item, "frequency", index, errors);
    const rawRank = Number(item.effectivenessRank);
    const effectivenessRank = Number.isInteger(rawRank) ? rawRank : 0;
    const rawStatus = readText(item, "status");
    const status = VALID_STATUSES.has(rawStatus as FormulationStatus)
      ? rawStatus
      : "review";
    const rationale = readLocalizedText(item, "rationale", index, errors);

    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) {
      errors.push(`foodGuidance[${index}].id must be stable kebab-case`);
    } else if (seenIds.has(id)) {
      errors.push(`foodGuidance[${index}].id is duplicated`);
    } else {
      seenIds.add(id);
    }

    if (effectivenessRank < 1 || effectivenessRank > rawItems.length) {
      errors.push(
        `foodGuidance[${index}].effectivenessRank must be an integer from 1 to ${rawItems.length}`
      );
    } else if (seenRanks.has(effectivenessRank)) {
      errors.push(`foodGuidance[${index}].effectivenessRank is duplicated`);
    } else {
      seenRanks.add(effectivenessRank);
    }

    foodGuidance.push({
      category,
      effectivenessRank,
      food,
      frequency,
      id,
      rationale,
      serving,
      status: status as FormulationStatus
    });
  });

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors,
    foodGuidance: {
      foodGuidance: [...foodGuidance].sort(
        (first, second) => first.effectivenessRank - second.effectivenessRank
      )
    } satisfies FoodGuidanceBlueprint
  };
}

export async function analyzeFoodGuidanceWithGrok(
  input: AnalysisInput
): Promise<AnalysisResult> {
  const config = getGrokConfig();
  const messages: Array<{
    content: string;
    role: "assistant" | "system" | "user";
  }> = [
    { content: systemPrompt(config.promptVersion), role: "system" },
    { content: userPrompt(input), role: "user" }
  ];
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await audit(input, {
      eventType: "food_grok_attempt_started",
      level: "low",
      payload: {
        attempt,
        model: config.model,
        promptVersion: config.promptVersion,
        reasoningEffort: config.reasoningEffort
      }
    });

    try {
      const completion = await callGrok({
        apiKey: config.apiKey,
        messages,
        model: config.model,
        reasoningEffort: config.reasoningEffort
      });
      const content = completion.choices?.[0]?.message?.content;
      const parsed = parseJsonObject(content);
      const validation = validateFoodGuidance(parsed);

      if (validation.foodGuidance) {
        await audit(input, {
          eventType: "food_grok_validation_passed",
          level: "low",
          payload: {
            attempt,
            itemCount: validation.foodGuidance.foodGuidance.length,
            model: completion.model ?? config.model,
            promptVersion: config.promptVersion,
            reasoningEffort: config.reasoningEffort,
            responseId: completion.id,
            usage: completion.usage
          }
        });

        return {
          attempts: attempt,
          foodGuidance: validation.foodGuidance,
          model: completion.model ?? config.model,
          promptVersion: config.promptVersion,
          reasoningEffort: config.reasoningEffort,
          responseId: completion.id,
          usage: completion.usage
        };
      }

      lastErrors = validation.errors;
      await audit(input, {
        eventType: "food_grok_validation_failed",
        level: "medium",
        payload: {
          attempt,
          errors: lastErrors,
          responseId: completion.id
        }
      });
      messages.push({ content: content ?? "", role: "assistant" });
      messages.push({ content: retryPrompt(lastErrors), role: "user" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown xAI food guidance error";
      lastErrors = [message];
      await audit(input, {
        eventType: "food_grok_attempt_failed",
        level: "medium",
        payload: {
          attempt,
          error: message
        }
      });
      messages.push({ content: retryPrompt(lastErrors), role: "user" });
    }
  }

  throw new Error(`Food guidance analysis failed: ${lastErrors.join("; ")}`);
}
