import { ASSESSMENT_FIRST_NAME_MAX_LENGTH } from "@/lib/assessment-first-name";

export type LabField = Readonly<{
  label: string;
  units: readonly string[];
  value: string;
}>;

export type FoodFrequencyKey =
  | "dairy"
  | "eggs"
  | "fish"
  | "fruitveg"
  | "legumes"
  | "redmeat";

export type Answers = {
  activity: string;
  age: string;
  alcohol: string;
  allergies: string[];
  antibiotics: string;
  budget: string;
  caffeine: string;
  country: string;
  diet: string;
  digCondition: string;
  digestion: string;
  disclosure: boolean;
  energy: string;
  family: string[];
  firstName: string;
  flow: string;
  foodFrequency: Record<FoodFrequencyKey, string>;
  form: string;
  goals: string[];
  heightCm: string;
  hrv: string;
  kidney: string;
  labs: Record<string, string>;
  labUnits: Record<string, string>;
  liver: string;
  maxPills: string;
  meds: string;
  medTypes: string[];
  menopause: string;
  otherMed: string;
  otherTracker: string;
  protein: string;
  reproStatus: string;
  sex: string;
  skin: string;
  sleepHrs: string;
  smoking: string;
  stress: string;
  sun: string;
  sunscreen: string;
  surgery: string;
  suppAllergies: string[];
  supplements: string;
  symptoms: string[];
  tracker: string;
  vo2: string;
  weightKg: string;
};

export const foodFrequencyKeys: FoodFrequencyKey[] = [
  "redmeat",
  "dairy",
  "fruitveg",
  "eggs",
  "legumes",
  "fish"
];

export const labFields: LabField[] = [
  { label: "Vitamin D", value: "vitd", units: ["ng/mL", "nmol/L"] },
  { label: "Vitamin B12", value: "b12", units: ["pg/mL", "pmol/L"] },
  { label: "Ferritin", value: "ferritin", units: ["ng/mL", "ug/L"] },
  { label: "HbA1c", value: "hba1c", units: ["%", "mmol/mol"] },
  { label: "Omega-3 Index", value: "o3", units: ["%"] },
  { label: "Homocysteine", value: "homo", units: ["umol/L", "mg/L"] }
];

const initialAnswers: Answers = {
  activity: "",
  age: "",
  alcohol: "",
  allergies: [],
  antibiotics: "",
  budget: "",
  caffeine: "",
  country: "TH",
  diet: "",
  digCondition: "",
  digestion: "",
  disclosure: false,
  energy: "",
  family: [],
  firstName: "",
  flow: "",
  foodFrequency: {
    dairy: "",
    eggs: "",
    fish: "",
    fruitveg: "",
    legumes: "",
    redmeat: ""
  },
  form: "",
  goals: [],
  heightCm: "",
  hrv: "",
  kidney: "",
  labs: {},
  labUnits: Object.fromEntries(
    labFields.map((field) => [field.value, field.units[0]])
  ),
  liver: "",
  maxPills: "",
  meds: "",
  medTypes: [],
  menopause: "",
  otherMed: "",
  otherTracker: "",
  protein: "",
  reproStatus: "",
  sex: "",
  skin: "",
  sleepHrs: "",
  smoking: "",
  stress: "",
  sun: "",
  sunscreen: "",
  surgery: "",
  suppAllergies: [],
  supplements: "",
  symptoms: [],
  tracker: "",
  vo2: "",
  weightKg: ""
};

function cleanStringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : fallback;
}

export function clampFirstNameInput(value: string) {
  return Array.from(value).slice(0, ASSESSMENT_FIRST_NAME_MAX_LENGTH).join("");
}

