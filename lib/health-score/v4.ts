import type { Locale } from "@/lib/i18n";
import { t, type MessageId, type MessageValues } from "@/lib/i18n-messages";
import type {
  HealthScoreDomain,
  HealthScoreDomainId,
  HealthScoreFinding,
  HealthScoreGapCard,
  HealthScoreMethodCard,
  HealthScoreMover,
  HealthScorePageContent,
  HealthScorePillarContent,
  HealthScoreResult,
  HealthScoreSubtraction,
  PillarName
} from "@/lib/health-score/v4-types";
import {
  FINDINGS,
  GOAL_MAP,
  GOAL_PILLARS,
  PILLAR_ID,
  localizedEnergyCause,
  localizedFindingCopy,
  localizedGoalPhrase,
  localizedGoalTag,
  localizedList,
  localizedPillarDescription,
  localizedPillarGap,
  localizedPillarLabel,
  localizedPillarStrength,
  localizedSymptomName
} from "@/lib/health-score/v4-copy";

export type {
  HealthScoreAdvice,
  HealthScoreDomain,
  HealthScoreDomainId,
  HealthScoreFinding,
  HealthScoreGapCard,
  HealthScoreMethodCard,
  HealthScoreMover,
  HealthScorePageAiCard,
  HealthScorePageAiCopy,
  HealthScorePageContent,
  HealthScorePaywallFeature,
  HealthScorePillarContent,
  HealthScoreResult,
  HealthScoreSubtraction,
  HealthScoreSubtractionMode,
  LocalizedHealthScoreText,
  PillarName
} from "@/lib/health-score/v4-types";
export { HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS } from "@/lib/health-score/v4-copy";

export const DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT = 142;

type NormalizedAnswers = Readonly<{
  activity: string;
  age: string;
  alcohol: string;
  caffeine: string;
  country: string;
  diet: string;
  digestion: string;
  energy: string;
  fEggs: string;
  fFish: string;
  fFruitVeg: string;
  fLegumes: string;
  goals: string[];
  hrv: number;
  kidney: string;
  labB12: number;
  labFerritin: number;
  labHba1c: number;
  labHomo: number;
  labO3: number;
  labVitd: number;
  liver: string;
  medTypes: string[];
  protein: string;
  reproStatus: string;
  sex: "female" | "male";
  sleepHrs: string;
  smoking: string;
  stress: string;
  sun: string;
  sunscreen: string;
  symptoms: string[];
  vo2: number;
}>;

type PillarScore = Readonly<{
  earned: number;
  id: HealthScoreDomainId;
  max: number;
  name: PillarName;
  pct: number;
  rows: Array<readonly [string, number, number]>;
}>;

type EngineResult = Readonly<{
  adjustedWeights: Record<PillarName, number>;
  band: string;
  final: number;
  flagCodes: string[];
  matched: Set<PillarName>;
  multiplier: number;
  raw: number;
  selfReport: number;
  symptomCount: number;
  verification: number;
  pillars: PillarScore[];
}>;

const PERCENTILES: Record<number, number> = {
  30: 0,
  31: 0,
  32: 0,
  33: 0,
  34: 0,
  35: 0,
  36: 0,
  37: 0,
  38: 0,
  39: 0,
  40: 0,
  41: 1,
  42: 1,
  43: 1,
  44: 2,
  45: 2,
  46: 3,
  47: 4,
  48: 5,
  49: 7,
  50: 9,
  51: 11,
  52: 14,
  53: 17,
  54: 20,
  55: 24,
  56: 28,
  57: 33,
  58: 38,
  59: 43,
  60: 49,
  61: 54,
  62: 59,
  63: 64,
  64: 69,
  65: 73,
  66: 78,
  67: 82,
  68: 85,
  69: 88,
  70: 90,
  71: 93,
  72: 95,
  73: 96,
  74: 97,
  75: 98,
  76: 99,
  77: 99,
  78: 99,
  79: 100,
  80: 100,
  81: 100,
  82: 100,
  83: 100,
  84: 100,
  85: 100,
  86: 100,
  87: 100,
  88: 100,
  89: 100,
  90: 100,
  91: 100,
  92: 100
};

const VO2_GOOD: Record<string, number> = {
  "female:30s": 36,
  "female:40s": 32,
  "female:50s": 29,
  "female:60+": 26,
  "female:u30": 38,
  "male:30s": 42,
  "male:40s": 39,
  "male:50s": 35,
  "male:60+": 32,
  "male:u30": 45
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).filter((item) => item && item !== "none")
    : [];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function scoreScalePercent(score: number) {
  return round1(((score - 30) / 62) * 100);
}

function optionScore(value: string, scores: Record<string, number>, fallback: number) {
  return scores[value] ?? fallback;
}

function fmt(template: string, context: Record<string, string | number>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
    context[key] === undefined ? match : String(context[key])
  );
}

function titleCaseFirst(value: string) {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : value;
}

function healthScorePageId(path: string) {
  return `customer.healthScore.page.${path}` as MessageId;
}

function healthScorePageText(
  locale: Locale,
  path: string,
  values?: MessageValues
) {
  return t(locale, healthScorePageId(path), values);
}

const BAND_COPY_KEY: Record<string, string> = {
  "Building foundation": "buildingFoundation",
  Excellent: "excellent",
  "Good, with a clear gap": "goodClearGap",
  "Needs attention": "needsAttention",
  Strong: "strong",
  "Strong, with headroom": "strongHeadroom"
};

