import type { Locale } from "@/lib/i18n";

export type HealthScoreDomain = Readonly<{
  description: string;
  id: "activity" | "biomarkers" | "habits" | "nutrition" | "sleep" | "stress";
  label: string;
  score: number;
}>;

export type HealthScoreMover = Readonly<{
  impact: string;
  label: string;
}>;

export type LocalizedHealthScoreText =
  | string
  | Readonly<{
      en: string;
      th: string;
    }>;

export type HealthScorePaywallFeature = Readonly<{
  description: LocalizedHealthScoreText;
  name: LocalizedHealthScoreText;
}>;

export type HealthScoreAdvice = Readonly<{
  paywallEyebrow?: LocalizedHealthScoreText;
  paywallFeatures?: HealthScorePaywallFeature[];
  paywallSubtitle?: LocalizedHealthScoreText;
  paywallTitle?: LocalizedHealthScoreText;
  overview: LocalizedHealthScoreText;
  focusArea?: LocalizedHealthScoreText;
  howToImprove?: LocalizedHealthScoreText;
}>;

export type HealthScoreResult = Readonly<{
  advice?: HealthScoreAdvice;
  band: string;
  domains: HealthScoreDomain[];
  headline: string;
  movers: HealthScoreMover[];
  score: number;
  summary: string;
}>;

type DomainId = HealthScoreDomain["id"];

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
  return Array.isArray(value) ? value.map(String) : [];
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampRaw(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function optionScore(value: unknown, scores: Record<string, number>, fallback: number) {
  return scores[text(value)] ?? fallback;
}

function ageYears(value: unknown) {
  const direct = numberValue(value);

  if (direct) {
    return direct;
  }

  return optionScore(
    value,
    {
      "18-25": 22,
      "26-35": 31,
      "36-45": 41,
      "46-55": 51,
      "56-65": 61,
      "66+": 66
    },
    35
  );
}

function sleepHoursValue(value: unknown) {
  const direct = numberValue(value);

  if (direct !== null) {
    return direct;
  }

  const mapped = {
    "4-5": 4.5,
    "5-6": 5.5,
    "6-7": 6.5,
    "7-8": 7.5,
    "8+": 8.5,
    "8-9": 8.5,
    "9+": 9.5,
    "9-plus": 9.5,
    u5: 4.5,
    "under-5": 4.5
  }[text(value)];

  return mapped ?? null;
}

function sunValue(value: unknown) {
  const sun = text(value);

  if (sun === "minimal") {
    return "min";
  }

  if (sun === "u15") {
    return "min";
  }

  if (sun === "15-30") {
    return "low";
  }

  if (sun === "30-60") {
    return "mod";
  }

  if (sun === "60+") {
    return "high";
  }

  if (sun === "moderate") {
    return "mod";
  }

  return sun;
}

function dietValue(value: unknown) {
  const diet = text(value);

  if (diet === "mediterranean") {
    return "med";
  }

  if (diet === "processed") {
    return "western";
  }

  if (diet === "carnivore") {
    return "keto";
  }

  return diet;
}

function labNumber(
  labs: Record<string, unknown>,
  labUnits: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const raw = labs[key];
    const value = isLabValueRecord(raw) ? raw.value : raw;
    const parsed = numberValue(value);
    const embeddedUnit = isLabValueRecord(raw) ? text(raw.unit) : "";
    const unit = text(labUnits[key]) || embeddedUnit;

    if (parsed !== null) {
      return normalizeLabValue(key, parsed, unit);
    }
  }

  return null;
}

function normalizeLabValue(key: string, value: number, unit: string) {
  const normalizedUnit = unit.trim().toLowerCase();

  if ((key === "vitd" || key === "vitaminD") && normalizedUnit === "nmol/l") {
    return value / 2.5;
  }

  if (key === "b12" && normalizedUnit === "pmol/l") {
    return value / 0.738;
  }

  if (key === "hba1c" && normalizedUnit === "mmol/mol") {
    return (value + 46.7) / 28.7;
  }

  if ((key === "homo" || key === "homocysteine") && normalizedUnit === "mg/l") {
    return value * 7.398;
  }

  return value;
}

function isLabValueRecord(value: unknown): value is { unit?: unknown; value?: unknown } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function bmiPoints(answers: Record<string, unknown>) {
  const heightCm = numberValue(answers.heightCm);
  const weightKg = numberValue(answers.weightKg);

  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
    return 3;
  }

  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);

  if (bmi >= 18.5 && bmi < 23) return 5;
  if (bmi >= 23 && bmi < 25) return 4;
  if (bmi >= 25 && bmi < 28) return 3;
  if (bmi >= 28 && bmi < 30) return 2;
  if (bmi < 18.5) return 2;
  return 1;
}

