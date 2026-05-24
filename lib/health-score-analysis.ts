// Dynamic import to avoid bundling Node 'crypto' into client bundles
async function getCreateHash() {
  const crypto = await import("crypto");
  return crypto.createHash;
}
import type {
  HealthScoreAdvice,
  HealthScorePaywallFeature,
  HealthScoreResult,
  LocalizedHealthScoreText
} from "@/lib/health-score";
import { defaultLocale, type Locale } from "@/lib/i18n";

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

export type HealthScoreAdviceAnalysis = Readonly<{
  advice: HealthScoreAdvice;
  cachedOrExisting: boolean;
  model: string;
  promptVersion: string;
  reasoningEffort: string;
  responseId?: string;
  usage?: unknown;
}>;

const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_GROK_MODEL = "grok-4.3";
const DEFAULT_HEALTHSCORE_REASONING_EFFORT = "none";
const DEFAULT_PROMPT_VERSION = "v5";
const CACHE_TYPE = "healthscore_advice";
const CACHE_TTL_DAYS = 7;
const MAX_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 60_000;

const globalHealthScoreCache = globalThis as typeof globalThis & {
  mattanutraHealthScoreCacheSchemaReady?: Promise<void>;
};

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
    model: configured(process.env.GROK_MODEL) || DEFAULT_GROK_MODEL,
    promptVersion: DEFAULT_PROMPT_VERSION,
    reasoningEffort:
      configured(process.env.HEALTHSCORE_REASONING_EFFORT) ||
      DEFAULT_HEALTHSCORE_REASONING_EFFORT
  };
}