function bandCopyKey(band: string) {
  return BAND_COPY_KEY[band] ?? "fallback";
}

function ageBand(age: string) {
  return ({
    "18-25": "u30",
    "26-35": "30s",
    "36-45": "40s",
    "46-55": "50s",
    "56-65": "60+",
    "66+": "60+"
  }[age] ?? "40s");
}

function normalizeCountry(value: unknown) {
  const country = text(value);

  return ({
    ID: "Indonesia",
    MY: "Malaysia",
    PH: "Philippines",
    SG: "Singapore",
    TH: "Thailand",
    VN: "Vietnam"
  }[country] ?? country);
}

function normalizeLabValue(key: string, value: number, unit: string) {
  const normalizedUnit = unit.trim().toLowerCase();
  const normalizedKey = key.startsWith("lab_") ? key.slice(4) : key;

  if ((normalizedKey === "vitd" || normalizedKey === "vitaminD") && normalizedUnit === "nmol/l") {
    return value / 2.5;
  }

  if (normalizedKey === "b12" && normalizedUnit === "pmol/l") {
    return value / 0.738;
  }

  if (normalizedKey === "hba1c" && normalizedUnit === "mmol/mol") {
    return (value + 46.7) / 28.7;
  }

  if ((normalizedKey === "homo" || normalizedKey === "homocysteine") && normalizedUnit === "mg/l") {
    return value * 7.398;
  }

  return value;
}

function labNumber(
  labs: Record<string, unknown>,
  labUnits: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const raw = labs[key];
    const record = asRecord(raw);
    const value = Object.keys(record).length > 0 ? record.value : raw;
    const parsed = numberValue(value);
    const unit = text(labUnits[key]) || text(record.unit);

    if (parsed !== null) {
      return normalizeLabValue(key, parsed, unit);
    }
  }

  return 0;
}

function normalizeAnswers(answersInput: unknown): NormalizedAnswers {
  const answers = asRecord(answersInput);
  const labs = { ...answers, ...asRecord(answers.labs) };
  const labUnits = asRecord(answers.labUnits);
  const foodFrequency = asRecord(answers.foodFrequency);
  const sex = text(answers.sex) === "female" ? "female" : "male";

  return {
    activity: text(answers.activity) || "moderate",
    age: text(answers.age) || "36-45",
    alcohol: text(answers.alcohol) || "1-3",
    caffeine: text(answers.caffeine) || "2-3",
    country: normalizeCountry(answers.country) || "Thailand",
    diet: text(answers.diet) || "balanced",
    digestion: text(answers.digestion) || "none",
    energy: text(answers.energy) || "ok",
    fEggs: text(answers.f_eggs) || text(foodFrequency.eggs) || "1-2",
    fFish: text(answers.f_fish) || text(answers.fish) || text(foodFrequency.fish) || "rare",
    fFruitVeg:
      text(answers.f_fruitveg) || text(foodFrequency.fruitveg) || "1-2",
    fLegumes: text(answers.f_legumes) || text(foodFrequency.legumes) || "1-2",
    goals: arrayValue(answers.goals).slice(0, 3),
    hrv: numberValue(answers.hrv) ?? numberValue(labs.hrv) ?? 0,
    kidney: text(answers.kidney) || "normal",
    labB12: labNumber(labs, labUnits, "b12", "lab_b12"),
    labFerritin: labNumber(labs, labUnits, "ferritin", "lab_ferritin"),
    labHba1c: labNumber(labs, labUnits, "hba1c", "lab_hba1c"),
    labHomo: labNumber(labs, labUnits, "homo", "homocysteine", "lab_homo"),
    labO3: labNumber(labs, labUnits, "o3", "omega3", "lab_o3"),
    labVitd: labNumber(labs, labUnits, "vitd", "vitaminD", "lab_vitd"),
    liver: text(answers.liver) || "normal",
    medTypes: arrayValue(answers.medTypes),
    protein: text(answers.protein),
    reproStatus: text(answers.reproStatus) || "none",
    sex,
    sleepHrs: text(answers.sleepHrs) || "7-8",
    smoking: text(answers.smoking) || "never",
    stress: text(answers.stress) || "moderate",
    sun: text(answers.sun) || "15-30",
    sunscreen: text(answers.sunscreen) || "sometimes",
    symptoms: arrayValue(answers.symptoms),
    vo2: numberValue(answers.vo2) ?? numberValue(labs.vo2) ?? 0
  };
}

function pillarSleep(a: NormalizedAnswers): PillarScore {
  const rows: Array<readonly [string, number, number]> = [];
  const duration = optionScore(
    a.sleepHrs,
    { "5-6": 5, "6-7": 8, "7-8": 9, "8-9": 8, "9+": 7, u5: 2 },
    5
  );
  rows.push(["Sleep duration", duration, 9]);
  const energy = optionScore(
    a.energy,
    { drained: 0, excellent: 6, good: 5, low: 2, ok: 4 },
    4
  );
  rows.push(["Daytime energy (recovery proxy)", energy, 6]);

  return {
    earned: rows.reduce((sum, row) => sum + row[1], 0),
    id: "sleep",
    max: 15,
    name: "Sleep & Recovery",
    pct: rows.reduce((sum, row) => sum + row[1], 0) / 15,
    rows
  };
}

