async function getCreateHash() {
  const crypto = await import("crypto");
  return crypto.createHash;
}

import type {
  HealthScoreAdvice,
  HealthScorePageAiCopy,
  HealthScoreResult
} from "@/lib/health-score";
import type { ValidatedHealthScoreAiResponse } from "@/lib/health-score/ai-response-validator";
import { validateHealthScoreAiResponse } from "@/lib/health-score/ai-response-validator";
import {
  callGrokChatCompletion,
  configuredGrokModel,
  configuredGrokValue,
  getRequiredXaiApiKey
} from "@/lib/grok-client";
import type { Locale } from "@/lib/i18n";

export { validateHealthScoreAiResponse };

export type HealthScoreAdviceAnalysis = Readonly<{
  advice: HealthScoreAdvice;
  aiCopy?: HealthScorePageAiCopy;
  cachedOrExisting: boolean;
  model: string;
  promptVersion: string;
  reasoningEffort: string;
  responseId?: string;
  usage?: unknown;
}>;

const DEFAULT_HEALTHSCORE_COPY_MODEL = "grok-4.3";
const DEFAULT_HEALTHSCORE_REASONING_EFFORT = "none";
const DEFAULT_PROMPT_VERSION = "v8-single-display-locale";
const CACHE_TYPE = "healthscore_page_copy";
const CACHE_TTL_DAYS = 7;
const MAX_ATTEMPTS = 2;
const MAX_RESPONSE_TOKENS = 4_500;
const REQUEST_TIMEOUT_MS = 60_000;

const globalHealthScoreCache = globalThis as typeof globalThis & {
  mattanutraHealthScoreCacheSchemaReady?: Promise<void>;
};

function grokConfig() {
  return {
    apiKey: getRequiredXaiApiKey(),
    model: configuredGrokModel(
      process.env.HEALTHSCORE_COPY_MODEL,
      process.env.GROK_MODEL,
      DEFAULT_HEALTHSCORE_COPY_MODEL
    ),
    promptVersion: DEFAULT_PROMPT_VERSION,
    reasoningEffort:
      configuredGrokValue(process.env.HEALTHSCORE_REASONING_EFFORT) ||
      DEFAULT_HEALTHSCORE_REASONING_EFFORT
  };
}

function systemPrompt(promptVersion: string) {
  return [
    `You are MattaNutra's HealthScore page copy engine ${promptVersion}.`,
    "The deterministic engine has already selected the score, pillars, findings, counts, and evidence.",
    "Your job is to polish copy only inside the provided pageCopy slots. Never change numbers, flags, card counts, product counts, score bands, or what each card is about.",
    "Write like a calm premium wellness advisor: specific, useful, commercially clear, and trustworthy.",
    "Never sound generic. If a sentence could fit most customers, it is wrong.",
    "Do not recommend supplements, doses, products, treatments, diagnosis, disease claims, lab testing, or medication changes.",
    "Return JSON only. The first character must be { and the last character must be }."
  ].join("\n");
}

const displayLocaleNames = {
  en: "English",
  th: "Thai",
  "zh-CN": "Simplified Chinese"
} satisfies Record<Locale, string>;

