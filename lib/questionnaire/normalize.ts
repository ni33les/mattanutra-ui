import {
  buildInitialAnswers,
  clampFirstNameInput,
  type Answers,
  type FoodFrequencyKey
} from "@/components/assessment-flow-state";
import type { QuestionnaireAnswers } from "@/lib/questionnaire/types";

const SKIN_MAP: Record<string, string> = {
  "1": "I",
  "2": "II",
  "3": "III",
  "4": "IV",
  "5": "V",
  "6": "VI",
  I: "I",
  II: "II",
  III: "III",
  IV: "IV",
  V: "V",
  VI: "VI"
};

const FOOD_KEYS: readonly FoodFrequencyKey[] = [
  "redmeat",
  "dairy",
  "fruitveg",
  "eggs",
  "legumes",
  "fish"
];

const LAB_KEY_MAP: Record<string, string> = {
  lab_vitd: "vitd",
  lab_b12: "b12",
  lab_ferritin: "ferritin",
  lab_hba1c: "hba1c",
  lab_o3: "o3",
  lab_homo: "homo",
  vitd: "vitd",
  b12: "b12",
  ferritin: "ferritin",
  hba1c: "hba1c",
  o3: "o3",
  homo: "homo"
};

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

/**
 * Map flat chat-engine answers → existing assessment `Answers` shape
 * expected by Health Score / formulation.
 */
