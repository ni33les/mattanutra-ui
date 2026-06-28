import { randomUUID } from "node:crypto";
import type { CanonicalSupplementOption } from "@/lib/canonical-supplements";
import { getSql } from "@/lib/db";
import { analyzeFormulationWithGrok } from "@/lib/formulation-analysis";
import { buildProductNeeds } from "@/lib/product-recommendation-needs";
import {
  callGrokChatCompletion,
  configuredGrokModel,
  configuredGrokValue,
  getRequiredXaiApiKey
} from "@/lib/grok-client";
import {
  DEFAULT_SIMULATION_SEED,
  SIMULATION_ARCHETYPES,
  normalizeDemandProfiles,
  normalizeSyntheticPlanArchetypes,
  type AdminPlanCoverageDemandProfile,
  type SyntheticPlanArchetype
} from "@/lib/admin-product-coverage-simulation";
import type { ProductClientSex } from "@/lib/product-recommendations";
import type { Locale } from "@/lib/i18n";
import {
  filterProductNeedsBySupplementAvailability,
  getSupplementEffectiveAvailability,
  normalizeSupplementAvailabilityCountryCode
} from "@/lib/supplement-country-availability";

const REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_REASONING_EFFORT = "low";

const optionValues = {
  activity: ["sitting", "light", "moderate", "active", "athlete"],
  age: ["18-25", "26-35", "36-45", "46-55", "56-65", "66+"],
  alcohol: ["none", "1-3", "4-7", "8+"],
  allergies: [
    "none",
    "milk",
    "eggs",
    "fish",
    "shellfish",
    "treenuts",
    "peanuts",
    "wheat",
    "soy",
    "sesame"
  ],
  antibiotics: ["no", "yes"],
  budget: ["u1000", "1000-2500", "2500-5000", "5000+"],
  caffeine: ["none", "1", "2-3", "4+"],
  diet: [
    "none",
    "processed",
    "balanced",
    "whole",
    "mediterranean",
    "plant",
    "vegan",
    "carnivore"
  ],
  digCondition: ["none", "ibs", "celiac", "ibd", "bariatric"],
  digestion: ["none", "bloating", "constipation", "loose"],
  energy: ["drained", "low", "ok", "good", "excellent"],
  family: ["heart", "alzheimers", "diabetes", "cancer", "osteoporosis", "none"],
  flow: ["none", "light", "moderate", "heavy"],
  form: ["capsules", "powder", "gummies", "mixed"],
  goals: [
    "energy",
    "sleep",
    "focus",
    "longevity",
    "immunity",
    "fitness",
    "weight",
    "mood",
    "heart",
    "joints",
    "skin",
    "hormones"
  ],
  maxPills: ["1-3", "4-6", "7-10", "nolimit"],
  kidney: ["normal", "reduced", "disease"],
  liver: ["normal", "condition"],
  meds: ["none", "yes"],
  medTypes: [
    "statin",
    "metformin",
    "ppi",
    "diuretic",
    "contraceptive",
    "antidepressant",
    "bloodthinner",
    "thyroid",
    "bp",
    "corticosteroid",
    "other"
  ],
  menopause: ["pre", "peri", "post", "unsure"],
  protein: ["u1", "1-1.5", "1.5-2", "2+"],
  reproStatus: ["none", "ttc", "pregnant", "breastfeeding"],
  sex: ["male", "female"],
  skin: ["I", "II", "III", "IV", "V", "VI"],
  sleepHrs: ["u5", "5-6", "6-7", "7-8", "8-9", "9+"],
  smoking: ["never", "ex5+", "ex5", "occasional", "daily"],
  stress: ["verylow", "low", "moderate", "high", "extreme"],
  sun: ["u15", "15-30", "30-60", "60+"],
  sunscreen: ["rarely", "sometimes", "daily"],
  suppAllergies: [
    "none",
    "iodine",
    "iron",
    "coq10",
    "bvit",
    "soyderived",
    "shellfishderived",
    "other"
  ],
  supplements: ["none", "basic", "d3omega", "targeted"],
  surgery: ["no", "yes"],
  symptoms: [
    "fatigue",
    "brainfog",
    "mood",
    "joint",
    "digestion",
    "sleep",
    "stress",
    "skin",
    "hair",
    "libido",
    "colds",
    "great"
  ],
  tracker: ["none", "garmin", "oura", "whoop", "apple", "fitbit", "other"]
} as const;