function systemPrompt(promptVersion: string) {
  return [
    `You are MattaNutra's HealthScore sales copy engine ${promptVersion}.`,
    "The user has just completed an assessment and seen their HealthScore.",
    "Your task is to convert this specific person into a paid customer by showing that MattaNutra understands their results and can turn them into a practical nutrition plan.",
    "Write like a calm premium wellness advisor: specific, useful, commercial, and trustworthy.",
    "Never sound generic. If the copy could fit most users, it is wrong.",
    "Do not recommend supplements, doses, products, brands, marketplace searches, treatments, or disease claims.",
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
  const requiredOutputLocales = [...new Set([defaultLocale, locale])];

  return JSON.stringify(
    {
      assessment: compactAssessmentForAdvice(answers),
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
                en: "One English sentence anchored to a concrete signal from personalizationSignals.",
                th: "One Thai sentence anchored to a concrete signal from personalizationSignals."
              },
              name: {
                en: "Short English feature name anchored to the user's actual situation",
                th: "Short Thai feature name anchored to the user's actual situation"
              }
            },
            {
              description: {
                en: "One English sentence anchored to a different concrete signal from personalizationSignals.",
                th: "One Thai sentence anchored to a different concrete signal from personalizationSignals."
              },
              name: {
                en: "Short English feature name anchored to a different user signal",
                th: "Short Thai feature name anchored to a different user signal"
              }
            },
            {
              description: {
                en: "One English sentence anchored to a third concrete signal from personalizationSignals.",
                th: "One Thai sentence anchored to a third concrete signal from personalizationSignals."
              },
              name: {
                en: "Short English feature name anchored to a third user signal",
                th: "Short Thai feature name anchored to a third user signal"
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
      healthScore: compactHealthScoreForAdvice(healthScore),
      salesContext: {
        goal: "Increase paid Precision or Pro plan conversion on the HealthScore paywall.",
        screen:
          "The user has seen their HealthScore and must decide whether to unlock a bespoke nutrition plan.",
        userMindset:
          "They may be curious but skeptical. They need to feel the paid plan is specific to their result, avoids wasted supplements, and gives a clearer next step."
      },
      instructions: [
        "Return exactly one top-level key: advice.",
        `Every localized field must include these locale keys: ${requiredOutputLocales.join(", ")}.`,
        "paywallFeatures must contain exactly 3 items.",
        "Use the assessment, healthScore, and personalizationSignals. These are the user's actual results.",
        "Write the paywallTitle as a sales headline for this person, not a product label.",
        "Write the paywallSubtitle as the reason to pay now: what becomes clearer after unlocking the plan.",
        "Each feature card must be anchored to a different concrete result from personalizationSignals.",
        "Each feature card must name the user's result or constraint directly, for example their lowest domain, stated goal, symptom, budget, pill limit, missing labs, supplied labs, stress source, sleep pattern, medication caution, diet pattern, or activity context.",
        "Each feature card must answer one sales objection: where to start, how to avoid wasted spend, how it fits daily life, whether constraints are handled, or how progress becomes measurable.",
        "If budget is low or mid, sell prioritisation and avoiding waste.",
        "If labs are missing, sell reassessment or future lab precision. If labs are present, sell use of that extra precision.",
        "If medications or health considerations are present, sell safety-aware filtering without giving medical advice.",
        "Use no generic feature names like 'Personalised guidance', 'Right-amount guidance', 'Built around your day', or 'Score-led priorities' unless they include a concrete user result.",
        "Avoid vague phrases like 'based on your profile', 'tailored to you', or 'your unique needs' unless followed by the exact signal.",
        "Keep the copy concise: overview max 2 sentences, title under 70 English characters, subtitle under 160 English characters, feature names under 42 English characters, feature descriptions under 150 English characters.",
        "No supplement names, ingredient names, doses, products, prices, discounts, false urgency, fear, medical instructions, or disease claims.",
        "Return English plus the requested locale. Include other locale keys only when they are useful and complete."
      ],
      locale,
      requiredOutputLocales,
      personalizationSignals: buildPersonalizationSignals(answers, healthScore)
    },
    null,
    2
  );
}

const answerLabels: Record<string, Record<string, string>> = {
  activity: {
    active: "active",
    athlete: "athlete",
    light: "light activity",
    moderate: "moderate activity",
    sitting: "mostly sitting"
  },
  alcohol: {
    "1-3": "1-3 alcoholic drinks per week",
    "4-7": "4-7 alcoholic drinks per week",
    "8+": "8+ alcoholic drinks per week",
    none: "no alcohol"
  },
  budget: {
    "1000-2500": "฿1,000-2,500 monthly supplement budget",
    "2500-5000": "฿2,500-5,000 monthly supplement budget",
    "5000+": "฿5,000+ monthly supplement budget",
    u1000: "under ฿1,000 monthly supplement budget"
  },
  diet: {
    balanced: "balanced diet",
    carnivore: "carnivore diet",
    mediterranean: "Mediterranean diet",
    none: "no defined diet pattern",
    plant: "plant-based diet",
    processed: "processed diet",
    vegan: "vegan diet",
    whole: "whole-food diet"
  },
  digCondition: {
    bariatric: "bariatric surgery",
    celiac: "celiac disease",
    ibd: "IBD",
    ibs: "IBS",
    none: "no digestive condition"
  },
  digestion: {
    bloating: "bloating",
    constipation: "constipation",
    loose: "loose stools",
    none: "no digestion issue"
  },
  energy: {
    drained: "drained energy",
    excellent: "excellent energy",
    good: "good energy",
    low: "low energy",
    ok: "OK energy"
  },
  form: {
    capsules: "prefers capsules",
    gummies: "prefers gummies",
    mixed: "open to mixed formats",
    powder: "prefers powder or shakes"
  },
  goals: {
    energy: "more energy",
    fitness: "fitness / VO2",
    focus: "brain / focus",
    heart: "heart health",
    hormones: "hormones",
    immunity: "immunity",
    joints: "joints",
    longevity: "longevity",
    mood: "mood / calm",
    skin: "skin",
    sleep: "better sleep",
    weight: "weight loss"
  },
  kidney: {
    disease: "kidney disease",
    normal: "no known kidney issue",
    reduced: "reduced kidney function"
  },
  liver: {
    condition: "liver condition",
    normal: "no known liver issue"
  },
  maxPills: {
    "1-3": "1-3 pills per day limit",
    "4-6": "4-6 pills per day limit",
    "7-10": "7-10 pills per day limit",
    nolimit: "no pill limit"
  },
  meds: {
    none: "no medications reported",
    yes: "medications reported"
  },
  medTypes: {
    antidepressant: "antidepressant",
    bloodthinner: "blood thinner / aspirin",
    bp: "blood pressure medication",
    contraceptive: "contraceptive pill",
    corticosteroid: "corticosteroid",
    diuretic: "diuretic",
    metformin: "metformin",
    other: "other medication",
    ppi: "PPI / omeprazole",
    statin: "statin",
    thyroid: "thyroid medication"
  },
  menopause: {
    peri: "perimenopause",
    post: "post-menopause",
    pre: "pre-menopause",
    unsure: "menopause stage unsure"
  },
  protein: {
    "1-1.5": "1-1.5g/kg protein per day",
    "1.5-2": "1.5-2g/kg protein per day",
    "2+": "over 2g/kg protein per day",
    u1: "under 1g/kg protein per day"
  },
  reproStatus: {
    breastfeeding: "breastfeeding",
    none: "not pregnant or breastfeeding",
    pregnant: "pregnant",
    ttc: "trying to conceive"
  },
  smoking: {
    daily: "daily smoker",
    ex5: "ex-smoker under 5 years",
    "ex5+": "ex-smoker over 5 years",
    never: "never smoker",
    occasional: "occasional smoker"
  },
  stress: {
    extreme: "extreme stress",
    high: "high stress",
    low: "low stress",
    moderate: "moderate stress",
    verylow: "very low stress"
  },
  sun: {
    "15-30": "15-30 minutes sun exposure",
    "30-60": "30-60 minutes sun exposure",
    "60+": "60+ minutes sun exposure",
    u15: "under 15 minutes sun exposure"
  },
  suppAllergies: {
    bvit: "B vitamin sensitivity",
    coq10: "CoQ10 sensitivity",
    iodine: "iodine sensitivity",
    iron: "iron sensitivity",
    none: "no known supplement sensitivity",
    other: "other supplement sensitivity",
    shellfishderived: "shellfish-derived sensitivity",
    soyderived: "soy-derived sensitivity"
  },
  supplements: {
    basic: "currently uses a basic multivitamin",
    d3omega: "currently uses D3 / Omega-3",
    none: "not currently taking supplements",
    targeted: "currently uses several targeted supplements"
  },
  symptoms: {
    brainfog: "brain fog",
    colds: "frequent colds",
    digestion: "digestion symptoms",
    fatigue: "fatigue",
    great: "feeling great",
    hair: "hair loss",
    joint: "joint pain",
    libido: "low libido",
    mood: "mood symptoms",
    skin: "skin symptoms",
    sleep: "poor sleep",
    stress: "stress / anxiety"
  }
};

function textAnswer(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function answerLabel(key: string, value: unknown) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  return answerLabels[key]?.[value] ?? value;
}

function answerListLabels(key: string, value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => answerLabel(key, item))
    .filter((item) => item && item !== "none");
}

