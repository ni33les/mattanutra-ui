import type { AssessmentPlan } from "@/lib/assessment-jobs";
import type { Locale } from "@/lib/i18n";
import type {
  FormulationBlueprint,
  FormulationIngredient,
  LocalizedText,
  FormulationStatus
} from "@/lib/formulation-types";

type AnalysisAuditEvent = {
  eventType: string;
  level?: "critical" | "high" | "low" | "medium";
  payload?: Record<string, unknown>;
};

type AnalysisInput = Readonly<{
  answers: unknown;
  audit?: (event: AnalysisAuditEvent) => Promise<void>;
  locale: Locale;
  plan: AssessmentPlan;
  planId: string;
}>;

type AnalysisResult = Readonly<{
  attempts: number;
  formulation: FormulationBlueprint;
  model: string;
  promptVersion: string;
  reasoningEffort: string;
  responseId?: string;
}>;

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
const DEFAULT_GROK_MODEL = "grok-4.3";
const DEFAULT_FORMULATION_REASONING_EFFORT = "medium";
const DEFAULT_PROMPT_VERSION = "v1";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 360_000;
const VALID_STATUSES = new Set<FormulationStatus>([
  "add",
  "covered",
  "review"
]);

function getConfiguredValue(value: string | undefined) {
  return value?.trim() ?? "";
}

function getGrokConfig() {
  const apiKey = getConfiguredValue(process.env.XAI_API_KEY);

  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured");
  }

  return {
    apiKey,
    model: getConfiguredValue(process.env.GROK_MODEL) || DEFAULT_GROK_MODEL,
    promptVersion:
      getConfiguredValue(process.env.FORMULATION_PROMPT_VERSION) ||
      DEFAULT_PROMPT_VERSION,
    reasoningEffort:
      getConfiguredValue(process.env.FORMULATION_REASONING_EFFORT) ||
      DEFAULT_FORMULATION_REASONING_EFFORT
  };
}

function systemPrompt(promptVersion: string) {
  return [
    `MattaNutra formulation analysis engine ${promptVersion}.`,
    "You are generating a wellness-oriented nutritional formulation brief.",
    "This is not medical advice, a prescription, a diagnosis, or a treatment plan.",
    "Use the completed assessment to produce a concise supplement breakdown.",
    "Do not include product recommendations, marketplace links, personal contact data, markdown, explanations outside JSON, or medical claims.",
    "The first character of your response must be { and the last character must be }.",
    "Every supplementBreakdown entry must be a JSON object, never a string.",
    "Use double-quoted JSON only. Do not use comments, markdown fences, or trailing commas.",
    "Return JSON only."
  ].join("\n");
}