function pillarActivity(a: NormalizedAnswers): PillarScore {
  const earned = optionScore(
    a.activity,
    { active: 12, athlete: 14, light: 6, moderate: 9, sitting: 2 },
    6
  );

  return {
    earned,
    id: "activity",
    max: 14,
    name: "Activity & Fitness",
    pct: earned / 14,
    rows: [["Activity level", earned, 14]]
  };
}

function pillarNutrition(a: NormalizedAnswers): PillarScore {
  const rows: Array<readonly [string, number, number]> = [];
  const diet = optionScore(
    a.diet,
    {
      balanced: 6,
      carnivore: 4,
      mediterranean: 8,
      plant: 7,
      processed: 2,
      vegan: 6,
      whole: 8
    },
    5
  );
  rows.push(["Diet pattern", diet, 8]);
  rows.push([
    "Oily fish frequency",
    optionScore(a.fFish, { never: 1, often: 5, once: 4, rare: 3 }, 3),
    5
  ]);
  rows.push([
    "Fruit & vegetables",
    optionScore(
      a.fFruitVeg,
      { "1-2": 2, "3+": 3, most: 3, never: 0, notdaily: 1, rare: 1, weekly: 2 },
      2
    ),
    3
  ]);
  const legumes = optionScore(
    a.fLegumes,
    { "1-2": 1, "3+": 1, most: 1, weekly: 1 },
    0
  );
  const eggs = optionScore(a.fEggs, { "3+": 1, most: 1 }, 0);
  rows.push(["Legumes / eggs variety", Math.min(legumes + eggs, 2), 2]);

  const earned = rows.reduce((sum, row) => sum + row[1], 0);

  return {
    earned,
    id: "nutrition",
    max: 18,
    name: "Nutrition & Diet",
    pct: earned / 18,
    rows
  };
}

function pillarStress(a: NormalizedAnswers): PillarScore {
  const earned = optionScore(
    a.stress,
    { extreme: 2, high: 5, low: 11, moderate: 9, verylow: 13 },
    9
  );

  return {
    earned,
    id: "stress",
    max: 13,
    name: "Stress & Balance",
    pct: earned / 13,
    rows: [["Stress level", earned, 13]]
  };
}

function pillarHabits(a: NormalizedAnswers): PillarScore {
  const rows: Array<readonly [string, number, number]> = [];
  rows.push([
    "Smoking status",
    optionScore(
      a.smoking,
      { daily: 0, "ex5+": 6, ex5: 5, never: 7, occasional: 3 },
      5
    ),
    7
  ]);
  rows.push([
    "Alcohol / week",
    optionScore(a.alcohol, { "1-3": 3, "4-7": 2, "8+": 0, none: 3 }, 2),
    3
  ]);
  rows.push([
    "Caffeine load",
    optionScore(a.caffeine, { "1": 2, "2-3": 2, "4+": 1, none: 2 }, 2),
    2
  ]);
  const sunOk = (a.sun === "30-60" || a.sun === "60+") && a.sunscreen !== "daily";
  rows.push(["Sun-exposure behaviour", sunOk ? 2 : 1, 2]);
  rows.push(["Digestive comfort", a.digestion === "none" ? 1 : 0.5, 1]);

  const earned = rows.reduce((sum, row) => sum + row[1], 0);

  return {
    earned,
    id: "habits",
    max: 15,
    name: "Health Habits",
    pct: earned / 15,
    rows
  };
}

function labPoints(
  rows: Array<readonly [string, number, number]>,
  name: string,
  value: number,
  full: number,
  optLo: number,
  optHi?: number,
  goodLo?: number
) {
  if (!value) {
    rows.push([`${name} (not provided)`, 0, full]);
    return 0;
  }

  const ok = optHi === undefined ? value <= optLo : value >= optLo && value <= optHi;
  const points = ok
    ? full
    : goodLo !== undefined && value >= goodLo
      ? round1(full * 0.35)
      : round1(full * 0.25);

  rows.push([`${name} (measured)`, points, full]);
  return points;
}

function verification(a: NormalizedAnswers) {
  const rows: Array<readonly [string, number, number]> = [];
  let total = 0;

  total += labPoints(rows, "Vitamin D", a.labVitd, 4, 50, 80, 30);
  total += labPoints(rows, "Vitamin B12", a.labB12, 2, 400, 900, 300);
  total += labPoints(rows, "Ferritin", a.labFerritin, 2, 50, 150, 30);
  total += labPoints(rows, "HbA1c", a.labHba1c, 4, 5.4, undefined, 5.7);
  total += labPoints(rows, "Omega-3 Index", a.labO3, 3, 8, 12, 5);
  total += labPoints(rows, "Homocysteine", a.labHomo, 2, 8, undefined, 12);

  if (a.vo2) {
    const good = VO2_GOOD[`${a.sex}:${ageBand(a.age)}`] ?? 39;
    const points = a.vo2 >= good ? 5 : a.vo2 >= good * 0.88 ? 3 : 1.5;
    rows.push(["VO2max (measured)", points, 5]);
    total += points;
  } else {
    rows.push(["VO2max (not provided)", 0, 5]);
  }

  if (a.hrv) {
    const points = a.hrv >= 70 ? 2 : a.hrv >= 50 ? 1 : 0.5;
    rows.push(["HRV (measured)", points, 2]);
    total += points;
  } else {
    rows.push(["HRV (not provided)", 0, 2]);
  }

  const protein = optionScore(a.protein, { "1-1.5": 1.5, "1.5-2": 3, "2+": 3 }, 0);
  rows.push([a.protein ? "Protein adequacy" : "Protein (not provided)", protein, 3]);
  total += protein;

  return { earned: round1(total), max: 25, rows };
}