export function toAssessmentAnswers(
  raw: QuestionnaireAnswers,
  prefill?: unknown
): Answers {
  const base = buildInitialAnswers(prefill);
  const answers = { ...base } as Answers;

  const copyString = (key: keyof Answers) => {
    if (raw[key as string] !== undefined && raw[key as string] !== null) {
      (answers as Record<string, unknown>)[key as string] = asString(
        raw[key as string]
      );
    }
  };

  const stringFields: (keyof Answers)[] = [
    "activity",
    "age",
    "alcohol",
    "antibiotics",
    "budget",
    "caffeine",
    "country",
    "diet",
    "digCondition",
    "digestion",
    "energy",
    "flow",
    "form",
    "kidney",
    "liver",
    "maxPills",
    "meds",
    "menopause",
    "otherMed",
    "otherTracker",
    "protein",
    "reproStatus",
    "sex",
    "sleepHrs",
    "smoking",
    "stress",
    "sun",
    "sunscreen",
    "surgery",
    "supplements",
    "tracker"
  ];

  for (const key of stringFields) {
    copyString(key);
  }

  if (raw.goals !== undefined) {
    answers.goals = asStringArray(raw.goals);
  }

  if (raw.symptoms !== undefined) {
    answers.symptoms = asStringArray(raw.symptoms);
  }

  if (raw.allergies !== undefined) {
    answers.allergies = asStringArray(raw.allergies);
  }

  if (raw.family !== undefined) {
    answers.family = asStringArray(raw.family);
  }

  if (raw.medTypes !== undefined) {
    answers.medTypes = asStringArray(raw.medTypes);
  }

  if (raw.suppAllergies !== undefined) {
    answers.suppAllergies = asStringArray(raw.suppAllergies);
  }

  if (raw.disclosure !== undefined) {
    answers.disclosure = asBoolean(raw.disclosure);
  }

  // consentSafety is chat-only; treat agreement as disclosure reinforcement
  if (asBoolean(raw.consentSafety) && !answers.disclosure) {
    answers.disclosure = true;
  }

  if (raw.firstName !== undefined) {
    answers.firstName = clampFirstNameInput(asString(raw.firstName));
  }

  // Height / weight: engine may store hw object or height/weight flat
  const hw = raw.hw;
  if (hw && typeof hw === "object" && !Array.isArray(hw)) {
    const body = hw as { h?: unknown; w?: unknown; height?: unknown; weight?: unknown };
    answers.heightCm = asString(body.h ?? body.height ?? raw.height, answers.heightCm);
    answers.weightKg = asString(body.w ?? body.weight ?? raw.weight, answers.weightKg);
  } else {
    if (raw.height !== undefined) {
      answers.heightCm = asString(raw.height);
    }

    if (raw.weight !== undefined) {
      answers.weightKg = asString(raw.weight);
    }

    if (raw.heightCm !== undefined) {
      answers.heightCm = asString(raw.heightCm);
    }

    if (raw.weightKg !== undefined) {
      answers.weightKg = asString(raw.weightKg);
    }
  }

  // Skin tone: 1–6 → I–VI
  if (raw.skin !== undefined) {
    const skin = asString(raw.skin);
    answers.skin = SKIN_MAP[skin] ?? skin;
  }

  // Food frequency f_* keys
  const foodFrequency = { ...answers.foodFrequency };
  for (const key of FOOD_KEYS) {
    const flat = raw[`f_${key}`];
    if (flat !== undefined && flat !== null) {
      foodFrequency[key] = asString(flat);
    }
  }

  if (raw.foodFrequency && typeof raw.foodFrequency === "object") {
    Object.assign(foodFrequency, raw.foodFrequency);
  }

  answers.foodFrequency = foodFrequency;

  // Fitness
  if (raw.vo2 !== undefined) {
    answers.vo2 = asString(raw.vo2);
  }

  if (raw.hrv !== undefined) {
    answers.hrv = asString(raw.hrv);
  }

  if (raw.fitness && typeof raw.fitness === "object" && !Array.isArray(raw.fitness)) {
    const fit = raw.fitness as { vo2?: unknown; hrv?: unknown };
    if (fit.vo2 !== undefined) {
      answers.vo2 = asString(fit.vo2);
    }

    if (fit.hrv !== undefined) {
      answers.hrv = asString(fit.hrv);
    }
  }

  // Labs
  const labs = { ...answers.labs };
  const labUnits = { ...answers.labUnits };

  for (const [rawKey, value] of Object.entries(raw)) {
    if (rawKey.startsWith("lab_") && !rawKey.startsWith("unit_")) {
      const canon = LAB_KEY_MAP[rawKey] ?? rawKey.slice(4);
      if (value !== undefined && value !== null && value !== "") {
        labs[canon] = asString(value);
      }
    }

    if (rawKey.startsWith("unit_")) {
      const labRaw = `lab_${rawKey.slice(5)}`;
      const canon = LAB_KEY_MAP[labRaw] ?? rawKey.slice(5);
      if (value !== undefined && value !== null && value !== "") {
        labUnits[canon] = asString(value);
      }
    }
  }

  if (raw.labs && typeof raw.labs === "object" && !Array.isArray(raw.labs)) {
    for (const [k, v] of Object.entries(raw.labs as Record<string, unknown>)) {
      if (v !== undefined && v !== null && v !== "") {
        labs[LAB_KEY_MAP[k] ?? k] = asString(v);
      }
    }
  }

  if (raw.labUnits && typeof raw.labUnits === "object" && !Array.isArray(raw.labUnits)) {
    Object.assign(labUnits, raw.labUnits);
  }

  answers.labs = labs;
  answers.labUnits = labUnits;

  // Free-text avoid / otherSupp live outside Answers; keep on answers via cast if needed later.
  // otherMed / otherTracker already mapped.

  return answers;
}

/** Extra chat fields preserved for analytics (not Health Score). */
export function extraChatFields(raw: QuestionnaireAnswers): Record<string, unknown> {
  const extra: Record<string, unknown> = {};

  if (raw.avoid !== undefined) {
    extra.avoid = raw.avoid;
  }

  if (raw.otherSupp !== undefined) {
    extra.otherSupp = raw.otherSupp;
  }

  if (raw.consentSafety !== undefined) {
    extra.consentSafety = raw.consentSafety;
  }

  if (raw.precisionGate !== undefined) {
    extra.precisionGate = raw.precisionGate;
  }

  return extra;
}
