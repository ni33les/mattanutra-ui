import type { AssessmentPlan } from "@/lib/assessment-snapshot";
import type {
  FoodGuidanceBlueprint,
  FormulationBlueprint,
  NutritionReport,
  PlanGuidanceAdjustment,
  PlanFeedbackItem,
  PlanChatMessage,
  RevealPageCopy,
  RevealPageCopySlot
} from "@/lib/formulation-types";
import {
  revealPageCopySlots,
  revealPageCopyVersion
} from "@/lib/formulation-types";
import type { HealthScoreResult } from "@/lib/health-score";
import { HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS } from "@/lib/health-score";
import {
  callGrokChatCompletion,
  configuredGrokModel,
  configuredGrokValue,
  getRequiredXaiApiKey
} from "@/lib/grok-client";
import { normalizePlanFeedbackItems } from "@/lib/plan-feedback";
import { publicLocales, type Locale, type LocaleCode } from "@/lib/i18n";

type AdvisorInput = Readonly<{
  answers: unknown;
  chatMessages: PlanChatMessage[];
  firstName?: string | null;
  foodGuidance?: FoodGuidanceBlueprint | null;
  formulation?: FormulationBlueprint | null;
  guidanceAdjustments?: PlanGuidanceAdjustment[];
  healthScore?: HealthScoreResult | null;
  locale: Locale;
  plan: AssessmentPlan;
  planFeedback?: PlanFeedbackItem[];
  planId: string;
  taskId?: string | null;
  userMessage?: string | null;
}>;

const DEFAULT_PROMPT_VERSION = "v1";
const CHAT_MAX_RESPONSE_TOKENS = 1_200;
const REPORT_MAX_RESPONSE_TOKENS = 6_500;
const REQUEST_TIMEOUT_MS = 360_000;

const displayLocaleNames = {
  en: "English",
  th: "Thai",
  "zh-CN": "Simplified Chinese"
} satisfies Record<Locale, string>;

const revealPageSlotGuide: Record<string, string> = {
  breadcrumbsBody:
    "Assessment breadcrumb body: stay close to the prototype idea that the formula folds together body context, goals, location, preferences, and constraints.",
  breadcrumbsTitle:
    "Legacy slot. The UI renders the locked prototype heading; keep this semantically identical if included.",
  closingBody:
    "Closing paragraph about right amount: not more, exactly enough, with the formula as the practical embodiment. No new facts.",
  closingTitle:
    "Legacy slot. The UI renders the locked prototype heading; keep this semantically identical if included.",
  distillFoot:
    "Short paragraph explaining that selected items earned their place against goals, cautions, and available catalogue evidence.",
  distillNarrative:
    "Legacy slot. The UI renders locked count language; keep this semantically identical if included.",
  formulaLead:
    "Formula table body: doses are sized to the user's profile, goals, and disclosed safety context. Do not mention exact doses or counts.",
  formulaTitle:
    "Legacy slot. The UI renders the locked formula heading; keep this semantically identical if included.",
  heroHeadline:
    "Legacy slot. The UI renders the locked prototype hero headline; keep this semantically identical if included.",
  heroSub:
    "Legacy slot. The UI renders the locked hero body with deterministic counts; keep this semantically identical if included.",
  heroTitle:
    "Legacy slot. The UI renders the locked name/no-name hero title; keep this semantically identical if included.",
  productsLead:
    "Product matching body: searched approved Thai catalogue or market data for products that fit the formula, dosing, and serving burden. Do not mention exact product names or counts.",
  productsTitle:
    "Legacy slot. The UI renders the locked product heading; keep this semantically identical if included.",
  safetyBody:
    "Conservative safety paragraph. Mention disclosed cautions only generically and never claim contraindications are absent.",
  safetyHeadline:
    "Legacy slot. The UI renders the locked safety headline from deterministic safety context; keep this semantically identical if included."
};

function getGrokConfig(defaultReasoningEffort: "low" | "medium") {
  return {
    apiKey: getRequiredXaiApiKey(),
    model: configuredGrokModel(process.env.GROK_MODEL),
    promptVersion:
      configuredGrokValue(process.env.NUTRITION_ADVISOR_PROMPT_VERSION) ||
      configuredGrokValue(process.env.FORMULATION_PROMPT_VERSION) ||
      DEFAULT_PROMPT_VERSION,
    reasoningEffort:
      configuredGrokValue(process.env.NUTRITION_ADVISOR_REASONING_EFFORT) ||
      defaultReasoningEffort
  };
}