const foodFrequencyDefaults = {
  dairy: "1-2",
  eggs: "weekly",
  fish: "once",
  fruitveg: "1-2",
  legumes: "weekly",
  redmeat: "1-2"
};

function grokConfig() {
  return {
    apiKey: getRequiredXaiApiKey(),
    model: configuredGrokModel(process.env.GROK_MODEL),
    reasoningEffort:
      configuredGrokValue(process.env.PRODUCT_COVERAGE_DEMAND_REASONING_EFFORT) ||
      configuredGrokValue(process.env.FORMULATION_REASONING_EFFORT) ||
      DEFAULT_REASONING_EFFORT
  };
}

function recordFromUnknown(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hashSeed(value: string) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededPick<T>(items: readonly T[], seed: string, fallback: T): T {
  if (items.length < 1) {
    return fallback;
  }

  return items[hashSeed(seed) % items.length] ?? fallback;
}

function normalizedToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function ageBandFromArchetype(archetype: SyntheticPlanArchetype, seed: string) {
  const textBlob = [
    archetype.name,
    archetype.description,
    ...archetype.goals
  ].map(normalizedToken).join(" ");

  if (/perimenopause|menopause|hormone/.test(textBlob)) {
    return seededPick(["36-45", "46-55"], `${seed}:age`, "46-55");
  }

  if (/ageing|aging|older|longevity|mobility|vision/.test(textBlob)) {
    return seededPick(["56-65", "66+"], `${seed}:age`, "56-65");
  }

  if (/male|heart|performance/.test(textBlob)) {
    return seededPick(["36-45", "46-55"], `${seed}:age`, "46-55");
  }

  if (/parent|caregiver|manager|founder/.test(textBlob)) {
    return seededPick(["36-45", "46-55"], `${seed}:age`, "36-45");
  }

  if (/gym|active|fitness|train/.test(textBlob)) {
    return seededPick(["26-35", "36-45"], `${seed}:age`, "26-35");
  }

  return seededPick(["26-35", "36-45", "46-55"], `${seed}:age`, "36-45");
}

function ageBandIsOlder(age: string) {
  return age === "56-65" || age === "66+";
}

function menopauseFromAgeBand(age: string) {
  if (age === "56-65" || age === "66+") {
    return "post";
  }

  return age === "46-55" ? "peri" : "pre";
}

function mappedGoals(archetype: SyntheticPlanArchetype) {
  const textBlob = [
    archetype.name,
    archetype.description,
    ...archetype.goals
  ].map(normalizedToken).join(" ");
  const goals: string[] = [];

  const add = (goal: string, pattern: RegExp) => {
    if (pattern.test(textBlob) && goals.length < 3) {
      goals.push(goal);
    }
  };

  add("energy", /energy|fatigue|crash/);
  add("sleep", /sleep|recovery|traveller|stress/);
  add("focus", /focus|office|founder|manager|decision/);
  add("fitness", /fitness|gym|train|active|performance/);
  add("heart", /heart|male|ageing|cholesterol/);
  add("joints", /joint|mobility|ageing/);
  add("skin", /skin|female|hormone|menopause/);
  add("hormones", /hormone|menopause|female/);
  add("immunity", /immune|traveller|starter|coverage/);
  add("longevity", /ageing|longevity|older/);

  return [...new Set(goals)].slice(0, 3);
}

function mappedSymptoms(archetype: SyntheticPlanArchetype) {
  const textBlob = [
    archetype.name,
    archetype.description,
    ...archetype.goals
  ].map(normalizedToken).join(" ");
  const symptoms: string[] = [];

  if (/sleep|parent|travel/.test(textBlob)) symptoms.push("sleep");
  if (/stress|founder|manager|office/.test(textBlob)) symptoms.push("stress");
  if (/energy|fatigue|crash/.test(textBlob)) symptoms.push("fatigue");
  if (/focus|brain/.test(textBlob)) symptoms.push("brainfog");
  if (/joint|mobility|ageing/.test(textBlob)) symptoms.push("joint");
  if (/skin|hormone|menopause/.test(textBlob)) symptoms.push("skin");

  return (symptoms.length > 0 ? [...new Set(symptoms)] : ["great"]).slice(0, 4);
}

function defaultAnswers(input: Readonly<{
  archetype: SyntheticPlanArchetype;
  countryCode: string;
  sampleIndex: number;
  seed: string;
}>) {
  const seed = `${input.seed}:${input.sampleIndex}:${input.archetype.id}`;
  const sex: ProductClientSex =
    input.archetype.clientSex ??
    seededPick(optionValues.sex, `${seed}:sex`, "female");
  const age = ageBandFromArchetype(input.archetype, seed);
  const goals = mappedGoals(input.archetype);
  const stressy = /stress|founder|manager|parent|office/i.test(
    `${input.archetype.name} ${input.archetype.description}`
  );
  const active = /active|gym|fitness|performance|train/i.test(
    `${input.archetype.name} ${input.archetype.description}`
  );
  const plant = /plant|vegan/i.test(
    `${input.archetype.name} ${input.archetype.description}`
  );
  const older = ageBandIsOlder(age);

  return {
    activity: active ? "active" : stressy ? "light" : "moderate",
    age,
    alcohol: stressy ? "4-7" : "1-3",
    allergies: ["none"],
    antibiotics: "no",
    budget: seededPick(["1000-2500", "2500-5000"], `${seed}:budget`, "2500-5000"),
    caffeine: stressy ? "2-3" : "1",
    country: input.countryCode,
    diet: plant ? "plant" : "balanced",
    digCondition: "none",
    digestion: stressy ? "bloating" : "none",
    disclosure: true,
    energy: stressy ? "low" : active ? "good" : "ok",
    family: older ? ["heart"] : ["none"],
    firstName: seededPick(["Alex", "Maya", "Niran", "Ben", "Sara"], `${seed}:name`, "Alex"),
    flow: sex === "female" ? (older ? "none" : "moderate") : "",
    foodFrequency: {
      ...foodFrequencyDefaults,
      fish: plant ? "rare" : "once",
      fruitveg: plant ? "3+" : "1-2",
      redmeat: plant ? "never" : "1-2"
    },
    form: seededPick(optionValues.form, `${seed}:form`, "capsules"),
    goals: goals.length > 0 ? goals : ["energy", "immunity", "focus"],
    heightCm: String(sex === "male" ? 176 : 164),
    hrv: stressy ? "42" : "55",
    kidney: "normal",
    labs: {},
    labUnits: {
      b12: "pg/mL",
      ferritin: "ng/mL",
      hba1c: "%",
      homo: "umol/L",
      o3: "%",
      vitd: "ng/mL"
    },
    liver: "normal",
    maxPills: seededPick(["4-6", "7-10"], `${seed}:pills`, "4-6"),
    meds: "none",
    medTypes: [],
    menopause: sex === "female" ? menopauseFromAgeBand(age) : "",
    otherMed: "",
    otherTracker: "",
    protein: active ? "1.5-2" : "1-1.5",
    reproStatus: sex === "female" ? "none" : "",
    sex,
    skin: seededPick(["II", "III", "IV", "V"], `${seed}:skin`, "III"),
    sleepHrs: stressy ? "5-6" : "6-7",
    smoking: "never",
    stress: stressy ? "high" : "moderate",
    sun: seededPick(["15-30", "30-60"], `${seed}:sun`, "15-30"),
    sunscreen: "sometimes",
    surgery: "no",
    suppAllergies: ["none"],
    supplements: seededPick(["none", "basic", "d3omega"], `${seed}:supps`, "none"),
    symptoms: mappedSymptoms(input.archetype),
    tracker: active ? "garmin" : "none",
    vo2: active ? "48" : "36",
    weightKg: String(sex === "male" ? 78 : 62)
  };
}

function option(value: unknown, allowed: readonly string[], fallback: string) {
  const normalized = text(value);

  return allowed.includes(normalized) ? normalized : fallback;
}

function optionList(
  value: unknown,
  allowed: readonly string[],
  fallback: readonly string[],
  max = 8
) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]+/)
      : [];
  const result = values.flatMap((item) => {
    const normalized = text(item);

    return allowed.includes(normalized) ? [normalized] : [];
  });

  return result.length > 0 ? [...new Set(result)].slice(0, max) : [...fallback];
}