export function buildInitialAnswers(prefillAnswers?: unknown): Answers {
  if (!prefillAnswers || typeof prefillAnswers !== "object" || Array.isArray(prefillAnswers)) {
    return initialAnswers;
  }

  const prefill = prefillAnswers as Partial<Answers>;

  return {
    ...initialAnswers,
    ...prefill,
    allergies: cleanStringArray(prefill.allergies, initialAnswers.allergies),
    family: cleanStringArray(prefill.family, initialAnswers.family),
    firstName:
      typeof prefill.firstName === "string"
        ? clampFirstNameInput(prefill.firstName)
        : initialAnswers.firstName,
    foodFrequency: {
      ...initialAnswers.foodFrequency,
      ...(prefill.foodFrequency && typeof prefill.foodFrequency === "object"
        ? prefill.foodFrequency
        : {})
    },
    goals: cleanStringArray(prefill.goals, initialAnswers.goals),
    labs:
      prefill.labs && typeof prefill.labs === "object" && !Array.isArray(prefill.labs)
        ? prefill.labs
        : initialAnswers.labs,
    labUnits:
      prefill.labUnits && typeof prefill.labUnits === "object" && !Array.isArray(prefill.labUnits)
        ? { ...initialAnswers.labUnits, ...prefill.labUnits }
        : initialAnswers.labUnits,
    medTypes: cleanStringArray(prefill.medTypes, initialAnswers.medTypes),
    suppAllergies: cleanStringArray(prefill.suppAllergies, initialAnswers.suppAllergies),
    symptoms: cleanStringArray(prefill.symptoms, initialAnswers.symptoms)
  };
}

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function randomSubset<T>(items: readonly T[], count: number) {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

export function buildRandomDevAnswers(): Answers {
  const sex = randomItem(["female", "male"] as const);

  return {
    ...initialAnswers,
    age: randomItem(["26-35", "36-45", "46-55", "56-65"]),
    alcohol: randomItem(["none", "1-3", "4-7"]),
    antibiotics: randomItem(["no", "yes"]),
    activity: randomItem(["sitting", "light", "moderate", "active"]),
    budget: randomItem(["1000-2500", "2500-5000", "5000+"]),
    caffeine: randomItem(["1", "2-3", "4+"]),
    country: "TH",
    diet: randomItem(["balanced", "whole", "mediterranean", "plant"]),
    digCondition: "none",
    digestion: randomItem(["none", "bloating", "constipation"]),
    disclosure: true,
    energy: randomItem(["ok", "good", "excellent"]),
    family: randomItem([["none"], ["heart"], ["diabetes"]]),
    firstName: randomItem(["Alex", "Maya", "Niran"]),
    flow: sex === "female" ? randomItem(["none", "light", "moderate"]) : "",
    foodFrequency: {
      dairy: randomItem(["never", "1-2", "3+"]),
      eggs: randomItem(["rare", "weekly", "most"]),
      fish: randomItem(["rare", "once", "often"]),
      fruitveg: randomItem(["1-2", "3+"]),
      legumes: randomItem(["weekly", "most"]),
      redmeat: randomItem(["never", "1-2", "3+"])
    },
    form: randomItem(["capsules", "powder", "mixed"]),
    goals: randomSubset(["energy", "sleep", "focus", "longevity", "fitness", "mood"], 3),
    heightCm: String(Math.round(155 + Math.random() * 38)),
    hrv: String(Math.round(42 + Math.random() * 36)),
    kidney: "normal",
    labs: { b12: "520", ferritin: "80", hba1c: "5.3", o3: "6.2", vitd: "42" },
    liver: "normal",
    maxPills: randomItem(["4-6", "7-10", "nolimit"]),
    meds: randomItem(["none", "yes"]),
    medTypes: ["statin"],
    menopause: sex === "female" ? randomItem(["pre", "peri", "post", "unsure"]) : "",
    protein: randomItem(["1-1.5", "1.5-2", "2+"]),
    reproStatus: sex === "female" ? randomItem(["none", "ttc"]) : "",
    sex,
    skin: randomItem(["II", "III", "IV", "V"]),
    sleepHrs: randomItem(["6-7", "7-8", "8-9"]),
    smoking: randomItem(["never", "ex5+", "occasional"]),
    stress: randomItem(["low", "moderate", "high"]),
    sun: randomItem(["15-30", "30-60", "60+"]),
    sunscreen: randomItem(["rarely", "sometimes", "daily"]),
    surgery: randomItem(["no", "yes"]),
    supplements: randomItem(["none", "basic", "d3omega", "targeted"]),
    symptoms: randomSubset(["fatigue", "brainfog", "sleep", "stress", "joints"], 2),
    tracker: randomItem(["none", "apple", "garmin", "fitbit"]),
    vo2: String(Math.round(34 + Math.random() * 20)),
    weightKg: String(Math.round(52 + Math.random() * 42))
  };
}

export function hasText(value: string) {
  return value.trim().length > 0;
}

export function hasAny(values: readonly string[]) {
  return values.length > 0;
}

export function selectedOther(values: readonly string[]) {
  return values.includes("other");
}

export function isPregnantOrBreastfeeding(answers: Answers) {
  return answers.reproStatus === "pregnant" || answers.reproStatus === "breastfeeding";
}

function reachableEssentialChecks(answers: Answers) {
  const checks: Array<{ answered: boolean; id: string }> = [
    { id: "sex", answered: hasText(answers.sex) },
    { id: "age", answered: hasText(answers.age) },
    { id: "heightWeight", answered: hasText(answers.heightCm) && hasText(answers.weightKg) },
    { id: "skin", answered: hasText(answers.skin) },
    { id: "country", answered: hasText(answers.country) },
    { id: "sun", answered: hasText(answers.sun) },
    { id: "sunscreen", answered: hasText(answers.sunscreen) },
    { id: "goals", answered: hasAny(answers.goals) },
    { id: "symptoms", answered: hasAny(answers.symptoms) },
    { id: "sleepHrs", answered: hasText(answers.sleepHrs) },
    { id: "energy", answered: hasText(answers.energy) },
    { id: "activity", answered: hasText(answers.activity) },
    { id: "stress", answered: hasText(answers.stress) },
    { id: "digestion", answered: hasText(answers.digestion) },
    { id: "digCondition", answered: hasText(answers.digCondition) },
    { id: "smoking", answered: hasText(answers.smoking) },
    { id: "alcohol", answered: hasText(answers.alcohol) },
    { id: "caffeine", answered: hasText(answers.caffeine) },
    { id: "diet", answered: hasText(answers.diet) },
    ...foodFrequencyKeys.map((key) => ({
      id: `food-${key}`,
      answered: hasText(answers.foodFrequency[key])
    })),
    { id: "allergies", answered: hasAny(answers.allergies) },
    { id: "disclosure", answered: answers.disclosure },
    { id: "meds", answered: hasText(answers.meds) },
    { id: "suppAllergies", answered: hasAny(answers.suppAllergies) },
    { id: "kidney", answered: hasText(answers.kidney) },
    { id: "liver", answered: hasText(answers.liver) },
    { id: "surgery", answered: hasText(answers.surgery) },
    { id: "antibiotics", answered: hasText(answers.antibiotics) },
    { id: "supplements", answered: hasText(answers.supplements) },
    { id: "budget", answered: hasText(answers.budget) },
    { id: "maxPills", answered: hasText(answers.maxPills) },
    { id: "form", answered: hasText(answers.form) }
  ];

  if (answers.sex === "female") {
    checks.push(
      { id: "reproStatus", answered: hasText(answers.reproStatus) },
      { id: "menopause", answered: hasText(answers.menopause) }
    );

    if (!isPregnantOrBreastfeeding(answers)) {
      checks.push({ id: "flow", answered: hasText(answers.flow) });
    }
  }

  if (answers.meds === "yes") {
    checks.push({ id: "medTypes", answered: hasAny(answers.medTypes) });

    if (selectedOther(answers.medTypes)) {
      checks.push({ id: "otherMed", answered: hasText(answers.otherMed) });
    }
  }

  return checks;
}

export function optionalChecks(answers: Answers) {
  return [
    hasText(answers.protein),
    hasAny(answers.family),
    hasText(answers.tracker),
    hasText(answers.vo2),
    hasText(answers.hrv),
    ...labFields.map((field) => hasText(answers.labs[field.value] ?? ""))
  ];
}

export function precisionProgress(answers: Answers) {
  const essential = reachableEssentialChecks(answers);
  const essentialDone = essential.filter((item) => item.answered).length;
  const optional = optionalChecks(answers);
  const optionalDone = optional.filter(Boolean).length;
  const essentialPercent = essential.length > 0 ? (essentialDone / essential.length) * 80 : 0;
  const optionalPercent = optional.length > 0 ? (optionalDone / optional.length) * 20 : 0;

  return {
    essentialDone,
    essentialRemaining: essential.length - essentialDone,
    essentialTotal: essential.length,
    optionalDone,
    optionalTotal: optional.length,
    progress: Math.min(100, Math.round(essentialPercent + optionalPercent))
  };
}

export function formatHeightImperial(value: string) {
  const cm = Number(value);

  if (!Number.isFinite(cm) || cm <= 0) {
    return "";
  }

  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;

  return `${feet} ft ${inches} in`;
}

export function formatWeightImperial(value: string) {
  const kg = Number(value);

  if (!Number.isFinite(kg) || kg <= 0) {
    return "";
  }

  return `${Math.round(kg * 2.20462)} lb`;
}