function symptomMultiplier(a: NormalizedAnswers) {
  const symptoms = a.symptoms.filter((symptom) => symptom !== "great");

  if (a.symptoms.includes("great") && symptoms.length < 1) {
    return { count: 0, multiplier: 1 };
  }

  if (symptoms.length <= 0) return { count: 0, multiplier: 1 };
  if (symptoms.length <= 2) return { count: symptoms.length, multiplier: 0.95 };
  if (symptoms.length <= 4) return { count: symptoms.length, multiplier: 0.88 };

  return { count: symptoms.length, multiplier: 0.82 };
}

function safetyFlagCodes(a: NormalizedAnswers) {
  const codes: string[] = [];
  const lowEnergy = a.energy === "low" || a.energy === "drained" || a.symptoms.includes("fatigue");

  if (a.medTypes.includes("statin") && lowEnergy) codes.push("STATIN_COQ10");
  if (a.medTypes.includes("ppi")) codes.push("PPI_B12_MAG");
  if (a.medTypes.includes("metformin")) codes.push("METFORMIN_B12");
  if (a.medTypes.includes("diuretic")) codes.push("DIURETIC_MIN");
  if (a.medTypes.includes("bloodthinner")) codes.push("BLOODTHINNER");
  if ((a.diet === "vegan" || a.diet === "plant") && (a.fFish === "never" || a.fFish === "rare")) {
    codes.push("PLANT_OMEGA_B12");
  }

  if (
    a.sunscreen === "daily" &&
    (a.sun === "u15" || a.sun === "15-30") &&
    ["Indonesia", "Malaysia", "Philippines", "Singapore", "Thailand", "Vietnam"].includes(a.country)
  ) {
    codes.push("VITD_ROUTINE");
  }

  if (a.kidney === "reduced" || a.kidney === "disease") codes.push("KIDNEY_CEILING");
  if (a.liver === "condition") codes.push("LIVER_ROUTING");
  if (a.reproStatus === "pregnant" || a.reproStatus === "breastfeeding") codes.push("PREGNANCY");

  return codes;
}

function scoreEngine(a: NormalizedAnswers): EngineResult {
  const pillars = [
    pillarSleep(a),
    pillarActivity(a),
    pillarNutrition(a),
    pillarStress(a),
    pillarHabits(a)
  ];
  const base = Object.fromEntries(pillars.map((pillar) => [pillar.name, pillar.max])) as Record<PillarName, number>;
  const baseTotal = Object.values(base).reduce((sum, value) => sum + value, 0);
  const weights = Object.fromEntries(
    (Object.keys(base) as PillarName[]).map((name) => [name, base[name] / baseTotal])
  ) as Record<PillarName, number>;
  const matched = new Set<PillarName>();

  for (const goal of a.goals.slice(0, 3)) {
    for (const pillar of GOAL_MAP[goal] ?? []) {
      matched.add(pillar);
    }
  }

  const adjustedRaw = Object.fromEntries(
    (Object.keys(weights) as PillarName[]).map((name) => [
      name,
      matched.has(name) ? weights[name] * 1.3 : weights[name]
    ])
  ) as Record<PillarName, number>;
  const adjustedTotal = Object.values(adjustedRaw).reduce((sum, value) => sum + value, 0);
  const adjustedWeights = Object.fromEntries(
    (Object.keys(adjustedRaw) as PillarName[]).map((name) => [
      name,
      adjustedRaw[name] / adjustedTotal
    ])
  ) as Record<PillarName, number>;
  const weightedPct = pillars.reduce(
    (sum, pillar) => sum + adjustedWeights[pillar.name] * pillar.pct,
    0
  );
  const selfReport = weightedPct * 86;
  const verificationEarned = round1((verification(a).earned * 18) / 25);
  const raw = selfReport + verificationEarned;
  const symptoms = symptomMultiplier(a);
  const final = Math.round(clamp(raw * symptoms.multiplier, 30, 92));
  const band =
    final >= 82
      ? "Excellent"
      : final >= 70
        ? "Strong, with headroom"
        : final >= 58
          ? "Good, with a clear gap"
          : final >= 46
            ? "Building foundation"
            : "Needs attention";

  return {
    adjustedWeights,
    band,
    final,
    flagCodes: safetyFlagCodes(a),
    matched,
    multiplier: symptoms.multiplier,
    raw: round1(raw),
    selfReport: round1(selfReport),
    symptomCount: symptoms.count,
    verification: verificationEarned,
    pillars
  };
}

function pillarLabel(name: PillarName, locale: Locale) {
  return localizedPillarLabel(name, locale);
}