function numericText(value: unknown, fallback: string, min: number, max: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? String(Math.max(min, Math.min(max, Math.round(parsed))))
    : fallback;
}

function sanitizeAnswers(raw: unknown, fallback: ReturnType<typeof defaultAnswers>) {
  const record = recordFromUnknown(raw);
  const foodFrequency = recordFromUnknown(record.foodFrequency);
  const sex = option(record.sex, optionValues.sex, fallback.sex);
  const meds = option(record.meds, optionValues.meds, fallback.meds);
  const suppAllergies = optionList(
    record.suppAllergies,
    optionValues.suppAllergies,
    fallback.suppAllergies
  );

  return {
    ...fallback,
    activity: option(record.activity, optionValues.activity, fallback.activity),
    age: option(record.age, optionValues.age, fallback.age),
    alcohol: option(record.alcohol, optionValues.alcohol, fallback.alcohol),
    allergies: optionList(record.allergies, optionValues.allergies, fallback.allergies),
    antibiotics: option(record.antibiotics, optionValues.antibiotics, fallback.antibiotics),
    budget: option(record.budget, optionValues.budget, fallback.budget),
    caffeine: option(record.caffeine, optionValues.caffeine, fallback.caffeine),
    country: fallback.country,
    diet: option(record.diet, optionValues.diet, fallback.diet),
    digCondition: option(
      record.digCondition,
      optionValues.digCondition,
      fallback.digCondition
    ),
    digestion: option(record.digestion, optionValues.digestion, fallback.digestion),
    disclosure: true,
    energy: option(record.energy, optionValues.energy, fallback.energy),
    family: optionList(record.family, optionValues.family, fallback.family),
    firstName: text(record.firstName).slice(0, 40) || fallback.firstName,
    flow: sex === "female" ? option(record.flow, optionValues.flow, fallback.flow) : "",
    foodFrequency: {
      dairy: option(foodFrequency.dairy, ["never", "1-2", "3+"], fallback.foodFrequency.dairy),
      eggs: option(foodFrequency.eggs, ["rare", "weekly", "most"], fallback.foodFrequency.eggs),
      fish: option(foodFrequency.fish, ["never", "rare", "once", "often"], fallback.foodFrequency.fish),
      fruitveg: option(foodFrequency.fruitveg, ["notdaily", "1-2", "3+"], fallback.foodFrequency.fruitveg),
      legumes: option(foodFrequency.legumes, ["rare", "weekly", "most"], fallback.foodFrequency.legumes),
      redmeat: option(foodFrequency.redmeat, ["never", "1-2", "3+"], fallback.foodFrequency.redmeat)
    },
    form: option(record.form, optionValues.form, fallback.form),
    goals: optionList(record.goals, optionValues.goals, fallback.goals, 3),
    heightCm: numericText(record.heightCm, fallback.heightCm, 120, 220),
    hrv: numericText(record.hrv, fallback.hrv, 20, 120),
    kidney: option(record.kidney, optionValues.kidney, fallback.kidney),
    labs: recordFromUnknown(record.labs),
    labUnits: {
      ...fallback.labUnits,
      ...recordFromUnknown(record.labUnits)
    },
    liver: option(record.liver, optionValues.liver, fallback.liver),
    maxPills: option(record.maxPills, optionValues.maxPills, fallback.maxPills),
    meds,
    medTypes:
      meds === "yes"
        ? optionList(record.medTypes, optionValues.medTypes, fallback.medTypes, 4)
        : [],
    menopause:
      sex === "female"
        ? option(record.menopause, optionValues.menopause, fallback.menopause)
        : "",
    otherMed: text(record.otherMed).slice(0, 120),
    otherTracker: text(record.otherTracker).slice(0, 80),
    protein: option(record.protein, optionValues.protein, fallback.protein),
    reproStatus:
      sex === "female"
        ? option(record.reproStatus, optionValues.reproStatus, fallback.reproStatus)
        : "",
    sex,
    skin: option(record.skin, optionValues.skin, fallback.skin),
    sleepHrs: option(record.sleepHrs, optionValues.sleepHrs, fallback.sleepHrs),
    smoking: option(record.smoking, optionValues.smoking, fallback.smoking),
    stress: option(record.stress, optionValues.stress, fallback.stress),
    sun: option(record.sun, optionValues.sun, fallback.sun),
    sunscreen: option(record.sunscreen, optionValues.sunscreen, fallback.sunscreen),
    surgery: option(record.surgery, optionValues.surgery, fallback.surgery),
    suppAllergies,
    supplements: option(record.supplements, optionValues.supplements, fallback.supplements),
    symptoms: optionList(record.symptoms, optionValues.symptoms, fallback.symptoms, 8),
    tracker: option(record.tracker, optionValues.tracker, fallback.tracker),
    vo2: numericText(record.vo2, fallback.vo2, 10, 90),
    weightKg: numericText(record.weightKg, fallback.weightKg, 35, 180)
  };
}