function vo2Thresholds(answers: Record<string, unknown>) {
  const age = ageYears(answers.age);
  const male = text(answers.sex) === "male";
  const excellent = male
    ? age < 30
      ? 52
      : age < 40
        ? 49
        : age < 50
          ? 45
          : age < 60
            ? 41
            : 37
    : age < 30
      ? 45
      : age < 40
        ? 42
        : age < 50
          ? 39
          : age < 60
            ? 35
            : 31;

  return {
    excellent,
    fair: male ? excellent - 12 : excellent - 10,
    good: male ? excellent - 6 : excellent - 5
  };
}

function labPoints(answers: Record<string, unknown>) {
  const labs = asRecord(answers.labs);
  const labUnits = asRecord(answers.labUnits);
  const vitaminD = labNumber(labs, labUnits, "vitd", "vitaminD");
  const b12 = labNumber(labs, labUnits, "b12");
  const ferritin = labNumber(labs, labUnits, "ferritin");
  const hba1c = labNumber(labs, labUnits, "hba1c");
  const omega3 = labNumber(labs, labUnits, "o3", "omega3");
  const homocysteine = labNumber(labs, labUnits, "homo", "homocysteine");
  const male = text(answers.sex) === "male";
  let points = 0;

  if (vitaminD !== null) {
    points += vitaminD >= 50 && vitaminD <= 80 ? 2 : vitaminD >= 30 ? 1 : 0;
  }

  if (b12 !== null) {
    points += b12 >= 350 && b12 <= 900 ? 1 : b12 >= 250 ? 0.5 : 0;
  }

  if (ferritin !== null) {
    const upper = male ? 300 : 150;
    points += ferritin >= 40 && ferritin <= upper ? 2 : ferritin >= 20 ? 1 : 0;
  }

  if (hba1c !== null) {
    points += hba1c < 5.4 ? 2 : hba1c < 5.7 ? 1 : 0;
  }

  if (omega3 !== null) {
    points += omega3 >= 8 ? 2 : omega3 >= 5 ? 1 : 0;
  }

  if (homocysteine !== null) {
    points += homocysteine < 8 ? 1 : 0;
  }

  return points;
}

function sleepDurationPoints(value: unknown) {
  const sleepHours = sleepHoursValue(value);

  if (sleepHours === null) return 7;
  if (sleepHours >= 7 && sleepHours <= 9) return 14;
  if (sleepHours > 9) return 11;
  if (sleepHours >= 6) return 10;
  if (sleepHours >= 5) return 5;
  return 2;
}

function energyForSleepPoints(value: unknown) {
  return optionScore(
    value,
    { drained: 0, excellent: 4, good: 4, low: 1, ok: 2 },
    2
  );
}

function caffeineSleepPoints(value: unknown) {
  return optionScore(
    value,
    { "1": 2, "2-3": 1, "4+": 0, none: 2 },
    1
  );
}

function foodFrequencyPoints(foodFrequency: Record<string, unknown>) {
  const fruitVeg = optionScore(
    foodFrequency.fruitveg,
    { "1-2": 2, "3+": 3, notdaily: 0 },
    1
  );
  const legumes = optionScore(
    foodFrequency.legumes,
    { most: 2, rare: 0, weekly: 1 },
    1
  );
  const redMeat = optionScore(
    foodFrequency.redmeat,
    { "1-2": 1, "3+": 0, never: 1 },
    0.5
  );
  const eggs = optionScore(
    foodFrequency.eggs,
    { most: 1, rare: 0, weekly: 0.5 },
    0.5
  );
  const dairy = optionScore(
    foodFrequency.dairy,
    { "1-2": 1, "3+": 1, never: 0 },
    0.5
  );

  return fruitVeg + legumes + redMeat + Math.min(1, eggs + dairy);
}

function digestionPoints(answers: Record<string, unknown>) {
  const symptomPoints = optionScore(
    answers.digestion,
    { bloating: -1, constipation: -1, loose: -1, none: 1 },
    0
  );
  const conditionPoints = optionScore(
    answers.digCondition,
    { bariatric: -1, celiac: -1, ibd: -1, ibs: -1, none: 1 },
    0
  );

  return symptomPoints + conditionPoints;
}

function sunHabitPoints(answers: Record<string, unknown>) {
  const sun = sunValue(answers.sun);
  const sunscreen = text(answers.sunscreen);
  const skin = text(answers.skin);
  let points = optionScore(
    sun,
    { high: 1, low: 1, min: 0, mod: 2 },
    1
  );

  if (sun === "high" && (sunscreen === "daily" || sunscreen === "sometimes")) {
    points += 1;
  }

  if (sun === "high" && sunscreen === "rarely" && (skin === "I" || skin === "II")) {
    points -= 1;
  }

  return clampRaw(points, 0, 2);
}

