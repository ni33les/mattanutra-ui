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
import { normalizePlanFeedbackItems } from "@/lib/plan-feedback";
import type { Locale } from "@/lib/i18n";

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
const DEFAULT_PROMPT_VERSION = "v1";
const REQUEST_TIMEOUT_MS = 360_000;

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

function configured(value: string | undefined) {
  return value?.trim() ?? "";
}

function getGrokConfig(defaultReasoningEffort: "low" | "medium") {
  const apiKey = configured(process.env.XAI_API_KEY);

  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured");
  }

  return {
    apiKey,
    model: configured(process.env.GROK_MODEL) || DEFAULT_GROK_MODEL,
    promptVersion:
      configured(process.env.NUTRITION_ADVISOR_PROMPT_VERSION) ||
      configured(process.env.FORMULATION_PROMPT_VERSION) ||
      DEFAULT_PROMPT_VERSION,
    reasoningEffort:
      configured(process.env.NUTRITION_ADVISOR_REASONING_EFFORT) ||
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
  messages,
  model,
  reasoningEffort,
  temperature
}: Readonly<{
  apiKey: string;
  messages: Array<{ content: string; role: "assistant" | "system" | "user" }>;
  model: string;
  reasoningEffort: string;
  temperature: number;
}>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(XAI_CHAT_COMPLETIONS_URL, {
      body: JSON.stringify({
        messages,
        model,
        reasoning_effort: reasoningEffort,
        response_format: { type: "json_object" },
        stream: false,
        temperature
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `xAI request failed with ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`
      );
    }

    return (await response.json()) as XaiChatCompletion;
  } finally {
    clearTimeout(timeout);
  }
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
              "Use the client's selected locale when possible.",
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
    model: completion.model ?? config.model,
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

function localizedText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const en = typeof record.en === "string" ? record.en.trim() : "";
    const th = typeof record.th === "string" ? record.th.trim() : "";

    if (en || th) {
      return {
        en: en || th,
        th: th || en
      };
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

export function validateRevealPageCopy(value: unknown): {
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

  const copy: Partial<Record<RevealPageCopySlot, { en: string; th: string }>> & {
    version?: typeof revealPageCopyVersion;
  } = {};

  if (version === revealPageCopyVersion) {
    copy.version = revealPageCopyVersion;
  }

  for (const slot of revealPageCopySlots) {
    const localized = record[slot];

    if (!localized || typeof localized !== "object" || Array.isArray(localized)) {
      errors.push(`revealPageCopy.${slot} must be a localized object`);
      continue;
    }

    const localizedRecord = localized as Record<string, unknown>;
    const localeKeys = Object.keys(localizedRecord);
    const extraLocaleKeys = localeKeys.filter((key) => key !== "en" && key !== "th");

    if (extraLocaleKeys.length > 0) {
      errors.push(
        `revealPageCopy.${slot} has unsupported locales: ${extraLocaleKeys.join(", ")}`
      );
    }

    const en = typeof localizedRecord.en === "string" ? localizedRecord.en.trim() : "";
    const th = typeof localizedRecord.th === "string" ? localizedRecord.th.trim() : "";

    if (!en) {
      errors.push(`revealPageCopy.${slot}.en is required`);
    }

    if (!th) {
      errors.push(`revealPageCopy.${slot}.th is required`);
    }

    for (const [locale, text] of [
      ["en", en],
      ["th", th]
    ] as const) {
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

    if (en && th) {
      copy[slot] = { en, th };
    }
  }

  return errors.length > 0
    ? { errors }
    : { copy: copy as RevealPageCopy, errors: [] };
}

function reportSections(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const record =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : {};
      const title = localizedText(record.title);
      const body = localizedText(record.body);

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

function normalizeReport(value: unknown): NutritionReport {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const summary = localizedText(record.summary);
  const title = localizedText(record.title);
  const dailyFocus = reportSections(record.dailyFocus);
  const synergies = reportSections(record.synergies);
  const nextSteps = reportSections(record.nextSteps);
  const safetyNotes = Array.isArray(record.safetyNotes)
    ? record.safetyNotes.map(localizedText).filter(Boolean)
    : [];
  const revealPageCopyResult =
    record.revealPageCopy === undefined
      ? null
      : validateRevealPageCopy(record.revealPageCopy);

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
                    body: { en: "short paragraph", th: "short paragraph" },
                    id: "stable-kebab-case",
                    title: { en: "short title", th: "short title" }
                  }
                ],
                nextSteps: [
                  {
                    body: { en: "short paragraph", th: "short paragraph" },
                    id: "stable-kebab-case",
                    title: { en: "short title", th: "short title" }
                  }
                ],
                safetyNotes: [
                  {
                    en: "short conservative safety note",
                    th: "short conservative safety note"
                  }
                ],
                revealPageCopy: {
                  version: revealPageCopyVersion,
                  ...Object.fromEntries(
                    revealPageCopySlots.map((slot) => [
                      slot,
                      {
                        en: "short personalized copy without numbers or medical claims",
                        th: "short personalized Thai copy without numbers or medical claims"
                      }
                    ])
                  )
                },
                summary: {
                  en: "one concise summary paragraph",
                  th: "one concise summary paragraph"
                },
                synergies: [
                  {
                    body: { en: "short paragraph", th: "short paragraph" },
                    id: "stable-kebab-case",
                    title: { en: "short title", th: "short title" }
                  }
                ],
                title: {
                  en: "Final nutrition plan",
                  th: "Final nutrition plan"
                }
              },
              revealPageSlotGuide
            },
            instructions: [
              "Return a JSON object with exactly one top-level key: report.",
              "dailyFocus must contain 3 to 5 practical daily priorities.",
              "synergies must contain 2 to 4 food-plus-supplement combinations or routines.",
              "nextSteps must contain 2 to 4 customer actions.",
              "safetyNotes must contain 2 to 5 conservative notes.",
              `revealPageCopy is required, must set version to ${revealPageCopyVersion}, and must contain every listed reveal page slot.`,
              "Every revealPageCopy slot must include English and Thai.",
              "revealPageCopy is copy-only. Do not include scores, counts, doses, product names, product links, FDA status, diagnoses, treatments, cures, prescriptions, HTML, markdown, or numeric claims.",
              "Use firstName only as optional display context; if it is missing, write copy that still reads naturally without a name.",
              "Use healthScore copySeeds, assessment goals, symptoms, safety flags, formulation rows, food guidance, and plan feedback only to phrase the page narrative. Do not alter locked facts.",
              "English revealPageCopy must stay faithful to the reveal prototype voice and must not rewrite locked template headings or labels.",
              "Thai revealPageCopy must be natural Thai, not word-for-word English; avoid cramped uppercase-style phrasing and keep sentences easy to wrap on mobile.",
              "Every display field must include English and Thai."
            ]
          },
          null,
          2
        ),
        role: "user"
      }
    ],
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    temperature: 0.2
  });
  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
  const report = normalizeReport(parsed.report);

  return {
    attempts: 1,
    model: completion.model ?? config.model,
    promptVersion: config.promptVersion,
    reasoningEffort: config.reasoningEffort,
    report,
    responseId: completion.id,
    usage: completion.usage
  };
}