function archetypeForQuestionnairePrompt(archetype: SyntheticPlanArchetype) {
  return {
    clientSex: archetype.clientSex,
    customerCount: archetype.customerCount,
    description: archetype.description,
    goals: archetype.goals,
    id: archetype.id,
    medications: archetype.medications,
    name: archetype.name,
    needCount: archetype.needCount,
    preferredSupplementNames: archetype.preferredSupplementNames,
    source: archetype.source
  };
}

function parseJsonObject(content: string | null | undefined) {
  if (!content) {
    throw new Error("AI returned empty questionnaire content");
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
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }

    throw new Error("AI questionnaire response was not valid JSON");
  }
}

async function generateAssessmentAnswersWithAi(input: Readonly<{
  archetype: SyntheticPlanArchetype;
  countryCode: string;
  sampleIndex: number;
  seed: string;
}>) {
  const config = grokConfig();
  const fallback = defaultAnswers(input);
  const completion = await callGrokChatCompletion({
    apiKey: config.apiKey,
    maxTokens: 2400,
    messages: [
      {
        content: [
          "You fill MattaNutra wellness assessment questionnaires for internal catalogue simulation.",
          "Return JSON only with one top-level key: answers.",
          "Create a mainstream, realistic person from the supplied archetype.",
          "Choose a plausible adult age band from the allowed age values; age is not supplied as an archetype setting.",
          "Avoid rare edge cases unless the archetype explicitly requires them.",
          "Use only the allowed option values. Do not invent option values.",
          "The result is synthetic test data and must not include direct identifiers."
        ].join("\n"),
        role: "system"
      },
      {
        content: JSON.stringify(
          {
            allowedValues: optionValues,
            archetype: archetypeForQuestionnairePrompt(input.archetype),
            countryCode: input.countryCode,
            fallbackAnswers: fallback,
            instructions: [
              "Fill every required answer field.",
              "Keep the profile mainstream and commercially representative.",
              "Choose age from the allowed bands based on the archetype context.",
              "Use goals and symptoms that fit the archetype.",
              "Most profiles should have no serious medical conditions.",
              "Use medication context sparingly and only when plausible.",
              "Set disclosure true.",
              "Use country exactly as supplied."
            ],
            sampleIndex: input.sampleIndex,
            seed: input.seed
          },
          null,
          2
        ),
        role: "user"
      }
    ],
    model: config.model,
    purpose: "admin product coverage questionnaire generation",
    reasoningEffort: config.reasoningEffort,
    temperature: 0.25,
    timeoutMs: REQUEST_TIMEOUT_MS
  });
  const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);

  return sanitizeAnswers(parsed.answers, fallback);
}