function userPrompt({
  answers,
  locale,
  plan,
  planId
}: Pick<AnalysisInput, "answers" | "locale" | "plan" | "planId">) {
  return JSON.stringify(
    {
      assessment: answers,
      contract: {
        supplementBreakdown: [
          {
            category:
              "Foundation | Foundation add-on | Add separately | Targeted | Review",
            dailyDose: {
              en: "short English daily dose string",
              th: "short Thai daily dose string"
            },
            effectivenessRank:
              "integer starting at 1; 1 is the most effective/highest-impact suggestion for this person",
            id: "stable kebab-case identifier",
            rationale: {
              en: "one English sentence explaining the wellness benefit in plain language",
              th: "one Thai sentence explaining the wellness benefit in plain language"
            },
            status: "covered | add | review",
            supplement: {
              en: "English supplement name",
              th: "Thai supplement name"
            }
          }
        ]
      },
      instructions: [
        "Return a JSON object with exactly one top-level key: supplementBreakdown.",
        "supplementBreakdown must contain 6 to 18 items.",
        "Every supplementBreakdown array entry must be an object. Do not put plain strings in the array.",
        "Every item must include id, category, supplement, dailyDose, effectivenessRank, status, and rationale.",
        "Set effectivenessRank as a unique integer from 1 to the number of items, where 1 is the most effective/highest-impact supplement suggestion for this person's assessment.",
        "Order supplementBreakdown by effectivenessRank ascending.",
        "supplement, dailyDose, and rationale must each be localized objects with exactly en and th string values.",
        "Write the English fields for a consumer wellness audience, and the Thai fields as natural Thai, not transliterated English unless the ingredient name is normally used that way.",
        "Keep category and status as canonical English values for internal processing.",
        "Use status=review for anything that should be checked before use because of medication, pregnancy, breastfeeding, condition, or uncertainty.",
        "Keep rationales benefit-focused, for example: Supports skin, joint, and active lifestyle goals.",
        "Return both English and Thai display copy regardless of the requested locale."
      ],
      locale,
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
    "Every supplementBreakdown item must be a JSON object, not a string.",
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(XAI_CHAT_COMPLETIONS_URL, {
      body: JSON.stringify({
        messages,
        model,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
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
        `xAI request failed with ${response.status}: ${body.slice(0, 500)}`
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
    errors.push(
      `supplementBreakdown[${index}].${key} must be an object with en and th strings, not a plain string`
    );
    return { en: "", th: "" };
  }

  if (!isRecord(value)) {
    errors.push(
      `supplementBreakdown[${index}].${key} must be an object with en and th strings`
    );
    return { en: "", th: "" };
  }

  const unexpectedKeys = Object.keys(value).filter(
    (localizedKey) => localizedKey !== "en" && localizedKey !== "th"
  );

  if (unexpectedKeys.length > 0) {
    errors.push(
      `supplementBreakdown[${index}].${key} must only include en and th, found: ${unexpectedKeys.join(", ")}`
    );
  }

  const en = readText(value, "en");
  const th = readText(value, "th");

  if (!en) {
    errors.push(`supplementBreakdown[${index}].${key}.en is required`);
  }

  if (!th) {
    errors.push(`supplementBreakdown[${index}].${key}.th is required`);
  }

  return { en, th };
}

function textFromLocalizedCandidate(value: unknown) {
  if (typeof value === "string") {
    return "";
  }

  if (!isRecord(value)) {
    return "";
  }

  return readText(value, "en") || readText(value, "th");
}

function validateFormulation(value: unknown) {
  const errors: string[] = [];
  const supplementBreakdown: FormulationIngredient[] = [];

  const response = Array.isArray(value)
    ? { supplementBreakdown: value }
    : value;

  if (!isRecord(response)) {
    return { errors: ["Top-level response must be a JSON object"] };
  }

  const unexpectedTopLevelKeys = Object.keys(response).filter(
    (key) => key !== "supplementBreakdown"
  );

  if (unexpectedTopLevelKeys.length > 0) {
    errors.push(
      `Top-level response must only include supplementBreakdown, found: ${unexpectedTopLevelKeys.join(", ")}`
    );
  }

  const rawItems = response.supplementBreakdown;

  if (!Array.isArray(rawItems)) {
    return { errors: ["supplementBreakdown must be an array"] };
  }

  if (rawItems.length < 1) {
    errors.push("supplementBreakdown must contain at least one item");
  }

  if (rawItems.length > 30) {
    errors.push("supplementBreakdown must contain no more than 30 items");
  }

  const seenIds = new Set<string>();
  const seenRanks = new Set<number>();

  rawItems.forEach((item, index) => {
    if (typeof item === "string") {
      errors.push(`supplementBreakdown[${index}] must be an object`);
      return;
    }

    if (!isRecord(item)) {
      errors.push(`supplementBreakdown[${index}] must be an object`);
      return;
    }

    const supplementText = textFromLocalizedCandidate(item.supplement);
    const id =
      readText(item, "id") ||
      slugify(supplementText, `supplement-${index + 1}`);
    const category = readText(item, "category") || "Targeted";
    const supplement = readLocalizedText(item, "supplement", index, errors);
    const dailyDose = readLocalizedText(item, "dailyDose", index, errors);
    const rawRank = Number(item.effectivenessRank);
    const effectivenessRank = Number.isInteger(rawRank) ? rawRank : 0;
    const rawStatus = readText(item, "status");
    const status = VALID_STATUSES.has(rawStatus as FormulationStatus)
      ? rawStatus
      : "review";
    const rationale = readLocalizedText(item, "rationale", index, errors);

    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) {
      errors.push(
        `supplementBreakdown[${index}].id must be stable kebab-case`
      );
    } else if (seenIds.has(id)) {
      errors.push(`supplementBreakdown[${index}].id is duplicated`);
    } else {
      seenIds.add(id);
    }

    if (effectivenessRank < 1 || effectivenessRank > rawItems.length) {
      errors.push(
        `supplementBreakdown[${index}].effectivenessRank must be an integer from 1 to ${rawItems.length}`
      );
    } else if (seenRanks.has(effectivenessRank)) {
      errors.push(
        `supplementBreakdown[${index}].effectivenessRank is duplicated`
      );
    } else {
      seenRanks.add(effectivenessRank);
    }

    supplementBreakdown.push({
      category,
      dailyDose,
      effectivenessRank,
      id,
      rationale,
      status: status as FormulationStatus,
      supplement
    });
  });

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors,
    formulation: {
      supplementBreakdown: [...supplementBreakdown].sort(
        (a, b) => a.effectivenessRank - b.effectivenessRank
      )
    } satisfies FormulationBlueprint
  };
}

export async function analyzeFormulationWithGrok(
  input: AnalysisInput
): Promise<AnalysisResult> {
  const config = getGrokConfig();
  const messages: Array<{
    content: string;
    role: "assistant" | "system" | "user";
  }> = [
    { content: systemPrompt(config.promptVersion), role: "system" },
    {
      content: userPrompt(input),
      role: "user"
    }
  ];
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await audit(input, {
      eventType: "grok_attempt_started",
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
      const validation = validateFormulation(parsed);

      if (validation.formulation) {
        await audit(input, {
          eventType: "grok_validation_passed",
          level: "low",
          payload: {
            attempt,
            itemCount: validation.formulation.supplementBreakdown.length,
            model: completion.model ?? config.model,
            promptVersion: config.promptVersion,
            reasoningEffort: config.reasoningEffort,
            responseId: completion.id,
            usage: completion.usage
          }
        });

        return {
          attempts: attempt,
          formulation: validation.formulation,
          model: completion.model ?? config.model,
          promptVersion: config.promptVersion,
          reasoningEffort: config.reasoningEffort,
          responseId: completion.id
        };
      }

      lastErrors = validation.errors;
      await audit(input, {
        eventType: "grok_validation_failed",
        level: "medium",
        payload: {
          attempt,
          errors: lastErrors,
          responseId: completion.id
        }
      });

      messages.push({
        content: content ?? "",
        role: "assistant"
      });
      messages.push({
        content: retryPrompt(lastErrors),
        role: "user"
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown xAI analysis error";
      lastErrors = [message];
      await audit(input, {
        eventType: "grok_attempt_failed",
        level: "high",
        payload: {
          attempt,
          error: message
        }
      });

      messages.push({
        content: retryPrompt(lastErrors),
        role: "user"
      });
    }
  }

  throw new Error(
    `Grok formulation analysis failed after ${MAX_ATTEMPTS} attempts: ${lastErrors.join("; ")}`
  );
}
