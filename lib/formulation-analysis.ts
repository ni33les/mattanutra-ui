import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type { CanonicalSupplementOption } from "@/lib/canonical-supplements";
import { defaultLocale, type Locale } from "@/lib/i18n";
import type {
  FoodGuidanceBlueprint,
  FormulationBlueprint,
  FormulationCaution,
  FormulationIngredient,
  LocalizedText,
  MarketingPoint,
  PlanChatMessage,
  PlanFeedbackItem,
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
  canonicalSupplements?: CanonicalSupplementOption[];
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
  formulation: FormulationBlueprint;
  model: string;
  promptVersion: string;
  reasoningEffort: string;
  responseId?: string;
  usage?: unknown;
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
const DEFAULT_FORMULATION_REASONING_EFFORT = "low";
const DEFAULT_PROMPT_VERSION = "v1";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 360_000;
const VALID_STATUSES = new Set<FormulationStatus>([
  "add",
  "covered",
  "review"
]);
const VALID_CAUTION_SEVERITIES = new Set<FormulationCaution["severity"]>([
  "caution",
  "info",
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

function compactStringArray(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function compactText(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildAssessmentSafetyContext(answers: unknown) {
  const record = isRecord(answers) ? answers : {};
  const labs = isRecord(record.labs) ? record.labs : {};
  const labUnits = isRecord(record.labUnits) ? record.labUnits : {};
  const medicationAnswer = compactText(record, "meds");

  return {
    allergies: compactStringArray(record, "allergies"),
    antibiotics: compactText(record, "antibiotics"),
    budget: compactText(record, "budget"),
    country: compactText(record, "country") ?? "TH",
    digestiveCondition: compactText(record, "digCondition"),
    familyHistory: compactStringArray(record, "family"),
    foodRestrictions: {
      allergies: compactStringArray(record, "allergies"),
      diet: compactText(record, "diet"),
      frequency: isRecord(record.foodFrequency) ? record.foodFrequency : {}
    },
    formPreference: compactText(record, "form"),
    kidney: compactText(record, "kidney"),
    labs: Object.fromEntries(
      Object.entries(labs)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([key, value]) => [
          key,
          {
            unit: typeof labUnits[key] === "string" ? labUnits[key] : null,
            value
          }
        ])
    ),
    liver: compactText(record, "liver"),
    maxPills: compactText(record, "maxPills"),
    medications: {
      answer: medicationAnswer,
      classes: medicationAnswer === "yes" ? compactStringArray(record, "medTypes") : [],
      other: medicationAnswer === "yes" ? compactText(record, "otherMed") : null
    },
    menopause: compactText(record, "menopause"),
    pillCount: compactText(record, "maxPills"),
    pregnancyBreastfeedingTryingToConceive: compactText(record, "reproStatus"),
    proteinIntake: compactText(record, "protein"),
    recentSurgery: compactText(record, "surgery"),
    sex: compactText(record, "sex"),
    supplementSensitivities: {
      classes: compactStringArray(record, "suppAllergies")
    },
    supplementsCurrentlyUsed: compactText(record, "supplements"),
    trackerData: {
      hrv: compactText(record, "hrv"),
      tracker: compactText(record, "tracker"),
      vo2: compactText(record, "vo2")
    }
  };
}

function systemPrompt(promptVersion: string) {
  return [
    `MattaNutra formulation analysis engine ${promptVersion}.`,
    "You are generating a wellness-oriented nutritional formulation brief.",
    "This is not medical advice, a prescription, a diagnosis, or a treatment plan.",
    "Use the completed assessment to produce a concise supplement breakdown.",
    "Use the assessmentSafetyContext to include clear cautions where relevant.",
    "Prefer the supplied canonical supplement names exactly when they fit the assessment.",
    "Also produce concise, personalized marketing points that explain why the user's full MattaNutra plan is worth opening.",
    "Use the user-facing term cautions only. Do not output warning-named fields.",
    "Do not include product recommendations, marketplace links, personal contact data, markdown, explanations outside JSON, or medical claims.",
    "The first character of your response must be { and the last character must be }.",
    "Every supplementBreakdown entry must be a JSON object, never a string.",
    "Use double-quoted JSON only. Do not use comments, markdown fences, or trailing commas.",
    "Return JSON only."
  ].join("\n");
}

function userPrompt({
  answers,
  canonicalSupplements,
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
  | "canonicalSupplements"
  | "chatMessages"
  | "locale"
  | "plan"
  | "planFeedback"
  | "previousFoodGuidance"
  | "previousFormulation"
  | "planId"
>) {
  const requiredOutputLocales = [...new Set([defaultLocale, locale])];

  return JSON.stringify(
    {
      assessment: answers,
      assessmentSafetyContext: buildAssessmentSafetyContext(answers),
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
      canonicalSupplementCatalogue: (canonicalSupplements ?? []).map((supplement) => ({
        aliases: supplement.aliases.slice(0, 8),
        category: supplement.category,
        maxDose:
          supplement.maxAmount && supplement.maxUnit
            ? `${supplement.maxAmount} ${supplement.maxUnit}/day`
            : null,
        name: supplement.name,
        safetyFlags: supplement.safetyFlags,
        safetyNotes: supplement.safetyNotes,
        status: supplement.listStatus
      })),
      contract: {
        supplementBreakdown: [
          {
            category:
              "Foundation | Foundation add-on | Add separately | Targeted | Review",
            dailyDose: {
              en: "short English daily dose string, e.g. 200 mg/day",
              th: "short Thai daily dose string, e.g. 200 mg/day"
            },
            effectivenessRank:
              "integer starting at 1; 1 is the most effective/highest-impact suggestion for this person",
            id: "stable kebab-case identifier",
            rationale: {
              en: "one English sentence explaining the wellness benefit in plain language",
              th: "one Thai sentence explaining the wellness benefit in plain language"
            },
            cautions: [
              {
                body: {
                  en: "specific English caution tied to the assessment context",
                  th: "specific Thai caution tied to the assessment context"
                },
                id: "stable kebab-case identifier",
                relatedAnswerKeys: ["medTypes", "kidney"],
                severity: "caution | info | review",
                title: {
                  en: "short English caution title",
                  th: "short Thai caution title"
                }
              }
            ],
            status: "covered | add | review",
            supplement: {
              en: "English supplement name",
              th: "Thai supplement name"
            }
          }
        ],
        cautions: [
          {
            body: {
              en: "plan-level English caution tied to medication, pregnancy, kidney/liver, surgery, antibiotics, allergies, or uncertainty",
              th: "plan-level Thai caution tied to medication, pregnancy, kidney/liver, surgery, antibiotics, allergies, or uncertainty"
            },
            id: "stable kebab-case identifier",
            relatedAnswerKeys: ["meds", "reproStatus"],
            severity: "caution | info | review",
            title: {
              en: "short English caution title",
              th: "short Thai caution title"
            }
          }
        ],
        marketingPoints: [
          {
            body: {
              en: "one English sentence explaining the personalized value of the plan without medical claims",
              th: "one Thai sentence explaining the personalized value of the plan without medical claims"
            },
            id: "stable kebab-case identifier",
            title: {
              en: "short English title",
              th: "short Thai title"
            }
          }
        ]
      },
      instructions: [
        "Return a JSON object with exactly three top-level keys: supplementBreakdown, marketingPoints, and cautions.",
        "supplementBreakdown must contain 6 to 18 items.",
        "marketingPoints must contain 3 concise points that are specific to this assessment, the HealthScore, and the plan.",
        "Every marketingPoints array entry must be an object with id, title, and body.",
        "cautions must be an array. Return an empty array only when the assessment context truly has no relevant cautions.",
        "Every caution must be an object with id, severity, body, optional title, and optional relatedAnswerKeys.",
        "Use cautions for medication, pregnancy, breastfeeding, trying-to-conceive, kidney, liver, surgery, antibiotics, allergy, supplement sensitivity, lab, or uncertainty context.",
        "Do not use warning terminology or output warning-named keys. The user-facing term is caution.",
        `marketingPoints title and body must each be localized objects including these locale keys: ${requiredOutputLocales.join(", ")}.`,
        "Marketing copy must be truthful, benefit-led, and calm. Do not invent discounts, urgency, guarantees, cures, diagnosis, treatment claims, or product availability.",
        "Use marketingPoints to explain why the full bespoke plan is more useful than the free preview: for example prioritization, dose checks, cautions, and food-plus-supplement fit.",
        "When currentPlanContext.planFeedback is present, treat it as client-stated preferences and constraints for this new version.",
        "Use canonicalSupplementCatalogue as the preferred naming vocabulary. When a listed canonical supplement fits, set supplement.en exactly to its name.",
        "Use canonicalSupplementCatalogue safetyFlags and safetyNotes before recommending a supplement. Hard conflicts are pregnancy_caution or hormone_caution with pregnancy, breastfeeding, or trying-to-conceive context; bleeding_risk or medication_interaction with blood-thinner/anticoagulant context; kidney_caution with active kidney issues; and liver_caution with active liver issues.",
        "Do not treat stale raw medication classes as active when assessmentSafetyContext.medications.answer is not yes. Generic medication_interaction or condition_caution flags should become a caution, not status=review, unless the safetyNotes specifically match the active client context.",
        "Use canonical aliases only to recognize equivalent ingredients; do not output aliases when a canonical name exists.",
        "If a useful supplement is not in canonicalSupplementCatalogue, use a plain English ingredient name and set status=review so it can be checked.",
        "Do not output manufacturer product names, brand names, raw material concentrations, or label-strength text such as 100000 IU/g as supplement names.",
        "Do not reintroduce supplements the client asked to remove or avoid unless safety or clarity requires status=review with a conservative explanation.",
        "Use previousSupplementGuidance only as context; this response must be a fresh full version, not a patch.",
        "Every supplementBreakdown array entry must be an object. Do not put plain strings in the array.",
        "Every item must include id, category, supplement, dailyDose, effectivenessRank, status, and rationale.",
        "Set effectivenessRank as a unique integer from 1 to the number of items, where 1 is the most effective/highest-impact supplement suggestion for this person's assessment.",
        "Order supplementBreakdown by effectivenessRank ascending.",
        `supplement, dailyDose, and rationale must each be localized objects including these locale keys: ${requiredOutputLocales.join(", ")}.`,
        "Keep dailyDose machine-readable: start with one numeric amount and one unit, using mg/day, mcg/day, g/day, or IU/day whenever possible.",
        "Avoid capsule counts, serving sizes, proprietary-blend doses, vague ranges, or multiple units in dailyDose. If uncertain, use a conservative numeric dose and set status=review.",
        "Write the English fields for a consumer wellness audience, and the Thai fields as natural Thai, not transliterated English unless the ingredient name is normally used that way.",
        "Keep category and status as canonical English values for internal processing.",
        "Use status=review for anything that should be checked before use because of medication, pregnancy, breastfeeding, condition, or uncertainty, and add a linked caution.",
        "Keep rationales benefit-focused, for example: Supports skin, joint, and active lifestyle goals.",
        "Return English plus the requested locale. Include other locale keys only when they are useful and complete."
      ],
      locale,
      requiredOutputLocales,
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
    "marketingPoints must contain 3 localized objects with id, title, and body.",
    "cautions must be an array of localized caution objects.",
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

function readLocalizedTextAt(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): LocalizedText {
  const value = record[key];

  if (typeof value === "string" && value.trim()) {
    errors.push(
      `${path}.${key} must be an object with localized string values, not a plain string`
    );
    return {};
  }

  if (!isRecord(value)) {
    errors.push(
      `${path}.${key} must be an object with localized string values`
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
    errors.push(`${path}.${key} requires at least one localized string`);
  }

  return entries;
}

function readLocalizedText(
  record: Record<string, unknown>,
  key: string,
  index: number,
  errors: string[]
): LocalizedText {
  return readLocalizedTextAt(record, key, `supplementBreakdown[${index}]`, errors);
}

function textFromLocalizedCandidate(value: unknown) {
  if (typeof value === "string") {
    return "";
  }

  if (!isRecord(value)) {
    return "";
  }

  return readText(value, "en") || Object.values(value).find(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  ) || "";
}

function readCautionsAt(
  value: unknown,
  path: string,
  errors: string[]
): FormulationCaution[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return [];
  }

  const cautions: FormulationCaution[] = [];
  const seenIds = new Set<string>();

  value.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`${path}[${index}] must be an object`);
      return;
    }

    const body = readLocalizedTextAt(item, "body", `${path}[${index}]`, errors);
    const title = item.title
      ? readLocalizedTextAt(item, "title", `${path}[${index}]`, errors)
      : undefined;
    const bodyText = textFromLocalizedCandidate(body);
    const id =
      readText(item, "id") || slugify(bodyText, `caution-${index + 1}`);
    const rawSeverity = readText(item, "severity");
    const severity = VALID_CAUTION_SEVERITIES.has(
      rawSeverity as FormulationCaution["severity"]
    )
      ? rawSeverity as FormulationCaution["severity"]
      : "caution";
    const rawRelatedAnswerKeys = item.relatedAnswerKeys;
    const relatedAnswerKeys = Array.isArray(rawRelatedAnswerKeys)
      ? rawRelatedAnswerKeys.filter(
          (key): key is string => typeof key === "string" && key.trim().length > 0
        )
      : undefined;

    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) {
      errors.push(`${path}[${index}].id must be stable kebab-case`);
    } else if (seenIds.has(id)) {
      errors.push(`${path}[${index}].id is duplicated`);
    } else {
      seenIds.add(id);
    }

    cautions.push({
      body,
      id,
      ...(relatedAnswerKeys?.length ? { relatedAnswerKeys } : {}),
      severity,
      ...(title ? { title } : {})
    });
  });

  return cautions;
}

function validateFormulation(value: unknown) {
  const errors: string[] = [];
  const cautions: FormulationCaution[] = [];
  const marketingPoints: MarketingPoint[] = [];
  const supplementBreakdown: FormulationIngredient[] = [];

  const response = Array.isArray(value)
    ? { supplementBreakdown: value }
    : value;

  if (!isRecord(response)) {
    return { errors: ["Top-level response must be a JSON object"] };
  }

  const unexpectedTopLevelKeys = Object.keys(response).filter(
    (key) => key !== "supplementBreakdown" && key !== "marketingPoints" && key !== "cautions"
  );

  if (unexpectedTopLevelKeys.length > 0) {
    errors.push(
      `Top-level response must only include supplementBreakdown, marketingPoints, and cautions, found: ${unexpectedTopLevelKeys.join(", ")}`
    );
  }

  const rawItems = response.supplementBreakdown;
  const rawCautions = response.cautions;
  const rawMarketingPoints = response.marketingPoints;

  if (!Array.isArray(rawItems)) {
    return { errors: ["supplementBreakdown must be an array"] };
  }

  if (!Array.isArray(rawMarketingPoints)) {
    errors.push("marketingPoints must be an array");
  } else {
    if (rawMarketingPoints.length < 2) {
      errors.push("marketingPoints must contain at least 2 items");
    }

    if (rawMarketingPoints.length > 4) {
      errors.push("marketingPoints must contain no more than 4 items");
    }
  }

  if (!Array.isArray(rawCautions)) {
    errors.push("cautions must be an array");
  } else {
    cautions.push(...readCautionsAt(rawCautions, "cautions", errors));
  }

  if (rawItems.length < 1) {
    errors.push("supplementBreakdown must contain at least one item");
  }

  if (rawItems.length > 30) {
    errors.push("supplementBreakdown must contain no more than 30 items");
  }

  const seenIds = new Set<string>();
  const seenMarketingIds = new Set<string>();
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
    const itemCautions = Array.isArray(item.cautions)
      ? readCautionsAt(item.cautions, `supplementBreakdown[${index}].cautions`, errors)
      : [];

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
      ...(itemCautions.length > 0 ? { cautions: itemCautions } : {}),
      dailyDose,
      effectivenessRank,
      id,
      rationale,
      status: status as FormulationStatus,
      supplement
    });
  });

  if (Array.isArray(rawMarketingPoints)) {
    rawMarketingPoints.forEach((point, index) => {
      if (!isRecord(point)) {
        errors.push(`marketingPoints[${index}] must be an object`);
        return;
      }

      const titleText = textFromLocalizedCandidate(point.title);
      const id = readText(point, "id") || slugify(titleText, `point-${index + 1}`);
      const title = readLocalizedTextAt(
        point,
        "title",
        `marketingPoints[${index}]`,
        errors
      );
      const body = readLocalizedTextAt(
        point,
        "body",
        `marketingPoints[${index}]`,
        errors
      );

      if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) {
        errors.push(`marketingPoints[${index}].id must be stable kebab-case`);
      } else if (seenMarketingIds.has(id)) {
        errors.push(`marketingPoints[${index}].id is duplicated`);
      } else {
        seenMarketingIds.add(id);
      }

      marketingPoints.push({
        body,
        id,
        title
      });
    });
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors,
    formulation: {
      cautions,
      marketingPoints: marketingPoints.slice(0, 3),
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
          responseId: completion.id,
          usage: completion.usage
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