function signal(label: string, values: string[]) {
  const compactValues = values.filter(Boolean);

  return compactValues.length ? `${label}: ${compactValues.join("; ")}` : "";
}

function buildPersonalizationSignals(
  answersInput: unknown,
  healthScore: HealthScoreResult
) {
  const answers = isRecord(answersInput) ? answersInput : {};
  const sortedDomains = healthScore.domains
    .slice()
    .sort((first, second) => first.score - second.score);
  const lowest = sortedDomains[0];
  const secondLowest = sortedDomains[1];
  const goals = answerListLabels("goals", answers.goals);
  const symptoms = answerListLabels("symptoms", answers.symptoms);
  const medTypes = answerListLabels("medTypes", answers.medTypes);
  const supplementSensitivities = answerListLabels(
    "suppAllergies",
    answers.suppAllergies
  );
  const labs = isRecord(answers.labs)
    ? Object.entries(answers.labs)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([key, value]) => {
          const labUnits = isRecord(answers.labUnits) ? answers.labUnits : {};
          return `${key}: ${value}${typeof labUnits[key] === "string" ? ` ${labUnits[key]}` : ""}`;
        })
    : [];
  const sleepHours = textAnswer(answers, "sleepHrs");
  const vo2Max = textAnswer(answers, "vo2");
  const signals = [
    `HealthScore: ${healthScore.score}/100 (${healthScore.band})`,
    lowest
      ? `Lowest domain: ${lowest.label} (${lowest.score}/100)`
      : "",
    secondLowest
      ? `Second-lowest domain: ${secondLowest.label} (${secondLowest.score}/100)`
      : "",
    goals.length ? `Primary goals: ${goals.join(", ")}` : "",
    symptoms.length ? `Current friction: ${symptoms.join(", ")}` : "",
    signal("Health considerations", [
      answerLabel("reproStatus", answers.reproStatus),
      answerLabel("kidney", answers.kidney),
      answerLabel("liver", answers.liver),
      answerLabel("surgery", answers.surgery),
      answerLabel("antibiotics", answers.antibiotics),
      supplementSensitivities.length
        ? `supplement sensitivities: ${supplementSensitivities.join(", ")}`
        : ""
    ]),
    signal("Practical constraints", [
      answerLabel("budget", answers.budget),
      answerLabel("maxPills", answers.maxPills),
      answerLabel("form", answers.form)
    ]),
    signal("Sleep, energy, stress", [
      sleepHours ? `sleep duration ${sleepHours}` : "",
      answerLabel("energy", answers.energy),
      answerLabel("stress", answers.stress)
    ]),
    signal("Lifestyle context", [
      answerLabel("diet", answers.diet),
      answerLabel("protein", answers.protein),
      answerLabel("alcohol", answers.alcohol),
      answerLabel("sun", answers.sun),
      answerLabel("smoking", answers.smoking)
    ]),
    signal("Movement context", [
      answerLabel("activity", answers.activity),
      vo2Max ? `VO2 max ${vo2Max}` : ""
    ]),
    signal("Safety context", [
      answerLabel("meds", answers.meds),
      medTypes.length ? `medication types: ${medTypes.join(", ")}` : "",
      textAnswer(answers, "otherMed")
    ]),
    labs.length
      ? `Labs supplied: ${labs.slice(0, 6).join(", ")}`
      : "No lab values supplied"
  ];

  return signals.filter(Boolean).slice(0, 12);
}

