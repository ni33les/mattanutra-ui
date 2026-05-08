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

export type HealthScoreResult = Readonly<{
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

  if (direct) {
    return direct;
  }

  return optionScore(
    value,
    {
      "4-5": 4.5,
      "5-6": 5.5,
      "6-7": 6.5,
      "7-8": 7.5,
      "8+": 8.5,
      "8-9": 8.5,
      "9-plus": 9.5,
      "under-5": 4.5
    },
    7
  );
}

function sunValue(value: unknown) {
  const sun = text(value);

  if (sun === "minimal") {
    return "min";
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

  return diet;
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
  const vitaminD = numberValue(labs.vitaminD);
  const hba1c = numberValue(labs.hba1c);
  const omega3 = numberValue(labs.omega3);
  const homocysteine = numberValue(labs.homocysteine);
  let points = 0;

  if (vitaminD) {
    points += vitaminD >= 50 && vitaminD <= 80 ? 2 : vitaminD >= 30 ? 1 : 0;
  }

  if (hba1c) {
    points += hba1c < 5.4 ? 2 : hba1c < 5.7 ? 1 : 0;
  }

  if (omega3) {
    points += omega3 >= 8 ? 2 : omega3 >= 5 ? 1 : 0;
  }

  if (homocysteine) {
    points += homocysteine < 8 ? 1 : 0;
  }

  return points;
}

function domainLabels(locale: Locale) {
  if (locale === "th") {
    return {
      activity: ["กิจกรรมและฟิตเนส", "สะท้อนการเคลื่อนไหว ความฟิต และพื้นฐานการฟื้นตัว"],
      biomarkers: ["ตัวชี้วัดร่างกาย", "รวม BMI และค่าแล็บที่คุณใส่ไว้"],
      habits: ["พฤติกรรมสุขภาพ", "สะท้อนบุหรี่ แสงแดด อาการ และภาระต่อร่างกาย"],
      nutrition: ["โภชนาการ", "สะท้อนรูปแบบอาหาร ปลา แอลกอฮอล์ และโปรตีน"],
      sleep: ["การนอนและการฟื้นตัว", "สะท้อนชั่วโมงนอนและความสดชื่นหลังตื่น"],
      stress: ["ความเครียดและสมดุล", "สะท้อนระดับความเครียด ระบบย่อย และ HRV ถ้ามี"]
    } satisfies Record<DomainId, [string, string]>;
  }

  return {
    activity: ["Activity & fitness", "Reflects movement, cardio base, and recovery capacity."],
    biomarkers: ["Body markers", "Uses BMI plus any lab values you added."],
    habits: ["Health habits", "Reflects smoking, sun exposure, symptoms, and body load."],
    nutrition: ["Nutrition", "Reflects diet pattern, fish intake, alcohol, and protein."],
    sleep: ["Sleep & recovery", "Reflects sleep duration and how refreshed you wake."],
    stress: ["Stress & balance", "Reflects stress load, digestion, and HRV when available."]
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
  const sleepHours = sleepHoursValue(answers.sleepHours);
  const sleepHoursPoints =
    sleepHours >= 7 && sleepHours <= 9
      ? 12
      : sleepHours > 9
        ? 9
        : sleepHours >= 6
          ? 8
          : sleepHours >= 5
            ? 4
            : 1;
  const sleepQualityPoints = optionScore(
    answers.sleep,
    { "1": 0, "2": 2, "3": 5, "4": 7, "5": 8 },
    4
  );
  const sleepPoints = Math.min(sleepHoursPoints + sleepQualityPoints, 20);

  const activityPoints = optionScore(
    answers.activity,
    { active: 11, athlete: 14, light: 5, moderate: 8, sedentary: 2 },
    5
  );
  const vo2Max = numberValue(answers.vo2Max) ?? 0;
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
      : optionScore(
          answers.vo2Proxy,
          { athlete: 6, moderate: 3, sustained: 5, winded: 1 },
          2
        );
  const activityTotalPoints = Math.min(activityPoints + vo2Points, 20);

  const dietPoints = optionScore(
    dietValue(answers.diet),
    {
      balanced: 6,
      fast: 0,
      keto: 5,
      med: 8,
      plant: 7,
      vegan: 6,
      western: 2,
      whole: 8
    },
    4
  );
  const fishPoints = optionScore(
    answers.fish,
    { "2-3pw": 5, daily: 5, never: 0, rarely: 2, weekly: 4 },
    2
  );
  const alcoholPoints = optionScore(
    answers.alcohol,
    { high: 0, low: 2, moderate: 1, none: 3 },
    1
  );
  const proteinPoints = optionScore(
    answers.protein,
    { good: 2, high: 2, low: 0, mid: 1 },
    0
  );
  const nutritionPoints = Math.min(
    dietPoints + fishPoints + alcoholPoints + proteinPoints,
    18
  );

  const stressPoints = optionScore(
    answers.stress,
    { "1": 14, "2": 11, "3": 8, "4": 5, "5": 2 },
    8
  );
  const hrv = numberValue(labs.hrv);
  const hrvPoints = hrv ? (hrv >= 70 ? 1 : hrv < 40 ? -1 : 0) : 0;
  const gutPoints = optionScore(answers.gut, { great: 1, ibs: -1, loose: -1 }, 0);
  const stressTotalPoints = clampRaw(stressPoints + hrvPoints + gutPoints, 0, 15);

  const biomarkerPoints = Math.min(bmiPoints(answers) + labPoints(answers), 12);
  const smokingPoints = optionScore(
    answers.smoke,
    { daily: 0, exlong: 6, exrecent: 5, never: 7, occasional: 3 },
    4
  );
  const sunPoints = optionScore(
    sunValue(answers.sun),
    { high: 1, low: 1, min: 0, mod: 2 },
    1
  );
  const energyPoints = optionScore(answers.energy, { "1": -1, "5": 1 }, 0);
  const symptoms = arrayValue(answers.symptoms);
  const ageDeflation = ageYears(answers.age) >= 60 ? -1 : 0;
  const symptomPoints = answers.feelGreat
    ? 5
    : symptoms.length === 0
      ? 4
      : symptoms.length <= 2
        ? 3
        : symptoms.length <= 4
          ? 2
          : 1;
  const habitPoints = clampRaw(
    smokingPoints + sunPoints + energyPoints + symptomPoints + ageDeflation,
    0,
    10
  );
  const labelLookup = domainLabels(locale);
  const domainPoints: Record<DomainId, { max: number; points: number }> = {
    activity: { max: 20, points: activityTotalPoints },
    biomarkers: { max: 12, points: biomarkerPoints },
    habits: { max: 10, points: habitPoints },
    nutrition: { max: 18, points: nutritionPoints },
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
  const score = clamp((rawPoints / 95) * 100, 8, 96);
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