function parseJsonObject(content: string | null | undefined) {
  if (!content) {
    throw new Error("Nutrition advisor response was empty");
  }

  const trimmed = content.trim();
  const parsed = JSON.parse(trimmed) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Nutrition advisor response was not a JSON object");
  }

  return parsed as Record<string, unknown>;
}

async function callGrok({
  apiKey,
  maxTokens,
  messages,
  model,
  reasoningEffort,
  temperature
}: Readonly<{
  apiKey: string;
  maxTokens: number;
  messages: Array<{ content: string; role: "assistant" | "system" | "user" }>;
  model: string;
  reasoningEffort: string;
  temperature: number;
}>) {
  return callGrokChatCompletion({
    apiKey,
    maxTokens,
    messages,
    model,
    purpose: "nutrition advisor request",
    reasoningEffort,
    temperature,
    timeoutMs: REQUEST_TIMEOUT_MS
  });
}

function contextPayload(input: AdvisorInput) {
  return {
    assessment: input.answers,
    chatMessages: input.chatMessages.map((message) => ({
      body: message.body,
      createdAt: message.createdAt,
      role: message.role
    })),
    firstName: input.firstName ?? null,
    foodGuidance: input.foodGuidance,
    formulation: input.formulation,
    guidanceAdjustments: input.guidanceAdjustments ?? [],
    healthScore: input.healthScore
      ? {
          copySeeds: input.healthScore.pageContent?.copySeeds ?? null,
          flagCodes: input.healthScore.flagCodes ?? [],
          pageLocked: input.healthScore.pageContent?.locked ?? null,
          score: input.healthScore.score
        }
      : null,
    locale: input.locale,
    plan: input.plan,
    planFeedback: input.planFeedback ?? [],
    planId: input.planId,
    userMessage: input.userMessage
  };
}

function chatSystemPrompt(promptVersion: string) {
  return [
    `MattaNutra nutrition plan chat advisor ${promptVersion}.`,
    "You help the client refine their food and supplement guidance.",
    "You are conversational, concise, and practical.",
    "You may acknowledge preferences, dislikes, removals, swaps, routines, budget, travel, and timing.",
    "Do not claim to diagnose, treat, cure, prescribe, or replace clinician advice.",
    "Do not override MattaNutra safety state. If an item is hidden or under review, describe it as under team review.",
    "When the client gives preferences, dislikes, removals, constraints, budget notes, capsule limits, routines, cuisine preferences, or safety disclosures, return structured feedback so the platform can use it in the next refined plan version.",
    "Do not say that the current plan has already changed. Say the preference has been noted for refinement unless it is a safety disclosure.",
    "If the client says to go ahead, regenerate, rebuild, refine, finalize, deliver, or update the plan, do not ask for confirmation. Acknowledge that refinement is starting.",
    "If the client says there are no more changes, that is it, all good, ready, done, or asks to deliver the plan, do not ask for alternatives or another follow-up.",
    "Return JSON only with exactly three keys: reply, feedback, and adjustments."
  ].join("\n");
}

function reportSystemPrompt(promptVersion: string) {
  return [
    `MattaNutra final nutrition report engine ${promptVersion}.`,
    "You combine completed food guidance, supplement guidance, and the client's chat feedback into a polished final wellness plan.",
    "This is the delivered customer-facing recommendation pack. It is not medical advice, diagnosis, treatment, or a prescription.",
    "Do not include marketplace products, prices, URLs, markdown, or contact data.",
    "Do not turn hidden or under-review items into active recommendations. Mention review status conservatively if relevant.",
    "Return JSON only with exactly one key: report."
  ].join("\n");
}

