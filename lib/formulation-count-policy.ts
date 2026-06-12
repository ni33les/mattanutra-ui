import type {
  FormulationBlueprint,
  FormulationIngredient
} from "@/lib/formulation-types";

const MIN_SUPPLEMENT_TARGET_COUNT = 4;
const MAX_SUPPLEMENT_TARGET_COUNT = 12;
const STATIC_COUNT_TO_AVOID = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readText(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readStringArray(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0 && item !== "none")
    : [];
}

function countRecordTextValues(value: unknown) {
  if (!isRecord(value)) {
    return 0;
  }

  return Object.values(value).filter(
    (item) => typeof item === "string" && item.trim().length > 0
  ).length;
}

function countFoodGaps(record: Record<string, unknown>) {
  if (!isRecord(record.foodFrequency)) {
    return 0;
  }

  return Object.values(record.foodFrequency).filter((item) => {
    if (typeof item !== "string") {
      return false;
    }

    const value = item.trim().toLowerCase();

    return value === "never" || value === "rarely" || value === "1-2";
  }).length;
}

function hasAnyText(record: Record<string, unknown>, keys: readonly string[]) {
  return keys.some((key) => {
    const value = readText(record, key);

    return value.length > 0 && value !== "none" && value !== "no";
  });
}

function countLifestyleSignals(record: Record<string, unknown>) {
  let count = 0;

  if (["<5", "5-6", "6-7", "poor"].includes(readText(record, "sleepHrs"))) {
    count += 1;
  }

  if (["low", "ok", "poor"].includes(readText(record, "energy"))) {
    count += 1;
  }

  if (["moderate", "high"].includes(readText(record, "stress"))) {
    count += 1;
  }

  if (["sitting", "light"].includes(readText(record, "activity"))) {
    count += 1;
  }

  if (hasAnyText(record, ["digestion", "digCondition", "skin", "smoking"])) {
    count += 1;
  }

  if (["4-7", "8+", "high"].includes(readText(record, "alcohol"))) {
    count += 1;
  }

  if (["low", "rare", "little"].includes(readText(record, "sun"))) {
    count += 1;
  }

  return count;
}

function countPrecisionSignals(record: Record<string, unknown>) {
  let count = countRecordTextValues(record.labs);

  if (readText(record, "tracker") && readText(record, "tracker") !== "none") {
    count += 1;
  }

  if (readText(record, "vo2")) {
    count += 1;
  }

  if (readText(record, "hrv")) {
    count += 1;
  }

  return count;
}