function compactHealthScoreForAdvice(healthScore: HealthScoreResult) {
  return {
    band: healthScore.band,
    domains: healthScore.domains.map((domain) => ({
      id: domain.id,
      label: domain.label,
      score: domain.score
    })),
    movers: healthScore.movers,
    score: healthScore.score
  };
}

function compactAssessmentForAdvice(answers: unknown) {
  if (!isRecord(answers)) {
    return {};
  }

  return {
    activity: answers.activity,
    age: answers.age,
    alcohol: answers.alcohol,
    allergies: answers.allergies,
    antibiotics: answers.antibiotics,
    budget: answers.budget,
    caffeine: answers.caffeine,
    country: answers.country,
    diet: answers.diet,
    digCondition: answers.digCondition,
    digestion: answers.digestion,
    energy: answers.energy,
    family: answers.family,
    flow: answers.flow,
    foodFrequency: answers.foodFrequency,
    form: answers.form,
    goals: answers.goals,
    heightCm: answers.heightCm,
    hrv: answers.hrv,
    kidney: answers.kidney,
    labs: answers.labs,
    labUnits: answers.labUnits,
    liver: answers.liver,
    maxPills: answers.maxPills,
    meds: answers.meds,
    medTypes: answers.medTypes,
    menopause: answers.menopause,
    otherMed: answers.otherMed,
    protein: answers.protein,
    reproStatus: answers.reproStatus,
    sex: answers.sex,
    skin: answers.skin,
    sleepHrs: answers.sleepHrs,
    smoking: answers.smoking,
    stress: answers.stress,
    sun: answers.sun,
    sunscreen: answers.sunscreen,
    suppAllergies: answers.suppAllergies,
    supplements: answers.supplements,
    surgery: answers.surgery,
    symptoms: answers.symptoms,
    tracker: answers.tracker,
    vo2: answers.vo2,
    weightKg: answers.weightKg
  };
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
        `xAI HealthScore request failed with ${response.status}: ${body.slice(0, 500)}`
      );
    }

    return (await response.json()) as XaiChatCompletion;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `xAI HealthScore request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds`
      );
    }

    throw error;
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
    errors.push(`${path} must be an object with localized string values`);
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
    errors.push(`${path} requires at least one localized string`);
  }

  return entries;
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

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJson);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableJson(value[key])])
    );
  }

  return value;
}

function jsonValue(value: unknown) {
  const serialized = JSON.stringify(value);

  return JSON.parse(serialized ?? "{}");
}

async function cacheKey({
  answers,
  healthScore,
  model,
  promptVersion,
  reasoningEffort
}: Readonly<{
  answers: unknown;
  healthScore: HealthScoreResult;
  model: string;
  promptVersion: string;
  reasoningEffort: string;
}>) {
  const payload = JSON.stringify(
    stableJson({
      assessment: compactAssessmentForAdvice(answers),
      cacheType: CACHE_TYPE,
      healthScore: compactHealthScoreForAdvice(healthScore),
      model,
      promptVersion,
      reasoningEffort
    })
  );
  const createHash = await getCreateHash();
  const digest = createHash("sha256").update(payload).digest("hex");

  return `${CACHE_TYPE}:${digest}`;
}

