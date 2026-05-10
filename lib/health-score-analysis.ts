import { createHash } from "crypto";
import type {
  HealthScoreAdvice,
  HealthScorePaywallFeature,
  HealthScoreResult,
  LocalizedHealthScoreText
} from "@/lib/health-score";
import { getSql } from "@/lib/db";
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
const DEFAULT_GROK_MODEL = "grok-4.3";
const DEFAULT_HEALTHSCORE_REASONING_EFFORT = "medium";
const DEFAULT_PROMPT_VERSION = "v5";
const CACHE_TYPE = "healthscore_advice";
const CACHE_TTL_DAYS = 7;
const MAX_ATTEMPTS = 1;
const REQUEST_TIMEOUT_MS = 25_000;

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
        "Every localized field must contain exactly en and th strings.",
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
        "Return both English and Thai."
      ],
      locale,
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
    sedentary: "mostly sitting"
  },
  alcohol: {
    high: "8+ alcoholic drinks per week",
    low: "1-3 alcoholic drinks per week",
    moderate: "4-7 alcoholic drinks per week",
    none: "no alcohol"
  },
  budget: {
    good: "฿2,500-5,000 monthly supplement budget",
    high: "฿5,000+ monthly supplement budget",
    low: "under ฿1,000 monthly supplement budget",
    mid: "฿1,000-2,500 monthly supplement budget"
  },
  conditions: {
    autoimmune: "autoimmune considerations",
    bone: "bone density support",
    "blood-sugar": "blood sugar support",
    cholesterol: "cholesterol support",
    digestive: "digestive condition",
    hbp: "high blood pressure",
    joints: "joint support",
    mood: "mood support",
    none: "no known health considerations",
    thyroid: "thyroid support"
  },
  diet: {
    balanced: "balanced diet",
    keto: "carnivore diet",
    mediterranean: "Mediterranean diet",
    none: "no defined diet pattern",
    plant: "plant-based diet",
    vegan: "vegan diet",
    western: "processed diet",
    whole: "whole-food diet"
  },
  energy: {
    "1": "drained energy",
    "2": "low energy",
    "3": "OK energy",
    "4": "good energy",
    "5": "excellent energy"
  },
  fish: {
    "2-3pw": "fatty fish often",
    daily: "fatty fish daily",
    never: "no fatty fish",
    rarely: "fatty fish rarely",
    weekly: "fatty fish once per week"
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
    immune: "immunity",
    joints: "joints / bones",
    longevity: "longevity",
    mood: "mood / calm",
    skin: "skin / hair",
    sleep: "better sleep",
    weight: "weight loss"
  },
  gut: {
    bloat: "bloating",
    constipation: "constipation",
    great: "no digestion issues",
    ibs: "IBS / mixed digestion",
    loose: "loose stools"
  },
  meds: {
    no: "no medications reported",
    yes: "medications reported"
  },
  medTypes: {
    antidepressant: "antidepressant",
    "blood-thinner": "blood thinner / aspirin",
    bp: "blood pressure medication",
    metformin: "metformin",
    ocp: "contraceptive pill",
    other: "other medication",
    ppi: "PPI / omeprazole",
    statin: "statin",
    steroid: "corticosteroid",
    thyroid: "thyroid medication"
  },
  pills: {
    "1-3": "1-3 pills per day limit",
    "4-6": "4-6 pills per day limit",
    "7-10": "7-10 pills per day limit",
    unlimited: "no pill limit"
  },
  protein: {
    good: "1.5-2g/kg protein per day",
    high: "over 2g/kg protein per day",
    low: "under 1g/kg protein per day",
    mid: "1-1.5g/kg protein per day"
  },
  sleep: {
    "1": "wakes feeling awful",
    "2": "wakes feeling poor",
    "3": "wakes feeling OK",
    "4": "wakes feeling good",
    "5": "wakes feeling great"
  },
  smoke: {
    daily: "daily smoker",
    exlong: "ex-smoker over 5 years",
    exrecent: "recent ex-smoker",
    never: "never smoker",
    occasional: "occasional smoker"
  },
  stress: {
    "1": "very low stress",
    "2": "low stress",
    "3": "moderate stress",
    "4": "high stress",
    "5": "extreme stress"
  },
  stressSource: {
    anxiety: "stress source: anxiety",
    burnout: "stress source: burnout",
    health: "stress source: health",
    life: "stress source: life events",
    none: "no clear stress source",
    work: "stress source: work"
  },
  sun: {
    high: "60+ minutes sun exposure",
    low: "15-30 minutes sun exposure",
    minimal: "under 15 minutes sun exposure",
    moderate: "30-60 minutes sun exposure"
  },
  supps: {
    basic: "currently uses a basic multivitamin",
    many: "currently uses several targeted supplements",
    none: "not currently taking supplements",
    several: "currently uses D3 / Omega-3"
  },
  symptoms: {
    brain: "brain fog",
    cold: "frequent colds",
    digestion: "digestion symptoms",
    fatigue: "fatigue",
    hair: "hair loss",
    joints: "joint pain",
    libido: "low libido",
    mood: "mood symptoms",
    skin: "skin symptoms",
    sleep: "poor sleep",
    stress: "stress / anxiety"
  },
  vo2Proxy: {
    athlete: "30+ minutes hard effort",
    moderate: "brisk walk feels hard",
    sustained: "20-30 minutes moderate cardio",
    winded: "winded on stairs"
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
  const conditions = answerListLabels("conditions", answers.conditions);
  const medTypes = answerListLabels("medTypes", answers.medTypes);
  const labs = isRecord(answers.labs)
    ? Object.entries(answers.labs)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([key, value]) => `${key}: ${value}`)
    : [];
  const sleepHours = textAnswer(answers, "sleepHours");
  const vo2Max = textAnswer(answers, "vo2Max");
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
    conditions.length
      ? `Known health considerations: ${conditions.join(", ")}`
      : "",
    signal("Practical constraints", [
      answerLabel("budget", answers.budget),
      answerLabel("pills", answers.pills),
      answerLabel("form", answers.form)
    ]),
    signal("Sleep, energy, stress", [
      sleepHours ? `sleep duration ${sleepHours}` : "",
      answerLabel("sleep", answers.sleep),
      answerLabel("energy", answers.energy),
      answerLabel("stress", answers.stress),
      answerLabel("stressSource", answers.stressSource)
    ]),
    signal("Lifestyle context", [
      answerLabel("diet", answers.diet),
      answerLabel("fish", answers.fish),
      answerLabel("protein", answers.protein),
      answerLabel("alcohol", answers.alcohol),
      answerLabel("sun", answers.sun)
    ]),
    signal("Movement context", [
      answerLabel("activity", answers.activity),
      answerLabel("vo2Proxy", answers.vo2Proxy),
      vo2Max ? `VO2 max ${vo2Max}` : ""
    ]),
    signal("Safety context", [
      answerLabel("meds", answers.meds),
      medTypes.length ? `medication types: ${medTypes.join(", ")}` : ""
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
    budget: answers.budget,
    build: answers.build,
    coffee: answers.coffee,
    conditions: answers.conditions,
    country: answers.country,
    diet: answers.diet,
    energy: answers.energy,
    family: answers.family,
    fish: answers.fish,
    feelGreat: answers.feelGreat,
    form: answers.form,
    goals: answers.goals,
    gut: answers.gut,
    heightCm: answers.heightCm,
    labs: answers.labs,
    lifestage: answers.lifestage,
    meds: answers.meds,
    medTypes: answers.medTypes,
    notes: answers.notes,
    pills: answers.pills,
    protein: answers.protein,
    sex: answers.sex,
    skin: answers.skin,
    sleep: answers.sleep,
    sleepHours: answers.sleepHours,
    smoke: answers.smoke,
    stress: answers.stress,
    stressSource: answers.stressSource,
    sun: answers.sun,
    supps: answers.supps,
    symptoms: answers.symptoms,
    vo2Known: answers.vo2Known,
    vo2Max: answers.vo2Max,
    vo2Proxy: answers.vo2Proxy,
    wearable: answers.wearable,
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

function cacheKey({
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
  const digest = createHash("sha256").update(payload).digest("hex");

  return `${CACHE_TYPE}:${digest}`;
}

async function ensureCacheSchema() {
  const sql = getSql();

  if (!sql) {
    return null;
  }

  globalHealthScoreCache.mattanutraHealthScoreCacheSchemaReady ??= (async () => {
    await sql`
      create table if not exists public.ai_response_cache (
        cache_key text primary key,
        cache_type text not null,
        model text not null,
        prompt_version text not null,
        response jsonb not null,
        expires_at timestamptz not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create index if not exists ai_response_cache_type_expiry_idx
        on public.ai_response_cache (cache_type, expires_at desc)
    `;
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

export async function analyzeHealthScoreAdvice({
  answers,
  cache = true,
  healthScore,
  locale
}: Readonly<{
  answers: unknown;
  cache?: boolean;
  healthScore: HealthScoreResult;
  locale: Locale;
}>) {
  const config = grokConfig();
  const key = cacheKey({
    answers,
    healthScore,
    model: config.model,
    promptVersion: config.promptVersion,
    reasoningEffort: config.reasoningEffort
  });
  const cachedAdvice = cache ? await readCachedAdvice(key) : null;

  if (cachedAdvice) {
    return cachedAdvice;
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
