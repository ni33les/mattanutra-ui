import type {
  ProductRecommendationClientContext,
  ProductRecommendationInput
} from "@/lib/product-recommendation-types";

export type V2Weights = Readonly<{
  confidence: number;
  cost: number;
  coverage: number;
  dose: number;
  extras: number;
  simplicity: number;
}>;

export type V2SafetyContext = Readonly<{
  bloodThinner: boolean;
  hasConditionContext: boolean;
  hasMedicationContext: boolean;
  reproductiveCaution: boolean;
}>;

export const V2_ALGORITHM_VERSION = "v2-exact-shortlist" as const;
export const V2_FULL_BEAM_ALGORITHM_VERSION = "v2-full-beam" as const;
export const ACTIVE_PRODUCT_RECOMMENDATION_ALGORITHM_VERSION =
  V2_FULL_BEAM_ALGORITHM_VERSION;
export const ACTIVE_PRODUCT_RECOMMENDATION_IMPLEMENTATION_VERSION =
  "stack-preference-4";

export const V2_FULL_BEAM_WIDTH = 32;
export const V2_SHORTLIST_LIMIT = 32;
export const V2_PER_NEED_SHORTLIST = 4;
export const V2_TOP_OVERALL_SHORTLIST = 16;
export const V2_TOP_BROAD_SHORTLIST = 8;
export const V2_TOP_AFFILIATE_SHORTLIST = 8;
export const V2_MAX_SERVING_MULTIPLIER = 3;
export const V2_SCORE_EPSILON = 0.000001;
export const V2_STACK_DOSE_LIMIT_SLACK_MULTIPLIER = 1;
export const V2_DIVERSITY_SCORE_EPSILON = 0.005;
export const V2_MATERIAL_COVERAGE_DELTA_PERCENT = 3;
export const V2_MIN_MARGINAL_PRODUCT_CONTRIBUTION_PERCENT =
  V2_MATERIAL_COVERAGE_DELTA_PERCENT;
export const V2_TINY_PARTIAL_PRODUCT_COVERAGE_CEILING = 0.2;
export const V2_BALANCED_MATERIAL_COVERAGE_DELTA_PERCENT = 15;
export const V2_MULTISERVING_REQUIRED_COVERAGE_GAIN_PERCENT = 15;
export const V2_COMPACT_MIN_COVERAGE_RATIO = 0.65;
export const V2_COMPACT_CRITICAL_WEIGHT_FLOOR = 9;
export const V2_COMPACT_CRITICAL_NEED_LOSS_TOLERANCE = 0.35;
export const V2_EXTRA_SERVING_SIMPLICITY_PENALTY = 0.02;
export const V2_DUPLICATE_NEED_PRODUCT_PENALTY_WEIGHT = 0.24;
export const V2_USEFUL_EXTRAS_LIMIT = 8;
export const V2_EXCESSIVE_EXTRAS_PENALTY_WEIGHT = 0.4;
export const V2_EXCESSIVE_EXTRAS_PENALTY_RANGE = 24;

export const SAFETY_FLAG_PREGNANCY_CAUTION = 1;
export const SAFETY_FLAG_MEDICATION_INTERACTION = 2;
export const SAFETY_FLAG_BLEEDING_RISK = 4;
export const SAFETY_FLAG_CONDITION_CAUTION = 8;
export const SAFETY_FLAG_HORMONE_CAUTION = 16;

const V2_BASE_WEIGHTS: V2Weights = {
  confidence: 0.05,
  cost: 0.1,
  coverage: 0.45,
  dose: 0.2,
  extras: 0.05,
  simplicity: 0.15
};

export function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

export function clamp01(value: number) {
  return clamp(value, 0, 1);
}

export function usefulExtrasScore(extrasCount: number) {
  return clamp01(Math.min(extrasCount, V2_USEFUL_EXTRAS_LIMIT) / V2_USEFUL_EXTRAS_LIMIT);
}

export function excessiveExtrasPenalty(extrasCount: number) {
  return clamp01(
    Math.max(0, extrasCount - V2_USEFUL_EXTRAS_LIMIT) /
      V2_EXCESSIVE_EXTRAS_PENALTY_RANGE
  );
}

export function roundScore(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(6));
}