function countSafetyConstraints(record: Record<string, unknown>) {
  let count = 0;

  if (readText(record, "meds") === "yes") {
    count += 1;
  }

  if (hasAnyText(record, ["kidney", "liver", "reproStatus", "surgery", "antibiotics"])) {
    count += 1;
  }

  if (readStringArray(record, "allergies").length > 0) {
    count += 1;
  }

  if (readStringArray(record, "suppAllergies").length > 0) {
    count += 1;
  }

  return count;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function avoidStaticEight(targetCount: number, score: number, constraints: number) {
  if (targetCount !== STATIC_COUNT_TO_AVOID) {
    return targetCount;
  }

  return constraints > 0 || score < 20 ? 7 : 9;
}

function targetBudgetAdjustment(record: Record<string, unknown>) {
  const budget = readText(record, "budget");

  if (budget === "1000-2500" || budget === "low") {
    return -1;
  }

  if (budget === "5000+" || budget === "high") {
    return 1;
  }

  return 0;
}

function targetPillAdjustment(record: Record<string, unknown>) {
  const maxPills = readText(record, "maxPills");

  if (maxPills === "1-3") {
    return -2;
  }

  if (maxPills === "4-6") {
    return -1;
  }

  if (maxPills === "nolimit" || maxPills === "no-limit") {
    return 1;
  }

  return 0;
}

export function targetSupplementBreakdownCount(answers: unknown) {
  const record = isRecord(answers) ? answers : {};
  const goals = readStringArray(record, "goals");
  const symptoms = readStringArray(record, "symptoms").filter(
    (item) => item !== "great"
  );
  const familyHistory = readStringArray(record, "family");
  const safetyConstraints = countSafetyConstraints(record);
  const score =
    Math.min(goals.length, 3) * 2 +
    Math.min(symptoms.length, 6) * 2 +
    Math.min(countPrecisionSignals(record), 8) +
    Math.min(countFoodGaps(record), 6) +
    Math.min(countLifestyleSignals(record), 7) +
    Math.min(familyHistory.length, 2);
  const adjustedTarget =
    MIN_SUPPLEMENT_TARGET_COUNT +
    Math.floor(score / 4) +
    targetBudgetAdjustment(record) +
    targetPillAdjustment(record) -
    Math.min(safetyConstraints, 2);
  const clampedTarget = clamp(
    adjustedTarget,
    MIN_SUPPLEMENT_TARGET_COUNT,
    MAX_SUPPLEMENT_TARGET_COUNT
  );

  return avoidStaticEight(clampedTarget, score, safetyConstraints);
}

function rankedIngredients(items: readonly FormulationIngredient[]) {
  return [...items].sort(
    (left, right) =>
      left.effectivenessRank - right.effectivenessRank ||
      left.id.localeCompare(right.id)
  );
}

function renumberIngredients(items: readonly FormulationIngredient[]) {
  return items.map((ingredient, index) => ({
    ...ingredient,
    effectivenessRank: index + 1
  }));
}

function isVisibleIngredient(ingredient: FormulationIngredient) {
  return ingredient.safety?.visibility !== "hidden";
}

export function visibleSupplementBreakdownCount(
  items: readonly FormulationIngredient[]
) {
  return items.filter(isVisibleIngredient).length;
}

export function normalizeFormulationSupplementCount(
  formulation: FormulationBlueprint,
  targetCount: number
): FormulationBlueprint {
  const ordered = rankedIngredients(formulation.supplementBreakdown);
  const normalizedTarget = clamp(
    Math.round(targetCount),
    MIN_SUPPLEMENT_TARGET_COUNT,
    MAX_SUPPLEMENT_TARGET_COUNT
  );
  const shouldAvoidEight =
    ordered.length === STATIC_COUNT_TO_AVOID &&
    normalizedTarget !== STATIC_COUNT_TO_AVOID;
  const desiredCount = shouldAvoidEight
    ? STATIC_COUNT_TO_AVOID - 1
    : Math.min(ordered.length, normalizedTarget);

  if (ordered.length <= desiredCount && !shouldAvoidEight) {
    return {
      ...formulation,
      supplementBreakdown: renumberIngredients(ordered)
    };
  }

  return {
    ...formulation,
    supplementBreakdown: renumberIngredients(
      ordered.slice(0, Math.max(1, desiredCount))
    )
  };
}

export function normalizeVisibleFormulationSupplementCount(
  formulation: FormulationBlueprint,
  targetCount: number
): FormulationBlueprint {
  const ordered = rankedIngredients(formulation.supplementBreakdown);
  const visibleItems = ordered.filter(isVisibleIngredient);
  const normalizedTarget = clamp(
    Math.round(targetCount),
    MIN_SUPPLEMENT_TARGET_COUNT,
    MAX_SUPPLEMENT_TARGET_COUNT
  );
  const shouldAvoidEight =
    visibleItems.length === STATIC_COUNT_TO_AVOID &&
    normalizedTarget !== STATIC_COUNT_TO_AVOID;
  const desiredVisibleCount = shouldAvoidEight
    ? STATIC_COUNT_TO_AVOID - 1
    : Math.min(visibleItems.length, normalizedTarget);

  if (visibleItems.length <= desiredVisibleCount && !shouldAvoidEight) {
    return {
      ...formulation,
      supplementBreakdown: renumberIngredients(ordered)
    };
  }

  const retainedVisibleItems = new Set(
    visibleItems.slice(0, Math.max(1, desiredVisibleCount))
  );

  return {
    ...formulation,
    supplementBreakdown: renumberIngredients(
      ordered.filter(
        (ingredient) =>
          !isVisibleIngredient(ingredient) || retainedVisibleItems.has(ingredient)
      )
    )
  };
}