function domainLabels(locale: Locale) {
  if (locale === "th") {
    return {
      activity: ["กิจกรรมและฟิตเนส", "สะท้อนการเคลื่อนไหว ความฟิต และพื้นฐานการฟื้นตัว"],
      biomarkers: ["ตัวชี้วัดร่างกาย", "รวม BMI และค่าแล็บที่คุณใส่ไว้"],
      habits: ["พฤติกรรมสุขภาพ", "สะท้อนบุหรี่ แสงแดด กันแดด อาการ และพลังงาน"],
      nutrition: ["โภชนาการ", "สะท้อนรูปแบบอาหาร ความถี่อาหาร ปลา แอลกอฮอล์ และโปรตีน"],
      sleep: ["การนอนและการฟื้นตัว", "สะท้อนชั่วโมงนอน พลังงาน และคาเฟอีน"],
      stress: ["ความเครียดและสมดุล", "สะท้อนระดับความเครียด ระบบย่อย ภาวะทางเดินอาหาร และ HRV ถ้ามี"]
    } satisfies Record<DomainId, [string, string]>;
  }

  return {
    activity: ["Activity & fitness", "Reflects movement, cardio base, and recovery capacity."],
    biomarkers: ["Body markers", "Uses BMI plus any lab values you added."],
    habits: ["Health habits", "Reflects smoking, sun exposure, sunscreen use, symptoms, and energy."],
    nutrition: ["Nutrition", "Reflects diet pattern, food frequency, fish intake, alcohol, and protein."],
    sleep: ["Sleep & recovery", "Reflects sleep duration, energy, and caffeine load."],
    stress: ["Stress & balance", "Reflects stress load, digestion, digestive conditions, and HRV when available."]
  } satisfies Record<DomainId, [string, string]>;
}

function bandForScore(score: number, locale: Locale) {
  if (locale === "th") {
    if (score >= 80) return "ดีเยี่ยม";
    if (score >= 65) return "ดี";
    if (score >= 50) return "พอใช้";
    return "ควรใส่ใจ";
  }

  if (score >= 80) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 50) return "Fair";
  return "Needs Attention";
}

function headlineForScore(score: number, locale: Locale) {
  if (locale === "th") {
    if (score >= 80) return "พื้นฐานสุขภาพของคุณแข็งแรง";
    if (score >= 65) return "คุณมีพื้นฐานที่ดีและยังปรับให้เฉพาะตัวได้อีก";
    if (score >= 50) return "มีหลายจุดที่สามารถยกระดับได้";
    return "มีโอกาสปรับปรุงที่ชัดเจน";
  }

  if (score >= 80) return "You have a strong health foundation.";
  if (score >= 65) return "You have a solid base with clear room to personalise.";
  if (score >= 50) return "Several areas can be improved with the right focus.";
  return "There is a clear opportunity to improve the fundamentals.";
}

function summaryForScore(lowest: HealthScoreDomain, locale: Locale) {
  if (locale === "th") {
    return `พื้นที่ที่ควรให้ความสำคัญที่สุดคือ ${lowest.label} คะแนนนี้ช่วยให้เราจัดลำดับสูตรและคำแนะนำตัวอย่างได้เหมาะกับคุณมากขึ้น`;
  }

  return `Your biggest opportunity is ${lowest.label.toLowerCase()}. This score helps us prioritise the formulation and preview recommendations around your actual gaps.`;
}

function buildMovers(domains: HealthScoreDomain[], locale: Locale): HealthScoreMover[] {
  return [...domains]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((domain) => ({
      impact: locale === "th" ? "ผลกระทบสูง" : "High impact",
      label:
        locale === "th"
          ? `ปรับปรุง ${domain.label}`
          : `Improve ${domain.label.toLowerCase()}`
    }));
}