function contextArray(value: readonly string[] | undefined) {
  return (value ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function budgetAmountFromContext(
  input: ProductRecommendationInput
) {
  if (typeof input.budgetAmount === "number" && input.budgetAmount > 0) {
    return input.budgetAmount;
  }

  if (
    typeof input.clientContext?.budgetAmount === "number" &&
    input.clientContext.budgetAmount > 0
  ) {
    return input.clientContext.budgetAmount;
  }

  switch (input.clientContext?.budgetPreference) {
    case "low":
      return 1000;
    case "mid":
      return 2500;
    case "good":
      return 5000;
    default:
      return null;
  }
}

export function normalizedV2Weights(
  context: ProductRecommendationClientContext | null | undefined
) {
  const rawWeights = { ...V2_BASE_WEIGHTS };
  const deltas: Record<string, number> = {};
  const addDelta = (key: keyof V2Weights, delta: number) => {
    rawWeights[key] += delta;
    deltas[key] = roundScore((deltas[key] ?? 0) + delta);
  };
  const feedbackTypes = new Set(contextArray(context?.planFeedbackTypes));
  const medicationTypes = contextArray(context?.medicationTypes);
  const conditions = contextArray(context?.conditions).filter((item) => item !== "none");
  const hasMedicationContext =
    context?.medications === "yes" || medicationTypes.length > 0;
  const lifestage = context?.lifestage?.toLowerCase() ?? "";
  const hasReproductiveCaution =
    lifestage.includes("pregnant") ||
    lifestage.includes("breastfeeding") ||
    lifestage.includes("ttc") ||
    lifestage.includes("trying");
  const hasSafetyContext =
    hasMedicationContext ||
    conditions.length > 0 ||
    hasReproductiveCaution ||
    feedbackTypes.has("safety_disclosure");

  if (context?.budgetPreference === "low") {
    addDelta("cost", 0.12);
    addDelta("simplicity", 0.03);
    addDelta("coverage", -0.06);
    addDelta("extras", -0.03);
  } else if (context?.budgetPreference === "mid") {
    addDelta("cost", 0.06);
    addDelta("coverage", -0.03);
  } else if (context?.budgetPreference === "high") {
    addDelta("coverage", 0.03);
    addDelta("cost", -0.03);
  }

  if (context?.pillLimit === "1-3") {
    addDelta("simplicity", 0.12);
    addDelta("coverage", -0.05);
    addDelta("dose", -0.02);
    addDelta("extras", -0.03);
  } else if (context?.pillLimit === "4-6") {
    addDelta("simplicity", 0.06);
    addDelta("coverage", -0.03);
  } else if (context?.pillLimit === "unlimited") {
    addDelta("coverage", 0.03);
    addDelta("simplicity", -0.03);
  }

  if (feedbackTypes.has("budget")) {
    addDelta("cost", 0.05);
  }

  if (feedbackTypes.has("capsule_limit")) {
    addDelta("simplicity", 0.08);
    addDelta("coverage", -0.03);
  }

  if (hasSafetyContext) {
    addDelta("dose", 0.05);
    addDelta("confidence", 0.05);
    addDelta("extras", -0.04);
    addDelta("coverage", -0.03);
  }

  for (const key of Object.keys(rawWeights) as Array<keyof V2Weights>) {
    rawWeights[key] = clamp(rawWeights[key], 0.05, 0.6);
  }

  const total = Object.values(rawWeights).reduce((sum, value) => sum + value, 0);
  const weights = Object.fromEntries(
    (Object.entries(rawWeights) as Array<[keyof V2Weights, number]>)
      .map(([key, value]) => [key, roundScore(value / total)])
  ) as unknown as V2Weights;

  return { deltas, weights };
}

export function v2ContextSignals(input: ProductRecommendationInput) {
  const context = input.clientContext;

  return {
    budgetAmount: budgetAmountFromContext(input),
    budgetPreference: context?.budgetPreference ?? null,
    clientSex: input.clientSex ?? null,
    conditions: contextArray(context?.conditions),
    currentSupplements: context?.currentSupplements ?? null,
    guidanceAdjustmentCount: context?.guidanceAdjustmentCount ?? 0,
    lifestage: context?.lifestage ?? null,
    medicationTypes: contextArray(context?.medicationTypes),
    medications: context?.medications ?? null,
    pillLimit: context?.pillLimit ?? null,
    planFeedbackTypes: contextArray(context?.planFeedbackTypes),
    preferredForm: context?.preferredForm ?? null
  };
}

export function safetyContextFromClientContext(
  context: ProductRecommendationClientContext | null | undefined
): V2SafetyContext {
  const medicationTypes = new Set(contextArray(context?.medicationTypes));
  const conditions = contextArray(context?.conditions).filter((item) => item !== "none");
  const lifestage = context?.lifestage?.toLowerCase() ?? "";

  return {
    bloodThinner: medicationTypes.has("blood-thinner"),
    hasConditionContext: conditions.length > 0,
    hasMedicationContext: context?.medications === "yes" || medicationTypes.size > 0,
    reproductiveCaution:
      lifestage.includes("pregnant") ||
      lifestage.includes("breastfeeding") ||
      lifestage.includes("ttc") ||
      lifestage.includes("trying")
  };
}

export function safetyContextBlockReasonForMask(
  safetyMask: number,
  context: V2SafetyContext
) {
  if (
    context.reproductiveCaution &&
    (
      safetyMask & SAFETY_FLAG_PREGNANCY_CAUTION ||
      safetyMask & SAFETY_FLAG_HORMONE_CAUTION
    )
  ) {
    return "Blocked by pregnancy, breastfeeding, or trying-to-conceive safety context";
  }

  return null;
}

export function safetyContextPenaltyForMask(
  safetyMask: number,
  context: V2SafetyContext
) {
  let penalty = 0;

  if (
    context.reproductiveCaution &&
    (
      safetyMask & SAFETY_FLAG_PREGNANCY_CAUTION ||
      safetyMask & SAFETY_FLAG_HORMONE_CAUTION
    )
  ) {
    penalty += 1;
  }

  if (
    context.hasMedicationContext &&
    safetyMask & SAFETY_FLAG_MEDICATION_INTERACTION
  ) {
    penalty += 0.8;
  }

  if (
    context.bloodThinner &&
    (
      safetyMask & SAFETY_FLAG_BLEEDING_RISK ||
      safetyMask & SAFETY_FLAG_MEDICATION_INTERACTION
    )
  ) {
    penalty += 1;
  }

  if (context.hasConditionContext && safetyMask & SAFETY_FLAG_CONDITION_CAUTION) {
    penalty += 0.5;
  }

  return clamp01(penalty);
}