async function ensureCacheSchema() {
  const { getSql } = await import("./db.ts");
  const sql = getSql();

  if (!sql) {
    return null;
  }

  globalHealthScoreCache.mattanutraHealthScoreCacheSchemaReady ??= (async () => {
    const requiredColumns = [
      "cache_key",
      "cache_type",
      "model",
      "prompt_version",
      "response",
      "expires_at",
      "created_at",
      "updated_at"
    ];
    const rows = await sql<Array<{ column_name: string }>>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ai_response_cache'
    `;
    const available = new Set(rows.map((row) => row.column_name));
    const missing = requiredColumns
      .filter((column) => !available.has(column))
      .map((column) => `public.ai_response_cache.${column}`);

    if (missing.length > 0) {
      throw new Error(
        `HealthScore cache schema is incomplete. Apply db-schema.sql before using the advice cache. Missing: ${missing.join(", ")}`
      );
    }
  })().catch((error) => {
    globalHealthScoreCache.mattanutraHealthScoreCacheSchemaReady = undefined;
    throw error;
  });

  await globalHealthScoreCache.mattanutraHealthScoreCacheSchemaReady;

  return sql;
}

async function readCachedAdvice(key: string) {
  try {
    const sql = await ensureCacheSchema();

    if (!sql) {
      return null;
    }

    const rows = await sql<{ response: unknown }[]>`
      select response
      from public.ai_response_cache
      where cache_key = ${key}
        and cache_type = ${CACHE_TYPE}
        and expires_at > now()
      limit 1
    `;
    const cached = rows[0]?.response;

    if (!cached) {
      return null;
    }

    const validation = validateAdvice(cached);

    return validation.advice ?? null;
  } catch (error) {
    console.warn("Unable to read HealthScore advice cache", error);
    return null;
  }
}

async function writeCachedAdvice({
  advice,
  key,
  model,
  promptVersion
}: Readonly<{
  advice: HealthScoreAdvice;
  key: string;
  model: string;
  promptVersion: string;
}>) {
  try {
    const sql = await ensureCacheSchema();

    if (!sql) {
      return;
    }

    await sql`
      insert into public.ai_response_cache (
        cache_key,
        cache_type,
        model,
        prompt_version,
        response,
        expires_at
      )
      values (
        ${key},
        ${CACHE_TYPE},
        ${model},
        ${promptVersion},
        ${sql.json(jsonValue({ advice }))},
        now() + make_interval(days => ${CACHE_TTL_DAYS})
      )
      on conflict (cache_key) do update set
        response = excluded.response,
        updated_at = now(),
        expires_at = excluded.expires_at
    `;
    await sql`
      delete from public.ai_response_cache
      where cache_type = ${CACHE_TYPE}
        and expires_at < now()
    `;
  } catch (error) {
    console.warn("Unable to write HealthScore advice cache", error);
  }
}

export async function analyzeHealthScoreAdviceWithUsage({
  answers,
  cache = true,
  healthScore,
  locale
}: Readonly<{
  answers: unknown;
  cache?: boolean;
  healthScore: HealthScoreResult;
  locale: Locale;
}>): Promise<HealthScoreAdviceAnalysis> {
  const config = grokConfig();
  const key = await cacheKey({
    answers,
    healthScore,
    model: config.model,
    promptVersion: config.promptVersion,
    reasoningEffort: config.reasoningEffort
  });
  const cachedAdvice = cache ? await readCachedAdvice(key) : null;

  if (cachedAdvice) {
    return {
      advice: cachedAdvice,
      cachedOrExisting: true,
      model: config.model,
      promptVersion: config.promptVersion,
      reasoningEffort: config.reasoningEffort
    };
  }

  const messages: Array<{
    content: string;
    role: "assistant" | "system" | "user";
  }> = [
    { content: systemPrompt(config.promptVersion), role: "system" },
    { content: userPrompt({ answers, healthScore, locale }), role: "user" }
  ];
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const completion = await callGrok({
        apiKey: config.apiKey,
        messages,
        model: config.model,
        reasoningEffort: config.reasoningEffort
      });
      const content = completion.choices?.[0]?.message?.content;
      const validation = validateAdvice(parseJsonObject(content));

      if (validation.advice) {
        if (cache) {
          await writeCachedAdvice({
            advice: validation.advice,
            key,
            model: config.model,
            promptVersion: config.promptVersion
          });
        }
        return {
          advice: validation.advice,
          cachedOrExisting: false,
          model: completion.model ?? config.model,
          promptVersion: config.promptVersion,
          reasoningEffort: config.reasoningEffort,
          responseId: completion.id,
          usage: completion.usage
        };
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

export async function analyzeHealthScoreAdvice(
  input: Parameters<typeof analyzeHealthScoreAdviceWithUsage>[0]
) {
  return (await analyzeHealthScoreAdviceWithUsage(input)).advice;
}