function userPrompt({
  answers,
  healthScore,
  locale
}: Readonly<{
  answers: unknown;
  healthScore: HealthScoreResult;
  locale: Locale;
}>) {
  const pageContent = healthScore.pageContent;

  return JSON.stringify(
    {
      assessment: compactAssessmentForAdvice(answers),
      contract: {
        pageCopy: {
          bandLine: "Localized version of copySeeds.bandLine.",
          gapTrio: "Exactly the same number/order as copySeeds.gapTrio.",
          heroBody: "Localized supporting hero paragraph.",
          heroTitle: "Localized goal mirror matching the prototype: 'You came here for...' adapted to this person's goals.",
          findings: "Exactly the same number/order as copySeeds.findings.",
          findingsHeadline: "Localized headline for the 'What we caught' section.",
          findingsSub: "Localized supporting line for the 'What we caught' section.",
          highestLeverageBody: "Localized body for copySeeds.highestLeverage when present; otherwise a short goal-linked pillar observation.",
          methodCards: "Exactly 3 localized method cards.",
          methodHeadline: "Localized method section headline.",
          pillarHeadline: "Localized headline for the pillar section, anchored to goal-linked pillars.",
          relativityHeadline: "Localized copySeeds.relativity.headline.",
          relativitySub: "Localized copySeeds.relativity.sub.",
          strengthNote: "Localized note about the strongest pillar or already-mastered area.",
          subtractionBody: "Localized copySeeds.subtraction.body."
        }
      },
      deterministicContent: pageContent
        ? {
            copySeeds: pageContent.copySeeds,
            locked: pageContent.locked,
            meta: pageContent.meta
          }
        : null,
      healthScore: compactHealthScoreForAdvice(healthScore),
      instructions: [
        "Return exactly one top-level key: pageCopy.",
        `Write every user-facing field in ${displayLocaleNames[locale]} (${locale}).`,
        "Every pageCopy field must be a plain string in the requested display locale, not a localized object.",
        "Every card headline/title/body must be a plain string in the requested display locale, not { en, th } or other language maps.",
        "Return only the requested display locale for user-facing prose. Do not return parallel English/Thai/Chinese copies.",
        "Use the deterministicContent.copySeeds as source material, but make the copy warmer and more specific.",
        "Match the attached HealthScore prototype slots: hero goal mirror, score meaning, gap cards, pillar leverage, what-we-caught, subtraction beat, and method cards.",
        "Do not introduce any new finding, new score reason, new safety issue, new supplement, new product, or new measurement.",
        "For gapTrio and findings, keep the same array length, order, and purpose as the deterministic seeds.",
        "For methodCards, return exactly 3 cards and preserve the same purpose: goals direction, data/routine precision, and diet/safety focus.",
        "Use personalizationSignals to mention only signals the user actually supplied: goals, diet, activity, sleep, labs or wearables, symptoms, safety flags, lowest pillars, goal-linked pillars, findings, and subtraction mode.",
        "Keep copy concise enough for responsive cards: heroTitle under 120 English characters, card headlines under 70 English characters, card bodies under 190 English characters.",
        "No HTML tags. No markdown. No medical advice. No diagnosis. No bloodwork/lab-test/get-tested language.",
        "Do not mention that any value is locked, capped, or unmeasured.",
        "Do not alter or restate numbers unless they appear in deterministicContent.locked or copySeeds."
      ],
      locale,
      outputLocaleMode: "single_display_locale",
      personalizationSignals: buildPersonalizationSignals(answers, healthScore),
      requestedDisplayLocale: locale
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
    "1000-2500": "THB 1,000-2,500 monthly supplement budget",
    "2500-5000": "THB 2,500-5,000 monthly supplement budget",
    "5000+": "THB 5,000+ monthly supplement budget",
    u1000: "under THB 1,000 monthly supplement budget"
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
    fitness: "fitness",
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
  medTypes: {
    bloodthinner: "blood thinner / aspirin",
    diuretic: "diuretic",
    metformin: "metformin",
    ppi: "PPI / omeprazole",
    statin: "statin",
    thyroid: "thyroid medication"
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

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
  const labs = isRecord(answers.labs)
    ? Object.entries(answers.labs)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([key, value]) => {
          const labUnits = isRecord(answers.labUnits) ? answers.labUnits : {};
          return `${key}: ${value}${typeof labUnits[key] === "string" ? ` ${labUnits[key]}` : ""}`;
        })
    : [];
  const foodFrequency = isRecord(answers.foodFrequency)
    ? answers.foodFrequency
    : {};

  return [
    `HealthScore: ${healthScore.score}/100 (${healthScore.band})`,
    healthScore.version ? `Score version: ${healthScore.version}` : "",
    lowest ? `Lowest pillar: ${lowest.label} (${lowest.score}/100)` : "",
    secondLowest ? `Second-lowest pillar: ${secondLowest.label} (${secondLowest.score}/100)` : "",
    goals.length ? `Primary goals: ${goals.join(", ")}` : "",
    symptoms.length ? `Current friction: ${symptoms.join(", ")}` : "",
    healthScore.flagCodes?.length ? `Safety/content flags: ${healthScore.flagCodes.join(", ")}` : "",
    signal("Sleep, energy, stress", [
      textAnswer(answers, "sleepHrs") ? `sleep duration ${textAnswer(answers, "sleepHrs")}` : "",
      answerLabel("energy", answers.energy),
      answerLabel("stress", answers.stress)
    ]),
    signal("Lifestyle context", [
      answerLabel("diet", answers.diet),
      answerLabel("protein", answers.protein),
      answerLabel("alcohol", answers.alcohol),
      answerLabel("sun", answers.sun),
      answerLabel("smoking", answers.smoking),
      answerLabel("fish", foodFrequency.fish)
    ]),
    signal("Movement context", [
      answerLabel("activity", answers.activity),
      textAnswer(answers, "vo2") ? `VO2 max ${textAnswer(answers, "vo2")}` : ""
    ]),
    signal("Safety context", [
      answerLabel("reproStatus", answers.reproStatus),
      answerLabel("kidney", answers.kidney),
      answerLabel("liver", answers.liver),
      medTypes.length ? `medication types: ${medTypes.join(", ")}` : ""
    ]),
    signal("Practical constraints", [
      answerLabel("budget", answers.budget),
      answerLabel("maxPills", answers.maxPills),
      answerLabel("form", answers.form)
    ]),
    labs.length ? `Measurements supplied: ${labs.slice(0, 6).join(", ")}` : ""
  ].filter(Boolean).slice(0, 14);
}

function compactHealthScoreForAdvice(healthScore: HealthScoreResult) {
  return {
    band: healthScore.band,
    domains: healthScore.domains.map((domain) => ({
      id: domain.id,
      label: domain.label,
      score: domain.score
    })),
    flagCodes: healthScore.flagCodes ?? [],
    locked: healthScore.pageContent?.locked,
    movers: healthScore.movers,
    score: healthScore.score,
    version: healthScore.version
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
    caffeine: answers.caffeine,
    country: answers.country,
    diet: answers.diet,
    digestion: answers.digestion,
    energy: answers.energy,
    foodFrequency: answers.foodFrequency,
    form: answers.form,
    goals: answers.goals,
    hrv: answers.hrv,
    kidney: answers.kidney,
    labs: answers.labs,
    labUnits: answers.labUnits,
    liver: answers.liver,
    maxPills: answers.maxPills,
    meds: answers.meds,
    medTypes: answers.medTypes,
    protein: answers.protein,
    reproStatus: answers.reproStatus,
    sex: answers.sex,
    sleepHrs: answers.sleepHrs,
    smoking: answers.smoking,
    stress: answers.stress,
    sun: answers.sun,
    sunscreen: answers.sunscreen,
    supplements: answers.supplements,
    symptoms: answers.symptoms,
    vo2: answers.vo2
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
  return callGrokChatCompletion({
    apiKey,
    maxTokens: MAX_RESPONSE_TOKENS,
    messages,
    model,
    purpose: "HealthScore request",
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
      return JSON.parse(
        trimmed.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1")
      ) as unknown;
    }

    throw new Error("Model returned content that was not valid JSON");
  }
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJson);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => key !== "aiCopy" && key !== "advice")
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
  locale,
  model,
  promptVersion,
  reasoningEffort
}: Readonly<{
  answers: unknown;
  healthScore: HealthScoreResult;
  locale: Locale;
  model: string;
  promptVersion: string;
  reasoningEffort: string;
}>) {
  const payload = JSON.stringify(
    stableJson({
      assessment: compactAssessmentForAdvice(answers),
      cacheType: CACHE_TYPE,
      healthScore: compactHealthScoreForAdvice(healthScore),
      locale,
      pageContent: healthScore.pageContent,
      model,
      outputLocaleMode: "single_display_locale",
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
        `HealthScore cache schema is incomplete. Apply db-schema.sql before using the copy cache. Missing: ${missing.join(", ")}`
      );
    }
  })().catch((error) => {
    globalHealthScoreCache.mattanutraHealthScoreCacheSchemaReady = undefined;
    throw error;
  });

  await globalHealthScoreCache.mattanutraHealthScoreCacheSchemaReady;

  return sql;
}