export function computeHealthScore(
  answersInput: unknown,
  locale: Locale = "en"
): HealthScoreResult {
  const answers = asRecord(answersInput);
  const labs = asRecord(answers.labs);
  const foodFrequency = asRecord(answers.foodFrequency);
  const sleepPoints = Math.min(
    sleepDurationPoints(answers.sleepHrs) +
      energyForSleepPoints(answers.energy) +
      caffeineSleepPoints(answers.caffeine),
    20
  );

  const activityPoints = optionScore(
    answers.activity,
    { active: 11, athlete: 14, light: 5, moderate: 8, sedentary: 2, sitting: 2 },
    5
  );
  const vo2Max = numberValue(answers.vo2) ?? 0;
  const vo2 = vo2Thresholds(answers);
  const vo2Points =
    vo2Max > 0
      ? vo2Max >= vo2.excellent
        ? 6
        : vo2Max >= vo2.good
          ? 4
          : vo2Max >= vo2.fair
            ? 2
            : 1
      : 2;
  const activityTotalPoints = Math.min(activityPoints + vo2Points, 20);

  const dietPoints = optionScore(
    dietValue(answers.diet),
    {
      balanced: 5,
      fast: 0,
      keto: 4,
      med: 6,
      none: 3,
      plant: 5,
      vegan: 5,
      western: 1,
      whole: 6
    },
    3
  );
  const fishPoints = optionScore(
    answers.fish ?? foodFrequency.fish,
    { "2-3pw": 4, daily: 4, never: 0, often: 4, once: 3, rare: 1, rarely: 1, weekly: 3 },
    2
  );
  const alcoholPoints = optionScore(
    answers.alcohol,
    { "1-3": 2, "4-7": 1, "8+": 0, high: 0, low: 2, moderate: 1, none: 2 },
    1
  );
  const proteinPoints = optionScore(
    answers.protein,
    { "1-1.5": 1, "1.5-2": 2, "2+": 2, good: 2, high: 2, low: 0, mid: 1, u1: 0 },
    0
  );
  const nutritionPoints = Math.min(
    dietPoints +
      fishPoints +
      foodFrequencyPoints(foodFrequency) +
      alcoholPoints +
      proteinPoints,
    20
  );

  const stressPoints = optionScore(
    answers.stress,
    { "1": 12, "2": 10, "3": 7, "4": 4, "5": 1, extreme: 1, high: 4, low: 10, moderate: 7, verylow: 12 },
    6
  );
  const hrv = numberValue(answers.hrv) ?? numberValue(labs.hrv);
  const hrvPoints = hrv ? (hrv >= 70 ? 2 : hrv >= 50 ? 1 : hrv < 40 ? -1 : 0) : 0;
  const stressTotalPoints = clampRaw(
    stressPoints + hrvPoints + digestionPoints(answers),
    0,
    15
  );

  const biomarkerPoints = Math.min(bmiPoints(answers) + labPoints(answers), 15);
  const smokingPoints = optionScore(
    answers.smoking,
    { daily: 0, "ex5+": 5, ex5: 4, exlong: 5, exrecent: 4, never: 5, occasional: 2 },
    3
  );
  const energyPoints = optionScore(
    answers.energy,
    { drained: 0, excellent: 1, good: 1, low: 0, ok: 0.5 },
    0.5
  );
  const symptoms = arrayValue(answers.symptoms);
  const ageDeflation = ageYears(answers.age) >= 60 ? -1 : 0;
  const symptomPoints = symptoms.includes("great")
    ? 2
    : symptoms.length === 0
      ? 1
      : symptoms.length <= 2
        ? 1.5
        : symptoms.length <= 4
          ? 1
          : 0.5;
  const habitPoints = clampRaw(
    smokingPoints +
      sunHabitPoints(answers) +
      energyPoints +
      symptomPoints +
      ageDeflation,
    0,
    10
  );
  const labelLookup = domainLabels(locale);
  const domainPoints: Record<DomainId, { max: number; points: number }> = {
    activity: { max: 20, points: activityTotalPoints },
    biomarkers: { max: 15, points: biomarkerPoints },
    habits: { max: 10, points: habitPoints },
    nutrition: { max: 20, points: nutritionPoints },
    sleep: { max: 20, points: sleepPoints },
    stress: { max: 15, points: stressTotalPoints }
  };

  const domains = (Object.keys(domainPoints) as DomainId[]).map((id) => {
    const [label, description] = labelLookup[id];
    const domain = domainPoints[id];

    return {
      description,
      id,
      label,
      score: clamp((domain.points / domain.max) * 100)
    };
  });
  const rawPoints = Object.values(domainPoints).reduce(
    (sum, domain) => sum + domain.points,
    0
  );
  const maxPoints = Object.values(domainPoints).reduce(
    (sum, domain) => sum + domain.max,
    0
  );
  const score = clamp((rawPoints / maxPoints) * 100, 8, 96);
  const lowest = [...domains].sort((a, b) => a.score - b.score)[0];

  return {
    band: bandForScore(score, locale),
    domains,
    headline: headlineForScore(score, locale),
    movers: buildMovers(domains, locale),
    score,
    summary: summaryForScore(lowest, locale)
  };
}