function buildPillars(result: EngineResult, goals: readonly string[], locale: Locale) {
  const rows = result.pillars.map((pillar) => {
      const linkedGoals = goals.filter((goal) =>
        GOAL_PILLARS[pillar.name].includes(goal)
      );
      const tag =
        linkedGoals.length >= 3
          ? healthScorePageText(locale, "allGoalsTag")
          : linkedGoals.length > 0
            ? linkedGoals.map((goal) => localizedGoalTag(goal, locale)).join(" / ")
            : null;

      return {
        fillClass: Math.round(pillar.pct * 100) >= 50 ? "hi" as const : "lo" as const,
        goalLinked: linkedGoals.length > 0,
        id: PILLAR_ID[pillar.name],
        isHero: false,
        label: pillarLabel(pillar.name, locale),
        name: pillar.name,
        tag,
        value: Math.round(pillar.pct * 100)
      };
    });
  const hero = rows
    .filter((pillar) => pillar.goalLinked)
    .slice()
    .sort((first, second) => first.value - second.value)[0];

  return rows
    .map((pillar) => ({
      ...pillar,
      isHero: Boolean(hero && pillar.name === hero.name)
    }))
    .sort((first, second) => second.value - first.value);
}

function buildFindings(
  answers: NormalizedAnswers,
  result: EngineResult,
  locale: Locale
) {
  const pool: Array<readonly [number, string, HealthScoreFinding]> = [];
  const symptoms = answers.symptoms.filter((symptom) => symptom !== "great");

  for (const code of result.flagCodes) {
    const finding = localizedFindingCopy(code, locale);

    if (finding) {
      pool.push([
        finding.tier,
        code,
        {
          body: finding.body,
          code,
          headline: finding.headline,
          icon: finding.icon
        }
      ]);
    }
  }

  const lowEnergy =
    answers.energy === "low" ||
    answers.energy === "drained" ||
    symptoms.includes("fatigue");

  if (answers.goals.includes("energy") && lowEnergy) {
    const causes = [
      answers.stress === "high" || answers.stress === "extreme" ? "stress" : "",
      answers.sleepHrs === "u5" || answers.sleepHrs === "5-6" ? "sleep" : "",
      answers.activity === "sitting" || answers.activity === "light" ? "activity" : ""
    ].filter(Boolean);

    if (causes.length > 0) {
      const finding = localizedFindingCopy("ENERGY_UPSTREAM", locale);

      if (finding) {
        pool.push([
          finding.tier,
          "ENERGY_UPSTREAM",
          {
            body: fmt(finding.body, {
              energy_causes: localizedList(
                causes.map((cause) => localizedEnergyCause(cause, locale)),
                locale
              )
            }),
            code: "ENERGY_UPSTREAM",
            headline: finding.headline,
            icon: finding.icon
          }
        ]);
      }
    }
  }

  if (answers.goals.includes("sleep") && ["u5", "5-6", "6-7"].includes(answers.sleepHrs)) {
    const finding = localizedFindingCopy("SLEEP_UPSTREAM", locale);

    if (finding) {
      pool.push([
        finding.tier,
        "SLEEP_UPSTREAM",
        {
          body: finding.body,
          code: "SLEEP_UPSTREAM",
          headline: finding.headline,
          icon: finding.icon
        }
      ]);
    }
  }

  if (answers.goals.includes("weight")) {
    const finding = localizedFindingCopy("WEIGHT_PATTERN", locale);

    if (finding) {
      pool.push([
        finding.tier,
        "WEIGHT_PATTERN",
        {
          body: finding.body,
          code: "WEIGHT_PATTERN",
          headline: finding.headline,
          icon: finding.icon
        }
      ]);
    }
  }

  const unique: Array<readonly [number, string, HealthScoreFinding]> = [];
  const seen = new Set<string>();

  for (const item of pool.sort((first, second) => first[0] - second[0])) {
    if (!seen.has(item[1])) {
      unique.push(item);
      seen.add(item[1]);
    }
  }

  let chosen = unique.slice(0, 3);
  const tierOne = result.flagCodes.filter((code) => FINDINGS[code]?.tier === 1);

  if (tierOne.length > 0 && !tierOne.includes(chosen[0]?.[1] ?? "")) {
    const lead = tierOne[0];
    const leadFinding = localizedFindingCopy(lead, locale);
    if (!leadFinding) {
      return chosen.map((item) => item[2]);
    }
    chosen = [
      [
        1,
        lead,
        {
          body: leadFinding.body,
          code: lead,
          headline: leadFinding.headline,
          icon: leadFinding.icon
        }
      ],
      ...chosen.filter((item) => item[1] !== lead).slice(0, 2)
    ];
  }

  return chosen.map((item) => item[2]);
}

function buildStrengthFindings(
  pillars: Array<HealthScorePillarContent & { name: PillarName }>,
  locale: Locale
) {
  return pillars
    .slice()
    .sort((first, second) => second.value - first.value)
    .slice(0, 2)
    .map((pillar) => ({
        body: localizedPillarStrength(pillar.name, locale, {
          value: pillar.value
        }),
        code: `STRENGTH_${pillar.id.toUpperCase()}`,
        headline: healthScorePageText(locale, "strengthHeadline", {
          pillar: pillar.label
        }),
      icon: "check"
    }));
}

function highestLeverage(
  pillars: Array<HealthScorePillarContent & { name: PillarName }>,
  goals: readonly string[],
  locale: Locale
) {
  const candidates = pillars.filter((pillar) => pillar.goalLinked);

  if (candidates.length < 1) return null;

  const hero = candidates.slice().sort((first, second) => first.value - second.value)[0];

  if (hero.value >= 70) return null;

  const goalList = localizedList(
    goals.slice(0, 3).map((goal) => localizedGoalPhrase(goal, locale)),
    locale
  );

  return {
    pillar: hero.label,
    text: healthScorePageText(locale, "highestLeverage.text", {
      goalList,
      pillar: hero.label,
      value: hero.value
    }),
    value: hero.value
  };
}