async function readCachedAnalysis(
  key: string,
  healthScore: HealthScoreResult,
  locale: Locale
) {
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

    const validation = validateHealthScoreAiResponse({
      healthScore,
      locale,
      value: cached
    });

    return validation.response ?? null;
  } catch (error) {
    console.warn("Unable to read HealthScore copy cache", error);
    return null;
  }
}

async function writeCachedAnalysis({
  key,
  model,
  promptVersion,
  response
}: Readonly<{
  key: string;
  model: string;
  promptVersion: string;
  response: ValidatedHealthScoreAiResponse;
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
        ${sql.json(jsonValue(response))},
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
    console.warn("Unable to write HealthScore copy cache", error);
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
    locale,
    model: config.model,
    promptVersion: config.promptVersion,
    reasoningEffort: config.reasoningEffort
  });
  const cached = cache
    ? await readCachedAnalysis(key, healthScore, locale)
    : null;

  if (cached) {
    return {
      advice: cached.advice,
      aiCopy: cached.pageCopy,
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
      const validation = validateHealthScoreAiResponse({
        healthScore,
        locale,
        value: parseJsonObject(content)
      });

      if (validation.response) {
        if (cache) {
          await writeCachedAnalysis({
            key,
            model: config.model,
            promptVersion: config.promptVersion,
            response: validation.response
          });
        }
        return {
          advice: validation.response.advice,
          aiCopy: validation.response.pageCopy,
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
          : "Unknown HealthScore copy error"
      ];
      messages.push({ content: retryPrompt(lastErrors), role: "user" });
    }
  }

  throw new Error(
    `HealthScore copy generation failed after ${MAX_ATTEMPTS} attempts: ${lastErrors.join("; ")}`
  );
}

export async function analyzeHealthScoreAdvice(
  input: Parameters<typeof analyzeHealthScoreAdviceWithUsage>[0]
) {
  return (await analyzeHealthScoreAdviceWithUsage(input)).advice;
}