async function loadCanonicalSupplementOptions(
  sql: NonNullable<ReturnType<typeof getSql>>,
  countryCode: string
): Promise<CanonicalSupplementOption[]> {
  const rows = await sql<Array<{
    aliases: string[];
    category: string;
    id: string;
    list_status: string;
    max_amount: string | number | null;
    max_unit: string | null;
    name: string;
    normalized_name: string;
    safety_flags: string[] | null;
    safety_notes: string | null;
  }>>`
    select
      supplements.id::text,
      supplements.name,
      supplements.normalized_name,
      supplements.category,
      case
        when country_availability.status = 'allowed' then 'active'
        when country_availability.status = 'blocked' then 'blocked'
        when supplements.is_active = false then 'blocked'
        else supplements.list_status
      end as list_status,
      safety.max_amount,
      safety.max_unit,
      safety.safety_flags,
      safety.safety_notes,
      coalesce(
        array_agg(distinct supplement_aliases.alias)
          filter (
            where supplement_aliases.alias is not null
              and supplement_aliases.normalized_alias <> supplements.normalized_name
          ),
        '{}'::text[]
      ) as aliases
    from public.supplements
    left join lateral (
      select rule.status
      from jsonb_to_recordset(
        case
          when jsonb_typeof(supplements.source_payload -> 'countryAvailability') = 'array'
            then supplements.source_payload -> 'countryAvailability'
          else '[]'::jsonb
        end
      ) as rule("countryCode" text, country_code text, status text)
      where coalesce(rule."countryCode", rule.country_code) = ${countryCode}
        and rule.status in ('allowed', 'blocked')
      limit 1
    ) country_availability on true
    left join public.supplement_aliases
      on supplement_aliases.supplement_id = supplements.id
    left join lateral (
      select max_amount, max_unit, safety_flags, safety_notes
      from public.supplement_safety_limits
      where supplement_safety_limits.supplement_id = supplements.id
      order by version desc, updated_at desc
      limit 1
    ) safety on true
    where (
      country_availability.status = 'allowed'
      or (
        country_availability.status is null
        and supplements.is_active = true
        and supplements.list_status = 'active'
      )
    )
    group by
      supplements.id,
      supplements.name,
      supplements.normalized_name,
      supplements.category,
      supplements.list_status,
      supplements.is_active,
      country_availability.status,
      safety.max_amount,
      safety.max_unit,
      safety.safety_flags,
      safety.safety_notes
    order by supplements.name
    limit 220
  `;

  return rows.map((row) => ({
    aliases: row.aliases ?? [],
    category: row.category,
    id: row.id,
    listStatus: row.list_status,
    maxAmount:
      row.max_amount === null || row.max_amount === undefined
        ? null
        : Number(row.max_amount),
    maxUnit: row.max_unit,
    name: row.name,
    normalizedName: row.normalized_name,
    safetyFlags: row.safety_flags ?? [],
    safetyNotes: row.safety_notes
  }));
}