export async function analyzeNutritionPlanChatWithGrok(input: AdvisorInput) {
  const config = getGrokConfig("low");
  const completion = await callGrok({
    apiKey: config.apiKey,
    messages: [
      { content: chatSystemPrompt(config.promptVersion), role: "system" },
      {
        content: JSON.stringify(
          {
            context: contextPayload(input),
            instructions: [
              "Return a JSON object with exactly three fields: reply, feedback, and adjustments.",
              `Write reply and durable feedback body text in ${displayLocaleNames[input.locale]} (${input.locale}).`,
              "User-facing text must be plain strings in the requested display locale, not localized language maps.",
              "Keep the reply to 2 to 5 short sentences.",
              "Ask at most one useful follow-up question.",
              "Do not ask a follow-up question when the user is clearly asking you to regenerate, rebuild, refine, finalize, deliver, update, or go ahead with the plan.",
              "Do not ask for more alternatives when the user says there are no more changes, that is it, all good, ready, or done.",
              "feedback must be an array. Use an empty array when no durable preference or safety disclosure should be stored.",
              "For durable feedback, include { feedbackType, itemType, itemId, itemName, body, urgency }.",
              "Use feedbackType removal, dislike, preference, constraint, safety_disclosure, budget, capsule_limit, routine, cuisine, or other.",
              "adjustments is a legacy array for removals only. Keep it in sync with removal feedback for now.",
              "Use the exact item id and item name from the current foodGuidance or formulation when the requested item matches one.",
              "For broad preferences not currently in the visible list, still return feedback with a clear body."
            ]
          },
          null,
          2
        ),
        role: "user"
      }
    ],
    maxTokens: CHAT_MAX_RESPONSE_TOKENS,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    temperature: 0.3
  });
  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  const adjustments = normalizeChatAdjustments(parsed.adjustments);
  const feedback = normalizePlanFeedbackItems(parsed.feedback);

  if (!reply) {
    throw new Error("Nutrition advisor reply was missing");
  }

  return {
    attempts: 1,
    locale: input.locale,
    model: completion.model ?? config.model,
    outputLocaleMode: "single_display_locale",
    promptVersion: config.promptVersion,
    reasoningEffort: config.reasoningEffort,
    adjustments,
    feedback,
    reply,
    responseId: completion.id,
    usage: completion.usage
  };
}

function normalizeChatAdjustments(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const action = typeof record.action === "string" ? record.action : "";
      const itemType =
        typeof record.itemType === "string" ? record.itemType : "";
      const itemName =
        typeof record.itemName === "string" ? record.itemName.trim() : "";

      if (
        action !== "remove" ||
        (itemType !== "food" && itemType !== "supplement") ||
        !itemName
      ) {
        return null;
      }

      return {
        action,
        itemId:
          typeof record.itemId === "string" && record.itemId.trim()
            ? record.itemId.trim()
            : null,
        itemName,
        itemType,
        reason:
          typeof record.reason === "string" && record.reason.trim()
            ? record.reason.trim()
            : null
      } satisfies PlanGuidanceAdjustment;
    })
    .filter(Boolean)
    .slice(0, 20) as PlanGuidanceAdjustment[];
}

function localizedText(value: unknown, displayLocale: Locale) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const requested =
      typeof record[displayLocale] === "string"
        ? record[displayLocale].trim()
        : "";

    if (requested) {
      return requested;
    }

    const localized = Object.fromEntries(
      publicLocales
        .map((locale) => [
          locale,
          typeof record[locale] === "string" ? record[locale].trim() : ""
        ] as const)
        .filter(([, text]) => Boolean(text))
    ) as Partial<Record<LocaleCode, string>>;

    if (Object.keys(localized).length > 0) {
      return localized;
    }
  }

  return "";
}

const revealCopyForbiddenTerms = [
  ...HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS,
  "diagnose",
  "diagnosis",
  "treat",
  "treatment",
  "cure",
  "prescribe",
  "prescription",
  "reverse disease",
  "prevent disease",
  "fda",
  "thai fda"
] as const;