function strengthNote(
  pillars: Array<HealthScorePillarContent & { name: PillarName }>,
  locale: Locale
) {
  const nonGoalStrength = pillars.find((pillar) => pillar.value >= 80 && !pillar.goalLinked);
  const top = nonGoalStrength ?? pillars.find((pillar) => pillar.value >= 80);

  return top
    ? localizedPillarStrength(top.name, locale, { value: top.value })
    : null;
}

function gapPillarCard(
  pillar: HealthScorePillarContent & { name: PillarName },
  number: string,
  locale: Locale
): HealthScoreGapCard {
  const copy = localizedPillarGap(pillar.name, locale);

  return {
    body: copy.body,
    headline: copy.headline,
    tag: healthScorePageText(locale, "gap.tag", {
      number,
      pillarLabel: locale === "en" ? pillar.label.toUpperCase() : pillar.label
    }),
    value: `${pillar.value}%`
  };
}

function buildGapTrio(
  pillars: Array<HealthScorePillarContent & { name: PillarName }>,
  answers: NormalizedAnswers,
  locale: Locale
) {
  const weak = pillars.slice().sort((first, second) => first.value - second.value);
  const cards: HealthScoreGapCard[] = [gapPillarCard(weak[0], "01", locale)];
  const linkedLow = weak.filter((pillar) => pillar.goalLinked);
  const second =
    linkedLow.find((pillar) => pillar.name !== weak[0].name) ?? weak[1];
  cards.push(gapPillarCard(second, "02", locale));

  const symptoms = answers.symptoms.filter((symptom) => symptom !== "great");

  if (symptoms.length >= 2) {
    const names = localizedList(
      symptoms.slice(0, 3).map((symptom) => localizedSymptomName(symptom, locale)),
      locale
    );
    const symptomsText = locale === "en" ? titleCaseFirst(names) : names;
    cards.push({
      body: healthScorePageText(locale, "gap.symptom.body", {
        symptoms: symptomsText
      }),
      headline: healthScorePageText(locale, "gap.symptom.headline"),
      tag: healthScorePageText(locale, "gap.symptom.tag"),
      value: String(symptoms.length)
    });
  } else {
    const used = new Set([weak[0].name, second.name]);
    cards.push(gapPillarCard(
      weak.find((pillar) => !used.has(pillar.name)) ?? weak[weak.length - 1],
      "03",
      locale
    ));
  }

  return cards;
}

function relativity(score: number, percentile: number, median: number, locale: Locale) {
  const spectrumYouPct = scoreScalePercent(score);
  const spectrumMedianPct = scoreScalePercent(median);
  const spectrumGapLeftPct = Math.min(spectrumYouPct, spectrumMedianPct);
  const spectrumGapWidthPct = round1(Math.abs(spectrumYouPct - spectrumMedianPct));

  if (score >= median) {
    return {
      headline: healthScorePageText(locale, "relativity.rank.headline", {
        percentile
      }),
      legendCaptions: [
        healthScorePageText(locale, "relativity.rank.legend.0"),
        healthScorePageText(locale, "relativity.rank.legend.1"),
        healthScorePageText(locale, "relativity.rank.legend.2")
      ] as const,
      mode: "rank" as const,
      spectrumGapLeftPct,
      spectrumGapWidthPct,
      spectrumMedian: median,
      spectrumMedianPct,
      spectrumYou: score,
      spectrumYouPct,
      sub: healthScorePageText(locale, "relativity.rank.sub")
    };
  }

  const gap = median - score;

  return {
    gap,
    headline: healthScorePageText(locale, "relativity.gap.headline", {
      gap,
      median
    }),
    legendCaptions: [
      healthScorePageText(locale, "relativity.gap.legend.0"),
      healthScorePageText(locale, "relativity.gap.legend.1"),
      healthScorePageText(locale, "relativity.gap.legend.2")
    ] as const,
    mode: "gap" as const,
    spectrumGapLeftPct,
    spectrumGapWidthPct,
    spectrumMedian: median,
    spectrumMedianPct,
    spectrumYou: score,
    spectrumYouPct,
    sub: healthScorePageText(locale, "relativity.gap.sub", { gap })
  };
}

function bandLine(score: number, band: string, locale: Locale) {
  return healthScorePageText(locale, `bandLine.${bandCopyKey(band)}`, {
    score
  });
}