export async function generateAdminPlanCoverageDemandProfile(input: Readonly<{
  archetypes?: readonly SyntheticPlanArchetype[] | null;
  countryCode?: string | null;
  locale?: Locale | null;
  sampleIndex?: number | null;
  seed?: string | null;
}>): Promise<AdminPlanCoverageDemandProfile> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const sampleIndex = Math.max(0, Math.round(Number(input.sampleIndex) || 0));
  const seed = input.seed?.trim() || DEFAULT_SIMULATION_SEED;
  const archetypes = normalizeSyntheticPlanArchetypes(
    input.archetypes && input.archetypes.length > 0
      ? input.archetypes
      : SIMULATION_ARCHETYPES
  );
  const archetype = archetypes[sampleIndex % archetypes.length]!;
  const countryCode = normalizeSupplementAvailabilityCountryCode(input.countryCode);
  const [canonicalSupplements, answers] = await Promise.all([
    loadCanonicalSupplementOptions(sql, countryCode),
    generateAssessmentAnswersWithAi({
      archetype,
      countryCode,
      sampleIndex,
      seed
    })
  ]);
  const analysis = await analyzeFormulationWithGrok({
    answers,
    audit: async () => undefined,
    canonicalSupplements,
    locale: input.locale ?? "en",
    plan: "precision",
    planId: randomUUID(),
    taskId: null
  });
  const availability = await getSupplementEffectiveAvailability(sql, countryCode);
  const needs = filterProductNeedsBySupplementAvailability(
    buildProductNeeds({
      foodGuidance: null,
      formulation: analysis.formulation
    }),
    availability
  );

  if (needs.length < 1) {
    throw new Error("Generated formulation did not return usable supplement needs");
  }

  const profile = normalizeDemandProfiles([{
    answers,
    archetypeId: archetype.id,
    archetypeName: archetype.name,
    clientSex: answers.sex === "female" || answers.sex === "male" ? answers.sex : null,
    generatedAt: new Date().toISOString(),
    id: `ai-demand-${sampleIndex + 1}-${archetype.id}`,
    needs,
    sampleIndex,
    supplementNames: needs.map((need) => need.displayName)
  }])[0];

  if (!profile) {
    throw new Error("Generated demand profile was not usable");
  }

  return profile;
}