function hasHtmlOrMarkdown(value: string) {
  return /<[^>]+>/.test(value) || /[`#*_>\[\]]/.test(value);
}

function hasNumericClaim(value: string) {
  return /[0-9๐-๙]/.test(value);
}

function hasForbiddenRevealCopy(value: string) {
  const lower = value.toLowerCase();

  return revealCopyForbiddenTerms.find((term) => lower.includes(term));
}

export function validateRevealPageCopy(value: unknown, displayLocale?: Locale): {
  copy?: RevealPageCopy;
  errors: string[];
} {
  const errors: string[] = [];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      errors: ["revealPageCopy must be an object"]
    };
  }

  const record = value as Record<string, unknown>;
  const allowed = new Set<string>([...revealPageCopySlots, "version"]);
  const extraKeys = Object.keys(record).filter((key) => !allowed.has(key));
  const version =
    typeof record.version === "string" ? record.version.trim() : undefined;

  if (extraKeys.length > 0) {
    errors.push(`revealPageCopy has unexpected fields: ${extraKeys.join(", ")}`);
  }

  if (version && version !== revealPageCopyVersion) {
    errors.push(`revealPageCopy.version must be ${revealPageCopyVersion}`);
  }

  const copy: Partial<Record<RevealPageCopySlot, string | Partial<Record<LocaleCode, string>>>> & {
    version?: typeof revealPageCopyVersion;
  } = {};

  if (version === revealPageCopyVersion) {
    copy.version = revealPageCopyVersion;
  }

  for (const slot of revealPageCopySlots) {
    const localized = record[slot];

    if (typeof localized === "string" && localized.trim()) {
      const text = localized.trim();
      const forbidden = hasForbiddenRevealCopy(text);

      if (forbidden) {
        errors.push(`revealPageCopy.${slot} contains forbidden term: ${forbidden}`);
      }

      if (hasHtmlOrMarkdown(text)) {
        errors.push(`revealPageCopy.${slot} must not contain HTML or markdown`);
      }

      if (hasNumericClaim(text)) {
        errors.push(`revealPageCopy.${slot} must not introduce numeric claims`);
      }

      copy[slot] = text;
      continue;
    }

    if (!localized || typeof localized !== "object" || Array.isArray(localized)) {
      errors.push(`revealPageCopy.${slot} must be a string or localized object`);
      continue;
    }

    const localizedRecord = localized as Record<string, unknown>;
    const localeKeys = Object.keys(localizedRecord);
    const extraLocaleKeys = localeKeys.filter(
      (key) => !publicLocales.includes(key as Locale)
    );

    if (extraLocaleKeys.length > 0) {
      errors.push(
        `revealPageCopy.${slot} has unsupported locales: ${extraLocaleKeys.join(", ")}`
      );
    }

    const localizedValues = Object.fromEntries(
      publicLocales.map((locale) => [
        locale,
        typeof localizedRecord[locale] === "string"
          ? localizedRecord[locale].trim()
          : ""
      ])
    ) as Record<Locale, string>;
    const requestedText = displayLocale ? localizedValues[displayLocale] : "";

    if (displayLocale && !requestedText) {
      errors.push(`revealPageCopy.${slot}.${displayLocale} is required`);
    }

    if (!displayLocale && !localizedValues.en && !localizedValues.th) {
      errors.push(`revealPageCopy.${slot} must include at least en or th`);
    }

    for (const locale of publicLocales) {
      const text = localizedValues[locale];

      if (!text) {
        continue;
      }

      const forbidden = hasForbiddenRevealCopy(text);

      if (forbidden) {
        errors.push(`revealPageCopy.${slot}.${locale} contains forbidden term: ${forbidden}`);
      }

      if (hasHtmlOrMarkdown(text)) {
        errors.push(`revealPageCopy.${slot}.${locale} must not contain HTML or markdown`);
      }

      if (hasNumericClaim(text)) {
        errors.push(`revealPageCopy.${slot}.${locale} must not introduce numeric claims`);
      }
    }

    if (displayLocale && requestedText) {
      copy[slot] = requestedText;
    } else {
      const normalized = Object.fromEntries(
        publicLocales
          .map((locale) => [locale, localizedValues[locale]] as const)
          .filter(([, text]) => Boolean(text))
      ) as Partial<Record<LocaleCode, string>>;

      if (Object.keys(normalized).length > 0) {
        copy[slot] = normalized;
      }
    }
  }

  return errors.length > 0
    ? { errors }
    : { copy: copy as RevealPageCopy, errors: [] };
}

function reportSections(value: unknown, displayLocale: Locale) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const record =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : {};
      const title = localizedText(record.title, displayLocale);
      const body = localizedText(record.body, displayLocale);

      if (!title || !body) {
        return null;
      }

      return {
        body,
        id:
          typeof record.id === "string" && record.id.trim()
            ? record.id.trim()
            : `section-${index + 1}`,
        title
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function normalizeReport(value: unknown, displayLocale: Locale): NutritionReport {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const summary = localizedText(record.summary, displayLocale);
  const title = localizedText(record.title, displayLocale);
  const dailyFocus = reportSections(record.dailyFocus, displayLocale);
  const synergies = reportSections(record.synergies, displayLocale);
  const nextSteps = reportSections(record.nextSteps, displayLocale);
  const safetyNotes = Array.isArray(record.safetyNotes)
    ? record.safetyNotes
        .map((note) => localizedText(note, displayLocale))
        .filter(Boolean)
    : [];
  const revealPageCopyResult =
    record.revealPageCopy === undefined
      ? null
      : validateRevealPageCopy(record.revealPageCopy, displayLocale);

  if (!summary || !title) {
    throw new Error("Nutrition report is missing title or summary");
  }

  if (dailyFocus.length < 1 || nextSteps.length < 1) {
    throw new Error("Nutrition report is missing required sections");
  }

  if (revealPageCopyResult?.errors.length) {
    throw new Error(`Nutrition report revealPageCopy is invalid: ${revealPageCopyResult.errors.join("; ")}`);
  }

  return {
    dailyFocus,
    nextSteps,
    ...(revealPageCopyResult?.copy ? { revealPageCopy: revealPageCopyResult.copy } : {}),
    safetyNotes,
    summary,
    synergies,
    title
  };
}

export async function analyzeNutritionReportWithGrok(input: AdvisorInput) {
  const config = getGrokConfig("medium");
  const completion = await callGrok({
    apiKey: config.apiKey,
    messages: [
      { content: reportSystemPrompt(config.promptVersion), role: "system" },
      {
        content: JSON.stringify(
          {
            context: contextPayload(input),
            contract: {
              report: {
                dailyFocus: [
	                  {
	                    body: "short paragraph in the requested display locale",
	                    id: "stable-kebab-case",
	                    title: "short title in the requested display locale"
	                  }
	                ],
	                nextSteps: [
	                  {
	                    body: "short paragraph in the requested display locale",
	                    id: "stable-kebab-case",
	                    title: "short title in the requested display locale"
	                  }
	                ],
	                safetyNotes: [
	                  "short conservative safety note in the requested display locale"
	                ],
	                revealPageCopy: {
	                  version: revealPageCopyVersion,
	                  ...Object.fromEntries(
	                    revealPageCopySlots.map((slot) => [
	                      slot,
	                      "short personalized copy in the requested display locale without numbers or medical claims"
	                    ])
	                  )
	                },
	                summary: "one concise summary paragraph in the requested display locale",
	                synergies: [
	                  {
	                    body: "short paragraph in the requested display locale",
	                    id: "stable-kebab-case",
	                    title: "short title in the requested display locale"
	                  }
	                ],
	                title: "Final nutrition plan title in the requested display locale"
	              },
	              revealPageSlotGuide
	            },
	            instructions: [
	              "Return a JSON object with exactly one top-level key: report.",
	              `Write every user-facing display field in ${displayLocaleNames[input.locale]} (${input.locale}).`,
	              "User-facing fields must be plain strings in the requested display locale, not { en, th } or other localized maps.",
	              "Keep internal ids and enum-like fields in canonical English: section id, feedbackType, itemType, itemId, supplement ids, food ids, product ids, status, category, and safety flag codes.",
	              "dailyFocus must contain 3 to 5 practical daily priorities.",
	              "synergies must contain 2 to 4 food-plus-supplement combinations or routines.",
	              "nextSteps must contain 2 to 4 customer actions.",
	              "safetyNotes must contain 2 to 5 conservative notes.",
	              `revealPageCopy is required, must set version to ${revealPageCopyVersion}, and must contain every listed reveal page slot.`,
	              "Every revealPageCopy slot must be a plain string in the requested display locale.",
	              "revealPageCopy is copy-only. Do not include scores, counts, doses, product names, product links, FDA status, diagnoses, treatments, cures, prescriptions, HTML, markdown, or numeric claims.",
	              "Use firstName only as optional display context; if it is missing, write copy that still reads naturally without a name.",
	              "Use healthScore copySeeds, assessment goals, symptoms, safety flags, formulation rows, food guidance, and plan feedback only to phrase the page narrative. Do not alter locked facts.",
	              "RevealPageCopy must stay faithful to the reveal prototype voice and must not rewrite locked template headings or labels.",
	              "For Thai or Simplified Chinese, write natural native-language copy, avoid cramped uppercase-style phrasing, and keep sentences easy to wrap on mobile."
	            ]
          },
          null,
          2
        ),
        role: "user"
      }
    ],
    maxTokens: REPORT_MAX_RESPONSE_TOKENS,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    temperature: 0.2
  });
  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
  const report = normalizeReport(parsed.report, input.locale);

  return {
    attempts: 1,
    locale: input.locale,
    model: completion.model ?? config.model,
    outputLocaleMode: "single_display_locale",
    promptVersion: config.promptVersion,
    reasoningEffort: config.reasoningEffort,
    report,
    responseId: completion.id,
    usage: completion.usage
  };
}