function methodCards(
  goals: readonly string[],
  findings: readonly HealthScoreFinding[],
  locale: Locale
) {
  const goalList =
    localizedList(
      goals.slice(0, 3).map((goal) => localizedGoalPhrase(goal, locale)),
      locale
    ) ||
    healthScorePageText(locale, "method.goalFallback");
  const formattedGoalList = locale === "en" ? titleCaseFirst(goalList) : goalList;
  const safetyFinding = findings.find((finding) =>
    ["BLOODTHINNER", "KIDNEY_CEILING", "LIVER_ROUTING", "PPI_B12_MAG", "PREGNANCY", "STATIN_COQ10"].includes(finding.code)
  );

  return [
    {
      body: healthScorePageText(locale, "method.card1.body", {
        goalList: formattedGoalList
      }),
      title: healthScorePageText(locale, "method.card1.title"),
      number: 1
    },
    {
      body: healthScorePageText(locale, "method.card2.body"),
      title: healthScorePageText(locale, "method.card2.title"),
      number: 2
    },
    {
      body: safetyFinding
        ? healthScorePageText(locale, "method.card3.body.withFinding", {
          findingHeadline: safetyFinding.headline.replace(/[。.]$/, "")
        })
        : healthScorePageText(locale, "method.card3.body.default"),
      title: healthScorePageText(locale, "method.card3.title"),
      number: 3
    }
  ] satisfies HealthScoreMethodCard[];
}

function subtractionCopy(
  subtraction: HealthScoreSubtraction,
  goals: readonly string[],
  flags: readonly string[],
  locale: Locale
) {
  const goalList =
    localizedList(
      goals.slice(0, 3).map((goal) => localizedGoalPhrase(goal, locale)),
      locale
    ) ||
    healthScorePageText(locale, "subtraction.goalFallback");
  const constraint = flags.includes("STATIN_COQ10")
    ? healthScorePageText(locale, "subtraction.constraint.statin")
    : flags.length > 0
      ? healthScorePageText(locale, "subtraction.constraint.safety")
      : healthScorePageText(locale, "subtraction.constraint.context");

  return {
    body: healthScorePageText(locale, "subtraction.body", {
      constraint,
      goalList
    }),
    labelChosen: healthScorePageText(locale, "subtraction.labelChosen"),
    labelEvaluated: healthScorePageText(locale, "subtraction.labelEvaluated"),
    labelSetAside: healthScorePageText(locale, "subtraction.labelSetAside")
  };
}

function findingsHeadline(count: number, locale: Locale) {
  return healthScorePageText(locale, "findingsHeadline", { count });
}

function bandPillLabel(band: string, locale: Locale) {
  return healthScorePageText(locale, `bandPill.${bandCopyKey(band)}`);
}

function opportunityPill(band: string, percentile: number, locale: Locale) {
  if (percentile >= 80 || band === "Excellent" || band === "Strong, with headroom") {
    return healthScorePageText(locale, "opportunity.topTier");
  }

  if (band === "Good, with a clear gap") {
    return healthScorePageText(locale, "opportunity.refinement");
  }

  return healthScorePageText(locale, "opportunity.high");
}

function healthScoreSelectedNutrientCount(answers: NormalizedAnswers) {
  let count = 6;

  if (answers.goals.length >= 3) {
    count += 1;
  }

  if (answers.symptoms.filter((symptom) => symptom !== "great").length >= 2) {
    count += 1;
  }

  const labSignalCount = [
    answers.labB12,
    answers.labFerritin,
    answers.labHba1c,
    answers.labHomo,
    answers.labO3,
    answers.labVitd
  ].filter((value) => value > 0).length;

  if (labSignalCount >= 3) {
    count += 1;
  }

  if (answers.hrv > 0 || answers.vo2 > 0) {
    count += 1;
  }

  const foodGapCount = [answers.fFish, answers.fFruitVeg].filter((value) =>
    ["never", "rare", "1-2"].includes(value)
  ).length;

  if (foodGapCount >= 1) {
    count += 1;
  }

  const safetySignals = [
    answers.medTypes.length > 0,
    answers.kidney !== "normal",
    answers.liver !== "normal",
    answers.reproStatus !== "none"
  ].filter(Boolean).length;

  if (safetySignals > 0) {
    count += 1;
  }

  const lifestyleSignals = [
    ["sitting", "light"].includes(answers.activity),
    ["low", "ok"].includes(answers.energy),
    ["moderate", "high"].includes(answers.stress),
    answers.digestion !== "none",
    ["4-7", "8+"].includes(answers.alcohol),
    answers.smoking !== "never"
  ].filter(Boolean).length;

  if (lifestyleSignals >= 2) {
    count += 1;
  }

  return Math.max(6, Math.min(12, count));
}

function buildPageContent({
  answers,
  chosenNutrients,
  engine,
  evaluatedIngredientCount,
  locale,
  subtraction
}: Readonly<{
  answers: NormalizedAnswers;
  chosenNutrients?: number;
  engine: EngineResult;
  evaluatedIngredientCount?: number;
  locale: Locale;
  subtraction?: HealthScoreSubtraction;
}>): HealthScorePageContent {
  const median = 60;
  const rawPercentile = PERCENTILES[engine.final] ?? (engine.final >= 79 ? 100 : 0);
  const percentile = Math.max(1, Math.min(96, rawPercentile));
  const pillarsWithNames = buildPillars(engine, answers.goals, locale);
  const findings = buildFindings(answers, engine, locale);
  const selectedFindings = findings.length > 0
    ? findings
    : buildStrengthFindings(pillarsWithNames, locale);
  const selectedNutrients =
    chosenNutrients ?? healthScoreSelectedNutrientCount(answers);
  const evaluatedNutrients = Math.max(
    selectedNutrients,
    Number.isFinite(evaluatedIngredientCount)
      ? Math.round(Number(evaluatedIngredientCount))
      : DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT
  );
  const selectedSubtraction =
    subtraction ?? {
      chosen: selectedNutrients,
      evaluated: evaluatedNutrients,
      mode: "nutrients" as const,
      setAside: Math.max(0, evaluatedNutrients - selectedNutrients)
    };
  const subtractionText = subtractionCopy(
    selectedSubtraction,
    answers.goals,
    engine.flagCodes,
    locale
  );
  const relative = relativity(engine.final, percentile, median, locale);
  const highlightedGoals = answers.goals.map(
    (goal) => `<em>${localizedGoalPhrase(goal, locale)}</em>`
  );

  return {
    copySeeds: {
      bandLine: bandLine(engine.final, engine.band, locale),
      bandPill: bandPillLabel(engine.band, locale),
      findings: selectedFindings,
      findingsHeadline: findings.length > 0
        ? findingsHeadline(selectedFindings.length, locale)
        : healthScorePageText(locale, "findingsFallbackHeadline"),
      findingsMode: findings.length > 0 ? "caught" : "strengths",
      findingsSub: findings.length > 0
        ? healthScorePageText(locale, "findingsSub.caught")
        : healthScorePageText(locale, "findingsSub.strengths"),
      gapTrio: buildGapTrio(pillarsWithNames, answers, locale),
      goalMirror:
        answers.goals.length > 0
          ? healthScorePageText(locale, "goalMirror.withGoals", {
            goals: localizedList(highlightedGoals, locale)
          })
          : healthScorePageText(locale, "goalMirror.default"),
      heroBody: healthScorePageText(locale, "heroBody"),
      highestLeverage: highestLeverage(pillarsWithNames, answers.goals, locale),
      methodCards: methodCards(answers.goals, selectedFindings, locale),
      methodHeadline: healthScorePageText(locale, "methodHeadline"),
      opportunityPill: opportunityPill(engine.band, percentile, locale),
      pillarHeadline: healthScorePageText(
        locale,
        engine.final >= median
          ? "pillarHeadline.refinement"
          : "pillarHeadline.start"
      ),
      relativity: relative,
      strengthNote: strengthNote(pillarsWithNames, locale),
      subtraction: {
        ...selectedSubtraction,
        ...subtractionText
      }
    },
    locked: {
      band: engine.band,
      flagCodes: engine.flagCodes,
      median,
      nutrientsChosen: selectedSubtraction.chosen,
      nutrientsEvaluated: selectedSubtraction.evaluated,
      percentile,
      pillars: pillarsWithNames.map(({ fillClass, goalLinked, id, isHero, label, tag, value }) => ({
        fillClass,
        goalLinked,
        id,
        isHero,
        label,
        tag,
        value
      })),
      score: engine.final,
      subtraction: selectedSubtraction
    },
    meta: {
      engineScore: engine.final,
      findingCount: selectedFindings.length,
      relativityMode: relative.mode,
      subtractionKey:
        `${selectedSubtraction.mode}:${selectedSubtraction.evaluated}:${selectedSubtraction.setAside}:${selectedSubtraction.chosen}`
    }
  };
}

function summaryForScore(score: number, lowest: HealthScoreDomain, locale: Locale) {
  return healthScorePageText(locale, "summary", {
    lowestLabel: locale === "en" ? lowest.label.toLowerCase() : lowest.label
  });
}

function headlineForScore(score: number, locale: Locale) {
  if (score >= 82) return healthScorePageText(locale, "headline.excellent");
  if (score >= 70) return healthScorePageText(locale, "headline.strong");
  if (score >= 58) return healthScorePageText(locale, "headline.good");
  if (score >= 46) return healthScorePageText(locale, "headline.building");

  return healthScorePageText(locale, "headline.needs");
}

function buildDomains(result: EngineResult, locale: Locale): HealthScoreDomain[] {
  return result.pillars.map((pillar) => ({
    description: localizedPillarDescription(pillar.name, locale),
    id: pillar.id,
    label: pillarLabel(pillar.name, locale),
    score: Math.round(pillar.pct * 100)
  }));
}

function buildMovers(domains: readonly HealthScoreDomain[], locale: Locale): HealthScoreMover[] {
  return domains
    .slice()
    .sort((first, second) => first.score - second.score)
    .slice(0, 3)
    .map((domain) => ({
      impact: healthScorePageText(locale, "mover.impact"),
      label: healthScorePageText(locale, "mover.label", {
        domainLabel: locale === "en" ? domain.label.toLowerCase() : domain.label
      })
    }));
}

export function computeHealthScore(
  answersInput: unknown,
  locale: Locale = "en",
  options: Readonly<{
    evaluatedIngredientCount?: number;
  }> = {}
): HealthScoreResult {
  const answers = normalizeAnswers(answersInput);
  const engine = scoreEngine(answers);
  const domains = buildDomains(engine, locale);
  const lowest = domains.slice().sort((first, second) => first.score - second.score)[0];

  return {
    band: engine.band,
    domains,
    flagCodes: engine.flagCodes,
    headline: headlineForScore(engine.final, locale),
    movers: buildMovers(domains, locale),
    pageContent: buildPageContent({
      answers,
      engine,
      evaluatedIngredientCount: options.evaluatedIngredientCount,
      locale
    }),
    raw: engine.raw,
    score: engine.final,
    selfReport: engine.selfReport,
    summary: summaryForScore(engine.final, lowest, locale),
    symptomMultiplier: engine.multiplier,
    verification: engine.verification,
    version: "healthscore:v4"
  };
}
