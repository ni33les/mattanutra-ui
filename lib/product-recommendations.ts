import {
  comparableDoseAmount,
  normalizeDoseUnit,
  parseDoseLimit
} from "@/lib/dose-conversion";
import { supplementProductNeeds } from "@/lib/product-recommendation-needs";
import {
  fuzzyTokensMatch,
  matchKeyAliases,
  normalizeProductFactKey,
  normalizeProductKey,
  productFactAliasKeys,
  productFactLooksLikeConcentration
} from "@/lib/product-key-matching";
import {
  confidenceMultiplier,
  diagnosticNeeds,
  exclusionReason,
  factAllowedForClient,
  factComparableAmount,
  factIssueExclusions,
  positiveNumber,
  productAudienceMismatchReason,
  productFactAudienceMismatchReason,
  safePercent,
  stackCoveragePercent,
  visibleCoveragePercent,
  whyProductMatches,
  type CoverageResult
} from "@/lib/product-recommendation-metrics";
import type {
  ProductClientSex,
  ProductCandidate,
  ProductCandidateFact,
  ProductRecommendationAlgorithmVersion,
  ProductRecommendationExclusion,
  ProductRecommendationSelection,
  ProductRecommendationResult,
  ProductRecommendationNeed,
  ProductRecommendationInput,
  ProductStackPreference,
  ProductRecommendationTrace
} from "@/lib/product-recommendation-types";
import {
  SAFETY_FLAG_BLEEDING_RISK,
  SAFETY_FLAG_CONDITION_CAUTION,
  SAFETY_FLAG_HORMONE_CAUTION,
  SAFETY_FLAG_MEDICATION_INTERACTION,
  SAFETY_FLAG_PREGNANCY_CAUTION,
  V2_ALGORITHM_VERSION,
  V2_BALANCED_MATERIAL_COVERAGE_DELTA_PERCENT,
  V2_COMPACT_CRITICAL_NEED_LOSS_TOLERANCE,
  V2_COMPACT_CRITICAL_WEIGHT_FLOOR,
  V2_COMPACT_MIN_COVERAGE_RATIO,
  V2_DIVERSITY_SCORE_EPSILON,
  V2_DUPLICATE_NEED_PRODUCT_PENALTY_WEIGHT,
  V2_EXCESSIVE_EXTRAS_PENALTY_WEIGHT,
  V2_EXTRA_SERVING_SIMPLICITY_PENALTY,
  V2_FULL_BEAM_ALGORITHM_VERSION,
  V2_FULL_BEAM_WIDTH,
  V2_MATERIAL_COVERAGE_DELTA_PERCENT,
  V2_MAX_SERVING_MULTIPLIER,
  V2_MIN_MARGINAL_PRODUCT_CONTRIBUTION_PERCENT,
  V2_MULTISERVING_REQUIRED_COVERAGE_GAIN_PERCENT,
  V2_PER_NEED_SHORTLIST,
  V2_SCORE_EPSILON,
  V2_SHORTLIST_LIMIT,
  V2_STACK_DOSE_LIMIT_SLACK_MULTIPLIER,
  V2_TINY_PARTIAL_PRODUCT_COVERAGE_CEILING,
  V2_TOP_AFFILIATE_SHORTLIST,
  V2_TOP_BROAD_SHORTLIST,
  V2_TOP_OVERALL_SHORTLIST,
  budgetAmountFromContext,
  clamp01,
  excessiveExtrasPenalty,
  normalizedV2Weights,
  roundScore,
  safetyContextBlockReasonForMask,
  safetyContextFromClientContext,
  safetyContextPenaltyForMask,
  usefulExtrasScore,
  v2ContextSignals,
  type V2Weights
} from "@/lib/product-recommendation-v2-config";
import { normalizeProductStackPreference } from "@/lib/product-stack-preferences";

export {
  normalizeProductFactKey,
  normalizeProductFactName,
  normalizeProductKey,
  productFactAliasKeys,
  productFactLooksLikeConcentration,
  productKeysMatch
} from "@/lib/product-key-matching";

export {
  buildProductNeeds,
  buildProductSearchQueries
} from "@/lib/product-recommendation-needs";

export { toRecommendedProduct } from "@/lib/product-recommendation-output";

export {
  PRODUCT_STACK_VARIANT_CONFIGS,
  normalizeProductStackPreference
} from "@/lib/product-stack-preferences";

export {
  ACTIVE_PRODUCT_RECOMMENDATION_ALGORITHM_VERSION,
  ACTIVE_PRODUCT_RECOMMENDATION_IMPLEMENTATION_VERSION
} from "@/lib/product-recommendation-v2-config";

export type {
  ProductStatus,
  ProductPlatform,
  ProductKind,
  ProductAudience,
  ProductClientSex,
  ProductAvailabilityStatus,
  ProductConfidence,
  ProductRecommendationNeed,
  ProductCandidateFact,
  ProductCandidate,
  ProductRecommendationExclusion,
  ProductRecommendationNeedDiagnostic,
  ProductRecommendationAlgorithmVersion,
  ProductStackPreference,
  ProductRecommendationDiagnostics,
  ProductRecommendationSelection,
  ProductRecommendationResult,
  ProductRecommendationClientContext,
  ProductRecommendationInput,
  ProductRecommendationTrace
} from "@/lib/product-recommendation-types";

export type { ProductStackVariantConfig } from "@/lib/product-stack-preferences";

const DEFAULT_MAX_COUNT = 6;
const TARGET_DOSE_SWEET_SPOT_MIN = 0.7;
const TARGET_DOSE_SWEET_SPOT_MAX = 1.3;
const TARGET_DOSE_SOFT_MAX = 1.5;

function bestAvailableCoverageByNeed(entries: readonly V2ProductEntry[]) {
  const coverageByNeed = new Map<string, number>();

  for (const entry of entries) {
    for (const need of entry.coverage.coveredNeeds) {
      coverageByNeed.set(
        need.id,
        Math.max(
          coverageByNeed.get(need.id) ?? 0,
          entry.coverage.coverageByNeed.get(need.id) ?? 0
        )
      );
    }
  }

  return coverageByNeed;
}

type V2NeedMetrics = Readonly<{
  comparableAmount: number | null;
  confidence: number;
  coverage: number;
  factsUsed: number;
  limitComparableAmount: number | null;
  matchScore: number;
  rawRatio: number | null;
}>;

type V2DoseContribution = Readonly<{
  comparableAmount: number;
  key: string;
  limitComparableAmount: number | null;
}>;

type V2ProductEntry = Readonly<{
  confidence: number;
  coverage: CoverageResult;
  doseContributions: V2DoseContribution[];
  extrasCount: number;
  metricsByNeed: Map<string, V2NeedMetrics>;
  product: ProductCandidate;
  servingMultiplier: number;
}>;

type V2StackScore = Readonly<{
  achievedCoverage: Map<string, number>;
  comparableByNeed: Map<string, number>;
  componentScores: Record<string, number>;
  entries: V2ProductEntry[];
  matchedNeedCount: number;
  matchedNeedWeight: number;
  overagePenalty: number;
  rawRatioByNeed: Map<string, number>;
  safetyContextPenalty: number;
  score: number;
  servingCount: number;
  supplementProductCoveragePercent: number;
  totalPlanCoveragePercent: number;
}>;

type V2BeamState = Readonly<{
  comparableCounts: number[];
  comparableSums: number[];
  componentScores: Record<string, number>;
  confidenceCoverageSums: number[];
  coverageProductCounts: number[];
  coverageSums: number[];
  doseLimitMins: Record<string, number>;
  doseSums: Record<string, number>;
  entries: V2ProductEntry[];
  extrasCount: number;
  indices: number[];
  limitMins: Array<number | null>;
  matchedNeedCount: number;
  matchedNeedWeight: number;
  overagePenalty: number;
  priceCount: number;
  priceSum: number;
  rawRatioCounts: number[];
  rawRatioSums: number[];
  safetyContextPenalty: number;
  safetyMask: number;
  score: number;
  servingCount: number;
  supplementProductCoveragePercent: number;
  totalPlanCoveragePercent: number;
}>;

function normalizedNeedWeightTotal(needs: readonly ProductRecommendationNeed[]) {
  return needs.reduce((total, need) => total + Math.max(0, need.weight), 0);
}

function factNeedMatchScore(
  fact: ProductCandidateFact,
  need: ProductRecommendationNeed
) {
  if (fact.itemType !== need.itemType && fact.itemType !== "nutrient") {
    return 0;
  }

  if (fact.itemType === "supplement" && fact.supplementId === need.sourceId) {
    return 1;
  }

  if (fact.itemType === "food" && fact.foodId === need.sourceId) {
    return 1;
  }

  const factName = fact.name || fact.normalizedName;
  const needName = need.displayName || need.normalizedName;
  const factDirectKey = normalizeProductFactKey(factName);
  const needDirectKey = normalizeProductFactKey(needName);

  if (
    factDirectKey &&
    (factDirectKey === need.normalizedName || factDirectKey === needDirectKey)
  ) {
    return 1;
  }

  const factAliases = matchKeyAliases(factName, fact.aliasKeys);
  const needAliases = matchKeyAliases(needName, need.aliasKeys);

  if ([...factAliases].some((alias) => needAliases.has(alias))) {
    return 0.9;
  }

  if (
    [...factAliases].some((leftKey) =>
      [...needAliases].some((rightKey) => fuzzyTokensMatch(leftKey, rightKey))
    )
  ) {
    return 0.7;
  }

  return 0;
}

function doseBandScore(ratio: number | null) {
  if (ratio === null || !Number.isFinite(ratio) || ratio <= 0) {
    return 0.8;
  }

  if (ratio < TARGET_DOSE_SWEET_SPOT_MIN) {
    return 0.4;
  }

  if (ratio <= TARGET_DOSE_SWEET_SPOT_MAX) {
    return 1;
  }

  if (ratio <= TARGET_DOSE_SOFT_MAX) {
    return 0.8;
  }

  return 0;
}

function comparableLimitAmount(
  fact: ProductCandidateFact,
  need: ProductRecommendationNeed
) {
  return comparableLimitAmountForName(fact, need.normalizedName);
}

function comparableLimitAmountForName(
  fact: ProductCandidateFact,
  normalizedName: string
) {
  const maxAmount = positiveNumber(fact.maxAmount);
  const maxUnit = fact.maxUnit ?? null;
  const limitDose = parseDoseLimit(maxAmount, maxUnit);

  if (!limitDose) {
    return null;
  }

  const comparableLimit = comparableDoseAmount(limitDose, normalizedName);

  if (comparableLimit !== null) {
    return comparableLimit;
  }

  const factUnit = normalizeDoseUnit(fact.unit ?? "");
  const limitUnit = normalizeDoseUnit(maxUnit ?? "");

  return factUnit && limitUnit && factUnit === limitUnit
    ? maxAmount
    : null;
}

function productFactStackDoseKeys(fact: ProductCandidateFact) {
  const aliases = [
    ...productFactAliasKeys(fact.name || fact.normalizedName, fact.aliasKeys),
    ...productFactAliasKeys(fact.normalizedName || fact.name, fact.aliasKeys)
  ];

  return [...new Set(aliases.filter(Boolean))];
}

function productStackDoseContributions(
  facts: readonly ProductCandidateFact[],
  servingMultiplier: number
) {
  const contributionsByKey = new Map<
    string,
    { comparableAmount: number; limitComparableAmount: number | null }
  >();

  for (const fact of facts) {
    const comparableAmount = factComparableAmount(fact);

    if (comparableAmount === null) {
      continue;
    }

    for (const key of productFactStackDoseKeys(fact)) {
      const limitComparableAmount = comparableLimitAmountForName(fact, key);
      const current = contributionsByKey.get(key);
      let nextLimitComparableAmount = current?.limitComparableAmount ?? null;

      if (limitComparableAmount !== null) {
        nextLimitComparableAmount =
          nextLimitComparableAmount === null
            ? limitComparableAmount
            : Math.min(nextLimitComparableAmount, limitComparableAmount);
      }

      contributionsByKey.set(key, {
        comparableAmount:
          (current?.comparableAmount ?? 0) +
          comparableAmount * Math.max(1, servingMultiplier),
        limitComparableAmount: nextLimitComparableAmount
      });
    }
  }

  return [...contributionsByKey.entries()].map(([key, contribution]) => ({
    key,
    ...contribution
  }));
}

function mergeStackDoseContributions(
  previousSums: Readonly<Record<string, number>>,
  previousLimits: Readonly<Record<string, number>>,
  contributions: readonly V2DoseContribution[]
) {
  const doseSums = { ...previousSums };
  const doseLimitMins = { ...previousLimits };
  const touchedKeys = new Set<string>();

  for (const contribution of contributions) {
    touchedKeys.add(contribution.key);
    doseSums[contribution.key] =
      (doseSums[contribution.key] ?? 0) + contribution.comparableAmount;

    if (contribution.limitComparableAmount !== null) {
      doseLimitMins[contribution.key] =
        doseLimitMins[contribution.key] === undefined
          ? contribution.limitComparableAmount
          : Math.min(
              doseLimitMins[contribution.key]!,
              contribution.limitComparableAmount
            );
    }
  }

  for (const key of touchedKeys) {
    const limit = doseLimitMins[key];

    if (
      limit !== undefined &&
      (doseSums[key] ?? 0) >
        limit * V2_STACK_DOSE_LIMIT_SLACK_MULTIPLIER + V2_SCORE_EPSILON
    ) {
      return null;
    }
  }

  return { doseLimitMins, doseSums };
}

function factNeedMetric(
  fact: ProductCandidateFact,
  need: ProductRecommendationNeed,
  servingMultiplier = 1
): V2NeedMetrics | null {
  if (
    productFactLooksLikeConcentration(fact.name) ||
    productFactLooksLikeConcentration(fact.normalizedName)
  ) {
    return null;
  }

  const matchScore = factNeedMatchScore(fact, need);

  if (matchScore <= 0) {
    return null;
  }

  const confidence = confidenceMultiplier(fact.confidence);
  const baseComparableAmount = factComparableAmount(fact);
  const comparableAmount =
    baseComparableAmount !== null
      ? baseComparableAmount * Math.max(1, servingMultiplier)
      : null;
  const limitComparableAmount = comparableLimitAmount(fact, need);
  const needHasTargetDose =
    need.targetComparableAmount !== null && need.targetComparableAmount > 0;

  if (needHasTargetDose && comparableAmount === null) {
    return null;
  }

  if (
    comparableAmount !== null &&
    needHasTargetDose
  ) {
    const rawRatio = comparableAmount / need.targetComparableAmount;
    const overageMultiplier = rawRatio > TARGET_DOSE_SOFT_MAX ? 0.6 : 1;
    const coverage = clamp01(
      Math.min(1, rawRatio) *
      matchScore *
      confidence *
      overageMultiplier
    );

    return {
      comparableAmount,
      confidence,
      coverage,
      factsUsed: 1,
      limitComparableAmount,
      matchScore,
      rawRatio,
      // Keep dose band in the metric through confidence/coverage users.
      // The stack scorer recomputes precision from the summed raw ratio.
    };
  }

  return {
    comparableAmount,
    confidence,
    coverage: 0.75 * matchScore * confidence,
    factsUsed: 1,
    limitComparableAmount,
    matchScore,
    rawRatio: null
  };
}

function combineNeedMetrics(metrics: V2NeedMetrics[]): V2NeedMetrics | null {
  if (metrics.length < 1) {
    return null;
  }

  const comparableAmounts = metrics
    .map((metric) => metric.comparableAmount)
    .filter((value): value is number => typeof value === "number");
  const rawRatios = metrics
    .map((metric) => metric.rawRatio)
    .filter((value): value is number => typeof value === "number");
  const limits = metrics
    .map((metric) => metric.limitComparableAmount)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const coverage = clamp01(
    metrics.reduce((total, metric) => total + metric.coverage, 0)
  );
  const confidence = metrics.reduce(
    (total, metric) => total + metric.confidence * metric.coverage,
    0
  ) / Math.max(coverage, 0.0001);
  const matchScore = metrics.reduce(
    (total, metric) => total + metric.matchScore * metric.coverage,
    0
  ) / Math.max(coverage, 0.0001);

  return {
    comparableAmount:
      comparableAmounts.length > 0
        ? comparableAmounts.reduce((total, value) => total + value, 0)
        : null,
    confidence: clamp01(confidence),
    coverage,
    factsUsed: metrics.reduce((total, metric) => total + metric.factsUsed, 0),
    limitComparableAmount: limits.length > 0 ? Math.min(...limits) : null,
    matchScore: clamp01(matchScore),
    rawRatio:
      rawRatios.length > 0
        ? rawRatios.reduce((total, value) => total + value, 0)
        : null
  };
}

function productCoverageV2(
  product: ProductCandidate,
  needs: ProductRecommendationNeed[],
  clientSex?: ProductClientSex | null,
  servingMultiplier = 1
): V2ProductEntry {
  const metricsByNeed = new Map<string, V2NeedMetrics>();
  const coverageByNeed = new Map<string, number>();
  const coveredNeeds: ProductRecommendationNeed[] = [];
  const facts = product.facts.filter((fact) => factAllowedForClient(fact, clientSex));
  const neededNames = new Set(
    needs.flatMap((need) =>
      [...matchKeyAliases(need.displayName || need.normalizedName, need.aliasKeys)]
    )
  );

  for (const need of needs) {
    const metrics = facts
      .map((fact) => factNeedMetric(fact, need, servingMultiplier))
      .filter((metric): metric is V2NeedMetrics => Boolean(metric));
    const combined = combineNeedMetrics(metrics);

    if (combined && combined.coverage > 0) {
      metricsByNeed.set(need.id, combined);
      coverageByNeed.set(need.id, combined.coverage);
      coveredNeeds.push(need);
    }
  }

  const totalWeight = normalizedNeedWeightTotal(needs);
  const weightedCoverage = coveredNeeds.reduce(
    (total, need) => total + need.weight * (coverageByNeed.get(need.id) ?? 0),
    0
  );
  const extrasCount = facts.filter((fact) =>
    ![...matchKeyAliases(fact.name || fact.normalizedName, fact.aliasKeys)]
      .some((alias) => neededNames.has(alias))
  ).length;
  const confidenceNumerator = [...metricsByNeed.values()].reduce(
    (total, metric) => total + metric.confidence * metric.coverage,
    0
  );
  const confidenceDenominator = [...metricsByNeed.values()].reduce(
    (total, metric) => total + metric.coverage,
    0
  );

  return {
    confidence: confidenceDenominator > 0
      ? clamp01(confidenceNumerator / confidenceDenominator)
      : 0,
    coverage: {
      coverageByNeed,
      coveredNeeds,
      percent: totalWeight > 0 ? (weightedCoverage / totalWeight) * 100 : 0
    },
    doseContributions: productStackDoseContributions(facts, servingMultiplier),
    extrasCount,
    metricsByNeed,
    product,
    servingMultiplier
  };
}

function productServingMultiplierAllowed(
  product: ProductCandidate,
  servingMultiplier: number
) {
  if (servingMultiplier <= 1) {
    return true;
  }

  if (!product.facts.some((fact) => fact.servingLabel?.trim())) {
    return false;
  }

  for (const fact of product.facts) {
    const comparableAmount = factComparableAmount(fact);
    const limitComparableAmounts = productFactStackDoseKeys(fact)
      .map((key) => comparableLimitAmountForName(fact, key))
      .filter(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value) && value > 0
      );
    const limitComparableAmount = limitComparableAmounts.length > 0
      ? Math.min(...limitComparableAmounts)
      : null;

    if (comparableAmount !== null && limitComparableAmount === null) {
      return false;
    }

    if (
      comparableAmount !== null &&
      limitComparableAmount !== null &&
      comparableAmount * servingMultiplier > limitComparableAmount + V2_SCORE_EPSILON
    ) {
      return false;
    }
  }

  return true;
}

function productServingMultipliers(product: ProductCandidate) {
  return Array.from({ length: V2_MAX_SERVING_MULTIPLIER }, (_, index) => index + 1)
    .filter((servingMultiplier) =>
      productServingMultiplierAllowed(product, servingMultiplier)
    );
}

function compareProductEntries(
  first: V2ProductEntry,
  second: V2ProductEntry
) {
  const coverageDelta = second.coverage.percent - first.coverage.percent;

  if (
    first.servingMultiplier !== second.servingMultiplier &&
    Math.abs(coverageDelta) < V2_MULTISERVING_REQUIRED_COVERAGE_GAIN_PERCENT
  ) {
    return first.servingMultiplier - second.servingMultiplier;
  }

  if (Math.abs(coverageDelta) > V2_SCORE_EPSILON) {
    return coverageDelta;
  }

  const firstAffiliate = first.product.activeAffiliateUrl ? 1 : 0;
  const secondAffiliate = second.product.activeAffiliateUrl ? 1 : 0;

  if (firstAffiliate !== secondAffiliate) {
    return secondAffiliate - firstAffiliate;
  }

  const priceDelta =
    (first.product.priceAmount ?? Number.MAX_SAFE_INTEGER) -
    (second.product.priceAmount ?? Number.MAX_SAFE_INTEGER);

  if (priceDelta !== 0) {
    return priceDelta;
  }

  if (first.servingMultiplier !== second.servingMultiplier) {
    return first.servingMultiplier - second.servingMultiplier;
  }

  const titleDelta = first.product.title.localeCompare(second.product.title);

  return titleDelta || first.product.id.localeCompare(second.product.id);
}

function productVariantTitleKey(product: ProductCandidate) {
  let key = normalizeProductKey(product.title);

  key = key
    .replace(/_(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)_packs?$/g, "")
    .replace(/_packs?_of_(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/g, "")
    .replace(/_(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)_bottles?$/g, "")
    .replace(/_bundle$/g, "")
    .replace(/_set$/g, "");

  return key || normalizeProductKey(product.title);
}

function productFactSignature(product: ProductCandidate) {
  return product.facts
    .filter((fact) => fact.itemType === "supplement" || fact.itemType === "nutrient")
    .map((fact) => [
      fact.supplementId ?? "",
      fact.normalizedName || normalizeProductFactKey(fact.name),
      String(fact.amount ?? ""),
      normalizeDoseUnit(fact.unit ?? "") ?? fact.unit ?? ""
    ].join(":"))
    .sort()
    .join("|");
}

function productVariantKey(product: ProductCandidate) {
  return [
    normalizeProductKey(product.brandName ?? ""),
    productVariantTitleKey(product),
    productFactSignature(product)
  ].join("|");
}

function shortlistEntries(
  entries: readonly V2ProductEntry[],
  needs: readonly ProductRecommendationNeed[]
) {
  const selected = new Map<string, { entry: V2ProductEntry; priority: number }>();
  const addEntry = (entry: V2ProductEntry, priority: number) => {
    const current = selected.get(entry.product.id);

    if (
      !current ||
      priority < current.priority ||
      (
        priority === current.priority &&
        compareProductEntries(entry, current.entry) < 0
      )
    ) {
      selected.set(entry.product.id, { entry, priority });
    }
  };
  const needsByPriority = [...needs]
    .sort((first, second) => second.weight - first.weight);

  for (const [needIndex, need] of needsByPriority.entries()) {
    [...entries]
      .filter((entry) => (entry.coverage.coverageByNeed.get(need.id) ?? 0) > 0)
      .sort((first, second) => {
        const needDelta =
          (second.coverage.coverageByNeed.get(need.id) ?? 0) -
          (first.coverage.coverageByNeed.get(need.id) ?? 0);

        return Math.abs(needDelta) > V2_SCORE_EPSILON
          ? needDelta
          : compareProductEntries(first, second);
      })
      .slice(0, V2_PER_NEED_SHORTLIST)
      .forEach((entry) => addEntry(entry, needIndex));
  }

  [...entries]
    .sort(compareProductEntries)
    .slice(0, V2_TOP_OVERALL_SHORTLIST)
    .forEach((entry, index) => addEntry(entry, 100 + index));

  [...entries]
    .filter((entry) =>
      entry.product.productKind === "multi" ||
      entry.product.facts.length >= 6 ||
      entry.coverage.coveredNeeds.length >= 3
    )
    .sort(compareProductEntries)
    .slice(0, V2_TOP_BROAD_SHORTLIST)
    .forEach((entry, index) => addEntry(entry, 200 + index));

  [...entries]
    .filter((entry) => Boolean(entry.product.activeAffiliateUrl))
    .sort(compareProductEntries)
    .slice(0, V2_TOP_AFFILIATE_SHORTLIST)
    .forEach((entry, index) => addEntry(entry, 300 + index));

  return [...selected.values()]
    .sort((first, second) =>
      first.priority - second.priority ||
      compareProductEntries(first.entry, second.entry)
    )
    .map((item) => item.entry)
    .slice(0, V2_SHORTLIST_LIMIT);
}

function productSafetyMask(entry: V2ProductEntry) {
  let mask = 0;

  for (const fact of entry.product.facts) {
    for (const flag of fact.safetyFlags ?? []) {
      switch (flag) {
        case "pregnancy_caution":
          mask |= SAFETY_FLAG_PREGNANCY_CAUTION;
          break;
        case "medication_interaction":
          mask |= SAFETY_FLAG_MEDICATION_INTERACTION;
          break;
        case "bleeding_risk":
          mask |= SAFETY_FLAG_BLEEDING_RISK;
          break;
        case "condition_caution":
          mask |= SAFETY_FLAG_CONDITION_CAUTION;
          break;
        case "hormone_caution":
          mask |= SAFETY_FLAG_HORMONE_CAUTION;
          break;
        default:
          break;
      }
    }
  }

  return mask;
}

function totalStackPrice(entries: readonly V2ProductEntry[]) {
  const prices = entries
    .map((entry) => entry.product.priceAmount)
    .filter((value): value is number => typeof value === "number" && value > 0);

  return prices.length > 0
    ? prices.reduce((total, value) => total + value, 0)
    : null;
}

function stackContributionMaps(
  entries: readonly V2ProductEntry[],
  needs: readonly ProductRecommendationNeed[]
) {
  const achievedCoverage = new Map<string, number>();
  const comparableByNeed = new Map<string, number>();
  const rawRatioByNeed = new Map<string, number>();
  const limitsByNeed = new Map<string, number>();

  for (const need of needs) {
    let coverageSum = 0;
    let comparableSum = 0;
    let comparableSeen = false;
    let rawRatioSum = 0;
    let rawRatioSeen = false;
    let limit: number | null = null;

    for (const entry of entries) {
      const metrics = entry.metricsByNeed.get(need.id);

      if (!metrics) {
        continue;
      }

      coverageSum += metrics.coverage;

      if (metrics.comparableAmount !== null) {
        comparableSeen = true;
        comparableSum += metrics.comparableAmount;
      }

      if (metrics.rawRatio !== null) {
        rawRatioSeen = true;
        rawRatioSum += metrics.rawRatio;
      }

      if (metrics.limitComparableAmount !== null) {
        limit =
          limit === null
            ? metrics.limitComparableAmount
            : Math.min(limit, metrics.limitComparableAmount);
      }
    }

    achievedCoverage.set(need.id, clamp01(coverageSum));

    if (comparableSeen) {
      comparableByNeed.set(need.id, comparableSum);
    }

    if (rawRatioSeen) {
      rawRatioByNeed.set(need.id, rawRatioSum);
    }

    if (limit !== null) {
      limitsByNeed.set(need.id, limit);
    }
  }

  return {
    achievedCoverage,
    comparableByNeed,
    limitsByNeed,
    rawRatioByNeed
  };
}

function stackCoverageForNeeds(
  entries: readonly V2ProductEntry[],
  needs: readonly ProductRecommendationNeed[]
) {
  return stackContributionMaps(entries, needs).achievedCoverage;
}

function marginalCoverageContributionPercent(
  metrics: readonly (V2NeedMetrics | null)[],
  currentCoverageSums: readonly number[],
  needs: readonly ProductRecommendationNeed[]
) {
  const totalWeight = normalizedNeedWeightTotal(needs);

  if (totalWeight <= 0) {
    return 0;
  }

  const weightedGain = needs.reduce((total, need, needIndex) => {
    const metric = metrics[needIndex];

    if (!metric || metric.coverage <= V2_SCORE_EPSILON) {
      return total;
    }

    const currentCoverage = clamp01(currentCoverageSums[needIndex] ?? 0);
    const nextCoverage = clamp01(currentCoverage + metric.coverage);

    return total + Math.max(0, nextCoverage - currentCoverage) * need.weight;
  }, 0);

  return (weightedGain / totalWeight) * 100;
}

function hasOnlyTinyPartialCoverage(metrics: readonly (V2NeedMetrics | null)[]) {
  return metrics.every(
    (metric) =>
      !metric ||
      metric.coverage <= V2_SCORE_EPSILON ||
      metric.coverage < V2_TINY_PARTIAL_PRODUCT_COVERAGE_CEILING
  );
}

function stackFingerprint(stack: V2StackScore) {
  return stack.entries
    .map((entry) => `${entry.product.id}:${entry.servingMultiplier}`)
    .sort()
    .join("|");
}

function stackCoverageFingerprint(
  stack: V2StackScore,
  needs: readonly ProductRecommendationNeed[]
) {
  return needs
    .map((need) => {
      const achieved = stack.achievedCoverage.get(need.id) ?? 0;

      return `${need.id}:${Math.round(achieved * 1000)}`;
    })
    .join("|");
}

function uniqueStackScores(scores: readonly V2StackScore[]) {
  const seen = new Set<string>();
  const unique: V2StackScore[] = [];

  for (const score of scores) {
    const key = stackFingerprint(score);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(score);
  }

  return unique;
}

function compareStackScores(first: V2StackScore, second: V2StackScore) {
  const coverageDelta =
    second.supplementProductCoveragePercent - first.supplementProductCoveragePercent;

  if (Math.abs(coverageDelta) >= V2_MATERIAL_COVERAGE_DELTA_PERCENT) {
    return coverageDelta;
  }

  const matchedCountDelta = second.matchedNeedCount - first.matchedNeedCount;

  if (matchedCountDelta !== 0) {
    return matchedCountDelta;
  }

  const matchedWeightDelta = second.matchedNeedWeight - first.matchedNeedWeight;

  if (Math.abs(matchedWeightDelta) > V2_SCORE_EPSILON) {
    return matchedWeightDelta;
  }

  if (Math.abs(coverageDelta) > V2_SCORE_EPSILON) {
    return coverageDelta;
  }

  const scoreDelta = second.score - first.score;

  if (Math.abs(scoreDelta) > V2_DIVERSITY_SCORE_EPSILON) {
    return scoreDelta;
  }

  const firstAffiliate = first.entries.some((entry) => entry.product.activeAffiliateUrl) ? 1 : 0;
  const secondAffiliate = second.entries.some((entry) => entry.product.activeAffiliateUrl) ? 1 : 0;

  if (firstAffiliate !== secondAffiliate) {
    return secondAffiliate - firstAffiliate;
  }

  if (first.entries.length !== second.entries.length) {
    return first.entries.length - second.entries.length;
  }

  const firstPrice = totalStackPrice(first.entries) ?? Number.MAX_SAFE_INTEGER;
  const secondPrice = totalStackPrice(second.entries) ?? Number.MAX_SAFE_INTEGER;

  if (firstPrice !== secondPrice) {
    return firstPrice - secondPrice;
  }

  return first.entries.map((entry) => entry.product.id).join("|")
    .localeCompare(second.entries.map((entry) => entry.product.id).join("|"));
}

function compareBalancedStackScores(first: V2StackScore, second: V2StackScore) {
  const coverageDelta =
    second.supplementProductCoveragePercent - first.supplementProductCoveragePercent;

  if (Math.abs(coverageDelta) >= V2_BALANCED_MATERIAL_COVERAGE_DELTA_PERCENT) {
    return coverageDelta;
  }

  const matchedWeightDelta = second.matchedNeedWeight - first.matchedNeedWeight;

  if (Math.abs(matchedWeightDelta) > V2_SCORE_EPSILON) {
    return matchedWeightDelta;
  }

  const matchedCountDelta = second.matchedNeedCount - first.matchedNeedCount;

  if (matchedCountDelta !== 0) {
    return matchedCountDelta;
  }

  // Inside the same balanced coverage band, prefer fewer extra servings.
  const extraServingDelta = extraServingCount(first) - extraServingCount(second);

  if (extraServingDelta !== 0) {
    return extraServingDelta;
  }

  const scoreDelta = second.score - first.score;

  if (Math.abs(scoreDelta) > V2_DIVERSITY_SCORE_EPSILON) {
    return scoreDelta;
  }

  if (Math.abs(coverageDelta) > V2_SCORE_EPSILON) {
    return coverageDelta;
  }

  return compareStackScores(first, second);
}

function compareCoverageStackScores(
  first: V2StackScore,
  second: V2StackScore
) {
  const coverageDelta =
    second.supplementProductCoveragePercent - first.supplementProductCoveragePercent;

  if (Math.abs(coverageDelta) > V2_SCORE_EPSILON) {
    return coverageDelta;
  }

  return compareStackScores(first, second);
}

function extraServingCount(score: V2StackScore) {
  return Math.max(0, score.servingCount - score.entries.length);
}

function preservesCriticalNeedsForCompactMode(
  candidate: V2StackScore,
  bestCoverageStack: V2StackScore,
  needs: readonly ProductRecommendationNeed[]
) {
  const maxWeight = Math.max(0, ...needs.map((need) => need.weight));
  const criticalWeight = Math.max(
    V2_COMPACT_CRITICAL_WEIGHT_FLOOR,
    maxWeight * 0.9
  );

  return needs
    .filter((need) => need.weight >= criticalWeight)
    .every((need) => {
      const bestCoverage = bestCoverageStack.achievedCoverage.get(need.id) ?? 0;

      if (bestCoverage <= V2_SCORE_EPSILON) {
        return true;
      }

      const candidateCoverage = candidate.achievedCoverage.get(need.id) ?? 0;

      return (
        bestCoverage - candidateCoverage <=
        V2_COMPACT_CRITICAL_NEED_LOSS_TOLERANCE
      );
    });
}

function compareCompactStackScores(
  first: V2StackScore,
  second: V2StackScore
) {
  if (first.entries.length !== second.entries.length) {
    return first.entries.length - second.entries.length;
  }

  if (first.servingCount !== second.servingCount) {
    return first.servingCount - second.servingCount;
  }

  return compareStackScores(first, second);
}

function selectStackForPreference(
  scores: readonly V2StackScore[],
  needs: readonly ProductRecommendationNeed[],
  stackPreference: ProductStackPreference
) {
  const uniqueScores = uniqueStackScores(scores);

  if (uniqueScores.length < 1) {
    return null;
  }

  if (stackPreference !== "compact") {
    return [...uniqueScores].sort(compareBalancedStackScores)[0] ?? null;
  }

  const bestCoverageStack =
    [...uniqueScores].sort(compareCoverageStackScores)[0] ?? uniqueScores[0]!;
  const minimumCoverage =
    bestCoverageStack.supplementProductCoveragePercent *
    V2_COMPACT_MIN_COVERAGE_RATIO;
  const compactCandidates = uniqueScores.filter(
    (score) =>
      score.supplementProductCoveragePercent >= minimumCoverage &&
      preservesCriticalNeedsForCompactMode(score, bestCoverageStack, needs)
  );

  return [...(compactCandidates.length > 0 ? compactCandidates : uniqueScores)]
    .sort(compareCompactStackScores)[0] ?? null;
}

function distinctAlternativeStacks(
  scores: readonly V2StackScore[],
  bestStack: V2StackScore | null,
  needs: readonly ProductRecommendationNeed[],
  limit = 3
) {
  const bestKey = bestStack ? stackFingerprint(bestStack) : null;
  const selected: V2StackScore[] = [];
  const selectedKeys = new Set<string>();
  const selectedCoverageKeys = new Set<string>();
  const addStack = (stack: V2StackScore, requireCoverageDifference: boolean) => {
    if (selected.length >= limit) {
      return;
    }

    const key = stackFingerprint(stack);

    if (key === bestKey || selectedKeys.has(key)) {
      return;
    }

    const coverageKey = stackCoverageFingerprint(stack, needs);

    if (
      requireCoverageDifference &&
      (
        (bestStack && coverageKey === stackCoverageFingerprint(bestStack, needs)) ||
        selectedCoverageKeys.has(coverageKey)
      )
    ) {
      return;
    }

    selectedKeys.add(key);
    selectedCoverageKeys.add(coverageKey);
    selected.push(stack);
  };
  const uniqueScores = uniqueStackScores(scores).sort(compareStackScores);

  for (const stack of uniqueScores) {
    addStack(stack, true);
  }

  for (const stack of uniqueScores) {
    addStack(stack, false);
  }

  return selected;
}

function compareBeamStates(first: V2BeamState, second: V2BeamState) {
  const coverageDelta =
    second.supplementProductCoveragePercent - first.supplementProductCoveragePercent;

  if (Math.abs(coverageDelta) >= V2_MATERIAL_COVERAGE_DELTA_PERCENT) {
    return coverageDelta;
  }

  const matchedWeightDelta = second.matchedNeedWeight - first.matchedNeedWeight;

  if (Math.abs(matchedWeightDelta) > V2_SCORE_EPSILON) {
    return matchedWeightDelta;
  }

  const matchedCountDelta = second.matchedNeedCount - first.matchedNeedCount;

  if (matchedCountDelta !== 0) {
    return matchedCountDelta;
  }

  if (Math.abs(coverageDelta) > V2_SCORE_EPSILON) {
    return coverageDelta;
  }

  const scoreDelta = second.score - first.score;

  if (Math.abs(scoreDelta) > V2_DIVERSITY_SCORE_EPSILON) {
    return scoreDelta;
  }

  const firstAffiliate = first.entries.some((entry) => entry.product.activeAffiliateUrl) ? 1 : 0;
  const secondAffiliate = second.entries.some((entry) => entry.product.activeAffiliateUrl) ? 1 : 0;

  if (firstAffiliate !== secondAffiliate) {
    return secondAffiliate - firstAffiliate;
  }

  if (first.entries.length !== second.entries.length) {
    return first.entries.length - second.entries.length;
  }

  const firstPrice = first.priceCount > 0 ? first.priceSum : Number.MAX_SAFE_INTEGER;
  const secondPrice = second.priceCount > 0 ? second.priceSum : Number.MAX_SAFE_INTEGER;

  if (firstPrice !== secondPrice) {
    return firstPrice - secondPrice;
  }

  return first.entries.map((entry) => entry.product.id).join("|")
    .localeCompare(second.entries.map((entry) => entry.product.id).join("|"));
}

function beamStateKey(indices: readonly number[]) {
  return indices.join("|");
}

function selectDiverseBeamStates(
  states: readonly V2BeamState[],
  beamWidth: number,
  scoringNeeds: readonly ProductRecommendationNeed[]
) {
  const sorted = [...states].sort(compareBeamStates);
  const selected: V2BeamState[] = [];
  const selectedKeys = new Set<string>();
  const addState = (state: V2BeamState | undefined) => {
    if (!state || selected.length >= beamWidth) {
      return;
    }

    const key = beamStateKey(state.indices);

    if (selectedKeys.has(key)) {
      return;
    }

    selectedKeys.add(key);
    selected.push(state);
  };
  const utilitySlots = Math.max(
    Math.ceil(beamWidth / 2),
    beamWidth - scoringNeeds.length
  );

  for (const state of sorted.slice(0, utilitySlots)) {
    addState(state);
  }

  for (const [needIndex] of scoringNeeds.entries()) {
    const needLeader = sorted
      .filter((state) => (state.coverageSums[needIndex] ?? 0) > 0)
      .sort((first, second) =>
        clamp01(second.coverageSums[needIndex] ?? 0) -
          clamp01(first.coverageSums[needIndex] ?? 0) ||
        compareBeamStates(first, second)
      )[0];

    addState(needLeader);
  }

  for (const state of sorted) {
    addState(state);
  }

  return selected;
}

function selectFinalBeamStates(
  states: readonly V2BeamState[],
  statesBySize: ReadonlyMap<number, readonly V2BeamState[]>,
  keepTop: number,
  scoringNeeds: readonly ProductRecommendationNeed[]
) {
  const selected: V2BeamState[] = [];
  const selectedKeys = new Set<string>();
  const addState = (state: V2BeamState | undefined) => {
    if (!state || selected.length >= keepTop) {
      return;
    }

    const key = beamStateKey(state.indices);

    if (selectedKeys.has(key)) {
      return;
    }

    selectedKeys.add(key);
    selected.push(state);
  };
  const sizeLeaders = [...statesBySize.entries()]
    .sort(([firstSize], [secondSize]) => firstSize - secondSize)
    .flatMap(([, sizeStates]) =>
      [...sizeStates].sort(compareBeamStates).slice(0, 4)
    );
  const utilityLeaders = selectDiverseBeamStates(
    states,
    keepTop,
    scoringNeeds
  );
  const sortedStates = [...states].sort(compareBeamStates);

  for (const state of sizeLeaders) {
    addState(state);
  }

  for (const state of utilityLeaders) {
    addState(state);
  }

  for (const state of sortedStates) {
    addState(state);
  }

  return selected.sort(compareBeamStates);
}

function beamStateToStackScore(
  state: V2BeamState,
  scoringNeeds: readonly ProductRecommendationNeed[]
): V2StackScore {
  const achievedCoverage = new Map<string, number>();
  const comparableByNeed = new Map<string, number>();
  const rawRatioByNeed = new Map<string, number>();

  for (const [needIndex, need] of scoringNeeds.entries()) {
    achievedCoverage.set(need.id, clamp01(state.coverageSums[needIndex] ?? 0));

    if ((state.comparableCounts[needIndex] ?? 0) > 0) {
      comparableByNeed.set(need.id, state.comparableSums[needIndex] ?? 0);
    }

    if ((state.rawRatioCounts[needIndex] ?? 0) > 0) {
      rawRatioByNeed.set(need.id, state.rawRatioSums[needIndex] ?? 0);
    }
  }

  return {
    achievedCoverage,
    comparableByNeed,
    componentScores: state.componentScores,
    entries: [...state.entries],
    matchedNeedCount: state.matchedNeedCount,
    matchedNeedWeight: state.matchedNeedWeight,
    overagePenalty: state.overagePenalty,
    rawRatioByNeed,
    safetyContextPenalty: state.safetyContextPenalty,
    score: state.score,
    servingCount: state.servingCount,
    supplementProductCoveragePercent: state.supplementProductCoveragePercent,
    totalPlanCoveragePercent: state.totalPlanCoveragePercent
  };
}

function beamSearchStackScores(
  entries: readonly V2ProductEntry[],
  input: ProductRecommendationInput,
  scoringNeeds: readonly ProductRecommendationNeed[],
  allNeeds: readonly ProductRecommendationNeed[],
  weights: V2Weights,
  maxProducts: number,
  beamWidth = V2_FULL_BEAM_WIDTH,
  keepTop = 4
) {
  const orderedEntries = [...entries].sort(compareProductEntries);
  const metricsMatrix = orderedEntries.map((entry) =>
    scoringNeeds.map((need) => entry.metricsByNeed.get(need.id) ?? null)
  );
  const entrySafetyMasks = orderedEntries.map(productSafetyMask);
  const safetyContext = safetyContextFromClientContext(input.clientContext);
  const totalWeight = normalizedNeedWeightTotal(scoringNeeds);
  const productNeeds = supplementProductNeeds(allNeeds);
  const productNeedsWeight = normalizedNeedWeightTotal(productNeeds);
  const allNeedsWeight = normalizedNeedWeightTotal(allNeeds);
  const budgetAmount = budgetAmountFromContext(input);
  const seen = new Set<string>();
  const topStates: V2BeamState[] = [];
  const topStatesBySize = new Map<number, V2BeamState[]>();
  let evaluatedStackCount = 0;
  const topStateLimit = Math.max(keepTop, beamWidth);
  const keepState = (state: V2BeamState) => {
    topStates.push(state);
    topStates.sort(compareBeamStates);

    if (topStates.length > topStateLimit) {
      topStates.length = topStateLimit;
    }

    const size = state.entries.length;
    const sizeStates = topStatesBySize.get(size) ?? [];
    sizeStates.push(state);
    sizeStates.sort(compareBeamStates);

    if (sizeStates.length > Math.max(8, Math.ceil(beamWidth / 2))) {
      sizeStates.length = Math.max(8, Math.ceil(beamWidth / 2));
    }

    topStatesBySize.set(size, sizeStates);
  };
  const buildState = (
    previous: V2BeamState | null,
    entryIndex: number
  ): V2BeamState | null => {
    const entry = orderedEntries[entryIndex]!;

    if (previous?.entries.some((item) => item.product.id === entry.product.id)) {
      return null;
    }

    if (
      previous?.entries.some((item) =>
        productVariantKey(item.product) === productVariantKey(entry.product)
      )
    ) {
      return null;
    }

    if (previous) {
      const coveredNeedIndexes = metricsMatrix[entryIndex]!
        .map((metric, needIndex) =>
          metric && metric.coverage > V2_SCORE_EPSILON ? needIndex : null
        )
        .filter((needIndex): needIndex is number => needIndex !== null);

      if (
        coveredNeedIndexes.length > 0 &&
        coveredNeedIndexes.every((needIndex) =>
          (previous.coverageProductCounts[needIndex] ?? 0) > 0
        )
      ) {
        return null;
      }

      if (
        coveredNeedIndexes.length > 0 &&
        coveredNeedIndexes.every((needIndex) =>
          (previous.coverageSums[needIndex] ?? 0) > V2_SCORE_EPSILON
        ) &&
        coveredNeedIndexes.every((needIndex) =>
          (previous.coverageSums[needIndex] ?? 0) >= TARGET_DOSE_SWEET_SPOT_MIN ||
          (metricsMatrix[entryIndex]![needIndex]?.coverage ?? 0) >=
            TARGET_DOSE_SWEET_SPOT_MIN
        )
      ) {
        return null;
      }

      if (
        hasOnlyTinyPartialCoverage(metricsMatrix[entryIndex]!) &&
        marginalCoverageContributionPercent(
          metricsMatrix[entryIndex]!,
          previous.coverageSums,
          scoringNeeds
        ) < V2_MIN_MARGINAL_PRODUCT_CONTRIBUTION_PERCENT
      ) {
        return null;
      }
    }

    const nextIndices = previous
      ? [...previous.indices, entryIndex].sort((first, second) => first - second)
      : [entryIndex];
    const key = beamStateKey(nextIndices);

    if (seen.has(key)) {
      return null;
    }

    seen.add(key);
    evaluatedStackCount += 1;

    const coverageSums = previous
      ? [...previous.coverageSums]
      : scoringNeeds.map(() => 0);
    const coverageProductCounts = previous
      ? [...previous.coverageProductCounts]
      : scoringNeeds.map(() => 0);
    const comparableSums = previous
      ? [...previous.comparableSums]
      : scoringNeeds.map(() => 0);
    const comparableCounts = previous
      ? [...previous.comparableCounts]
      : scoringNeeds.map(() => 0);
    const rawRatioSums = previous
      ? [...previous.rawRatioSums]
      : scoringNeeds.map(() => 0);
    const rawRatioCounts = previous
      ? [...previous.rawRatioCounts]
      : scoringNeeds.map(() => 0);
    const confidenceCoverageSums = previous
      ? [...previous.confidenceCoverageSums]
      : scoringNeeds.map(() => 0);
    const limitMins = previous
      ? [...previous.limitMins]
      : scoringNeeds.map((): number | null => null);
    const nextDoseState = mergeStackDoseContributions(
      previous?.doseSums ?? {},
      previous?.doseLimitMins ?? {},
      entry.doseContributions
    );

    if (!nextDoseState) {
      return null;
    }

    let extrasCount = previous?.extrasCount ?? 0;
    let priceCount = previous?.priceCount ?? 0;
    let priceSum = previous?.priceSum ?? 0;
    let servingCount = previous?.servingCount ?? 0;
    const safetyMask = (previous?.safetyMask ?? 0) | (entrySafetyMasks[entryIndex] ?? 0);

    extrasCount += entry.extrasCount;
    servingCount += entry.servingMultiplier;

    if (typeof entry.product.priceAmount === "number" && entry.product.priceAmount > 0) {
      priceCount += 1;
      priceSum += entry.product.priceAmount;
    }

    for (const [needIndex, metric] of metricsMatrix[entryIndex]!.entries()) {
      if (!metric) {
        continue;
      }

      coverageSums[needIndex] += metric.coverage;
      if (metric.coverage > V2_SCORE_EPSILON) {
        coverageProductCounts[needIndex] += 1;
      }
      confidenceCoverageSums[needIndex] += metric.confidence * metric.coverage;

      if (metric.comparableAmount !== null) {
        comparableCounts[needIndex] += 1;
        comparableSums[needIndex] += metric.comparableAmount;
      }

      if (metric.rawRatio !== null) {
        rawRatioCounts[needIndex] += 1;
        rawRatioSums[needIndex] += metric.rawRatio;
      }

      if (metric.limitComparableAmount !== null) {
        const currentLimit = limitMins[needIndex];
        limitMins[needIndex] = currentLimit === null
          ? metric.limitComparableAmount
          : Math.min(currentLimit, metric.limitComparableAmount);
      }
    }

    const selectedEntries = nextIndices.map((index) => orderedEntries[index]!);
    let coverageNumerator = 0;
    let doseNumerator = 0;
    let doseDenominator = 0;
    let confidenceNumerator = 0;
    let confidenceDenominator = 0;
    let overlapNumerator = 0;
    let overageNumerator = 0;
    let duplicateNeedProductNumerator = 0;
    let matchedNeedCount = 0;
    let matchedNeedWeight = 0;

    for (const [needIndex, need] of scoringNeeds.entries()) {
      const limit = limitMins[needIndex];
      const comparableSeen = (comparableCounts[needIndex] ?? 0) > 0;
      const comparableAmount = comparableSums[needIndex] ?? 0;

      if (limit !== null && comparableSeen && comparableAmount > limit) {
        return null;
      }

      const coverageSum = coverageSums[needIndex] ?? 0;
      const achieved = clamp01(coverageSum);
      const rawRatio = (rawRatioCounts[needIndex] ?? 0) > 0
        ? rawRatioSums[needIndex] ?? 0
        : null;

      coverageNumerator += achieved * need.weight;

      if (achieved > 0) {
        matchedNeedCount += 1;
        matchedNeedWeight += need.weight;

        const doseBand = doseBandScore(rawRatio);
        const confidence = coverageSum > 0
          ? (confidenceCoverageSums[needIndex] ?? 0) / coverageSum
          : 0;

        doseNumerator += need.weight * achieved * doseBand;
        doseDenominator += need.weight * achieved;
        confidenceNumerator += need.weight * achieved * confidence;
        confidenceDenominator += need.weight * achieved;
      }

      overlapNumerator += Math.max(0, coverageSum - achieved) * need.weight;

      if (rawRatio !== null && rawRatio > TARGET_DOSE_SOFT_MAX) {
        overageNumerator += Math.min(1, rawRatio - TARGET_DOSE_SOFT_MAX) * need.weight;
      }

      const coverageProductCount = coverageProductCounts[needIndex] ?? 0;
      if (coverageProductCount > 1) {
        duplicateNeedProductNumerator += (coverageProductCount - 1) * need.weight;
      }
    }

    const coverage = totalWeight > 0 ? coverageNumerator / totalWeight : 0;
    const dosePrecision = doseDenominator > 0 ? doseNumerator / doseDenominator : 0;
    const confidence = confidenceDenominator > 0
      ? confidenceNumerator / confidenceDenominator
      : 0;
    const extraServings = Math.max(0, servingCount - selectedEntries.length);
    const simplicity = clamp01(
      1 -
        0.12 * Math.max(0, selectedEntries.length - 3) -
        V2_EXTRA_SERVING_SIMPLICITY_PENALTY * extraServings
    );
    const price = priceCount > 0 ? priceSum : null;
    const affordability =
      budgetAmount && price
        ? clamp01(1 - Math.max(0, price - budgetAmount) / budgetAmount)
        : 0.5;
    const costEfficiency = clamp01(coverage * 0.7 + affordability * 0.3);
    const extras = usefulExtrasScore(extrasCount);
    const overlapPenalty = totalWeight > 0 ? overlapNumerator / totalWeight : 0;
    const overagePenalty = totalWeight > 0 ? overageNumerator / totalWeight : 0;
    const extraFactPenalty = excessiveExtrasPenalty(extrasCount);
    const duplicateNeedProductPenalty = totalWeight > 0
      ? duplicateNeedProductNumerator / totalWeight
      : 0;
    const safetyContextPenalty = safetyContextPenaltyForMask(
      safetyMask,
      safetyContext
    );
    const penalty = clamp01(
      0.3 * overlapPenalty +
      V2_DUPLICATE_NEED_PRODUCT_PENALTY_WEIGHT * duplicateNeedProductPenalty +
      0.4 * overagePenalty +
      V2_EXCESSIVE_EXTRAS_PENALTY_WEIGHT * extraFactPenalty +
      safetyContextPenalty
    );
    const componentScores = {
      confidence: roundScore(confidence),
      cost: roundScore(costEfficiency),
      coverage: roundScore(coverage),
      dose: roundScore(dosePrecision),
      duplicateNeedProductPenalty: roundScore(duplicateNeedProductPenalty),
      extraFactPenalty: roundScore(extraFactPenalty),
      extras: roundScore(extras),
      overagePenalty: roundScore(overagePenalty),
      penalty: roundScore(penalty),
      safetyContextPenalty: roundScore(safetyContextPenalty),
      simplicity: roundScore(simplicity)
    };
    const score =
      weights.coverage * coverage +
      weights.dose * dosePrecision +
      weights.simplicity * simplicity +
      weights.cost * costEfficiency +
      weights.extras * extras +
      weights.confidence * confidence -
      penalty;
    const supplementProductCoveragePercent = safePercent(
      productNeedsWeight > 0 ? (coverageNumerator / productNeedsWeight) * 100 : 0
    );
    const totalPlanCoveragePercent = safePercent(
      allNeedsWeight > 0 ? (coverageNumerator / allNeedsWeight) * 100 : 0
    );

    return {
      comparableCounts,
      comparableSums,
      componentScores,
      confidenceCoverageSums,
      coverageProductCounts,
      coverageSums,
      doseLimitMins: nextDoseState.doseLimitMins,
      doseSums: nextDoseState.doseSums,
      entries: selectedEntries,
      extrasCount,
      indices: nextIndices,
      limitMins,
      matchedNeedCount,
      matchedNeedWeight,
      overagePenalty,
      priceCount,
      priceSum,
      rawRatioCounts,
      rawRatioSums,
      safetyContextPenalty,
      safetyMask,
      score,
      servingCount,
      supplementProductCoveragePercent,
      totalPlanCoveragePercent
    };
  };
  const seedStates = orderedEntries
    .map((_, index) => buildState(null, index))
    .filter((state): state is V2BeamState => Boolean(state));
  let beam = selectDiverseBeamStates(seedStates, beamWidth, scoringNeeds);

  for (const state of seedStates) {
    keepState(state);
  }

  for (let depth = 2; depth <= maxProducts && beam.length > 0; depth += 1) {
    const nextBeam: V2BeamState[] = [];

    for (const state of beam) {
      const selectedIndices = new Set(state.indices);

      for (let entryIndex = 0; entryIndex < orderedEntries.length; entryIndex += 1) {
        if (selectedIndices.has(entryIndex)) {
          continue;
        }

        const nextState = buildState(state, entryIndex);

        if (nextState) {
          nextBeam.push(nextState);
          keepState(nextState);
        }
      }
    }

    beam = selectDiverseBeamStates(nextBeam, beamWidth, scoringNeeds);
  }

  const mergedStates = [
    ...topStates,
    ...[...topStatesBySize.values()].flat()
  ];

  return {
    evaluatedStackCount,
    scores: selectFinalBeamStates(
      mergedStates,
      topStatesBySize,
      keepTop,
      scoringNeeds
    )
      .map((state) => beamStateToStackScore(state, scoringNeeds))
  };
}

function enumerateStackScores(
  entries: readonly V2ProductEntry[],
  input: ProductRecommendationInput,
  scoringNeeds: readonly ProductRecommendationNeed[],
  allNeeds: readonly ProductRecommendationNeed[],
  weights: V2Weights,
  maxProducts: number,
  keepTop = 4
) {
  const scores: V2StackScore[] = [];
  const stack: V2ProductEntry[] = [];
  const metricsMatrix = entries.map((entry) =>
    scoringNeeds.map((need) => entry.metricsByNeed.get(need.id) ?? null)
  );
  const entrySafetyMasks = entries.map(productSafetyMask);
  const safetyContext = safetyContextFromClientContext(input.clientContext);
  const coverageSums = scoringNeeds.map(() => 0);
  const comparableSums = scoringNeeds.map(() => 0);
  const comparableCounts = scoringNeeds.map(() => 0);
  const rawRatioSums = scoringNeeds.map(() => 0);
  const rawRatioCounts = scoringNeeds.map(() => 0);
  const confidenceCoverageSums = scoringNeeds.map(() => 0);
  const limitStacks = scoringNeeds.map((): number[] => []);
  let extrasCount = 0;
  let priceCount = 0;
  let priceSum = 0;
  let safetyMask = 0;
  let servingCount = 0;
  let doseLimitMins: Record<string, number> = {};
  let doseSums: Record<string, number> = {};
  const previousSafetyMasks: number[] = [];
  const previousDoseStates: Array<{
    doseLimitMins: Record<string, number>;
    doseSums: Record<string, number>;
  }> = [];
  let evaluatedStackCount = 0;
  const keepScore = (score: V2StackScore) => {
    evaluatedStackCount += 1;
    scores.push(score);
    scores.sort(compareStackScores);

    if (Number.isFinite(keepTop) && scores.length > keepTop) {
      scores.length = keepTop;
    }
  };
  const currentScore = (): V2StackScore | null => {
    const achievedCoverage = new Map<string, number>();
    const comparableByNeed = new Map<string, number>();
    const rawRatioByNeed = new Map<string, number>();
    const totalWeight = normalizedNeedWeightTotal(scoringNeeds);
    let coverageNumerator = 0;
    let doseNumerator = 0;
    let doseDenominator = 0;
    let confidenceNumerator = 0;
    let confidenceDenominator = 0;
    let overlapNumerator = 0;
    let overageNumerator = 0;
    let duplicateNeedProductNumerator = 0;
    let matchedNeedCount = 0;
    let matchedNeedWeight = 0;

    for (const [needIndex, need] of scoringNeeds.entries()) {
      const coverageSum = coverageSums[needIndex] ?? 0;
      const achieved = clamp01(coverageSum);
      const comparableSeen = (comparableCounts[needIndex] ?? 0) > 0;
      const comparableAmount = comparableSums[needIndex] ?? 0;
      const rawRatioSeen = (rawRatioCounts[needIndex] ?? 0) > 0;
      const rawRatio = rawRatioSeen ? rawRatioSums[needIndex] ?? 0 : null;
      const limits = limitStacks[needIndex] ?? [];
      const limit = limits.length > 0 ? Math.min(...limits) : null;

      if (limit && comparableSeen && comparableAmount > limit) {
        return null;
      }

      achievedCoverage.set(need.id, achieved);
      coverageNumerator += achieved * need.weight;

      if (comparableSeen) {
        comparableByNeed.set(need.id, comparableAmount);
      }

      if (rawRatioSeen && rawRatio !== null) {
        rawRatioByNeed.set(need.id, rawRatio);
      }

      if (achieved > 0) {
        matchedNeedCount += 1;
        matchedNeedWeight += need.weight;

        const doseBand = doseBandScore(rawRatio);
        const confidence = coverageSum > 0
          ? (confidenceCoverageSums[needIndex] ?? 0) / coverageSum
          : 0;

        doseNumerator += need.weight * achieved * doseBand;
        doseDenominator += need.weight * achieved;
        confidenceNumerator += need.weight * achieved * confidence;
        confidenceDenominator += need.weight * achieved;
      }

      overlapNumerator += Math.max(0, coverageSum - achieved) * need.weight;

      if (rawRatio !== null && rawRatio > TARGET_DOSE_SOFT_MAX) {
        overageNumerator += Math.min(1, rawRatio - TARGET_DOSE_SOFT_MAX) * need.weight;
      }

      const coverageProductCount = stack.reduce((count, stackEntry) => {
        const metric = stackEntry.metricsByNeed.get(need.id) ?? null;

        return metric && metric.coverage > V2_SCORE_EPSILON ? count + 1 : count;
      }, 0);

      if (coverageProductCount > 1) {
        duplicateNeedProductNumerator += (coverageProductCount - 1) * need.weight;
      }
    }

    const coverage = totalWeight > 0 ? coverageNumerator / totalWeight : 0;
    const dosePrecision = doseDenominator > 0 ? doseNumerator / doseDenominator : 0;
    const confidence = confidenceDenominator > 0
      ? confidenceNumerator / confidenceDenominator
      : 0;
    const extraServings = Math.max(0, servingCount - stack.length);
    const simplicity = clamp01(
      1 -
        0.12 * Math.max(0, stack.length - 3) -
        V2_EXTRA_SERVING_SIMPLICITY_PENALTY * extraServings
    );
    const budgetAmount = budgetAmountFromContext(input);
    const price = priceCount > 0 ? priceSum : null;
    const affordability =
      budgetAmount && price
        ? clamp01(1 - Math.max(0, price - budgetAmount) / budgetAmount)
        : 0.5;
    const costEfficiency = clamp01(coverage * 0.7 + affordability * 0.3);
    const extras = usefulExtrasScore(extrasCount);
    const overlapPenalty = totalWeight > 0 ? overlapNumerator / totalWeight : 0;
    const overagePenalty = totalWeight > 0 ? overageNumerator / totalWeight : 0;
    const extraFactPenalty = excessiveExtrasPenalty(extrasCount);
    const duplicateNeedProductPenalty = totalWeight > 0
      ? duplicateNeedProductNumerator / totalWeight
      : 0;
    const safetyContextPenalty = safetyContextPenaltyForMask(
      safetyMask,
      safetyContext
    );
    const penalty = clamp01(
      0.3 * overlapPenalty +
      V2_DUPLICATE_NEED_PRODUCT_PENALTY_WEIGHT * duplicateNeedProductPenalty +
      0.4 * overagePenalty +
      V2_EXCESSIVE_EXTRAS_PENALTY_WEIGHT * extraFactPenalty +
      safetyContextPenalty
    );
    const componentScores = {
      confidence: roundScore(confidence),
      cost: roundScore(costEfficiency),
      coverage: roundScore(coverage),
      dose: roundScore(dosePrecision),
      duplicateNeedProductPenalty: roundScore(duplicateNeedProductPenalty),
      extraFactPenalty: roundScore(extraFactPenalty),
      extras: roundScore(extras),
      overagePenalty: roundScore(overagePenalty),
      penalty: roundScore(penalty),
      safetyContextPenalty: roundScore(safetyContextPenalty),
      simplicity: roundScore(simplicity)
    };
    const score =
      weights.coverage * coverage +
      weights.dose * dosePrecision +
      weights.simplicity * simplicity +
      weights.cost * costEfficiency +
      weights.extras * extras +
      weights.confidence * confidence -
      penalty;
    const productNeeds = supplementProductNeeds(allNeeds);

    return {
      achievedCoverage,
      comparableByNeed,
      componentScores,
      entries: [...stack],
      matchedNeedCount,
      matchedNeedWeight,
      overagePenalty,
      rawRatioByNeed,
      safetyContextPenalty,
      score,
      servingCount,
      supplementProductCoveragePercent: safePercent(
        stackCoveragePercent(achievedCoverage, productNeeds)
      ),
      totalPlanCoveragePercent: safePercent(
        stackCoveragePercent(achievedCoverage, allNeeds)
      )
    };
  };
  const pushEntry = (
    entryIndex: number,
    nextDoseState: {
      doseLimitMins: Record<string, number>;
      doseSums: Record<string, number>;
    }
  ) => {
    const entry = entries[entryIndex]!;

    stack.push(entry);
    previousDoseStates.push({ doseLimitMins, doseSums });
    doseLimitMins = nextDoseState.doseLimitMins;
    doseSums = nextDoseState.doseSums;
    extrasCount += entry.extrasCount;
    servingCount += entry.servingMultiplier;

    if (typeof entry.product.priceAmount === "number" && entry.product.priceAmount > 0) {
      priceCount += 1;
      priceSum += entry.product.priceAmount;
    }

    previousSafetyMasks.push(safetyMask);
    safetyMask |= entrySafetyMasks[entryIndex] ?? 0;

    for (const [needIndex, metric] of metricsMatrix[entryIndex]!.entries()) {
      if (!metric) {
        continue;
      }

      coverageSums[needIndex] += metric.coverage;
      confidenceCoverageSums[needIndex] += metric.confidence * metric.coverage;

      if (metric.comparableAmount !== null) {
        comparableCounts[needIndex] += 1;
        comparableSums[needIndex] += metric.comparableAmount;
      }

      if (metric.rawRatio !== null) {
        rawRatioCounts[needIndex] += 1;
        rawRatioSums[needIndex] += metric.rawRatio;
      }

      if (metric.limitComparableAmount !== null) {
        limitStacks[needIndex]!.push(metric.limitComparableAmount);
      }
    }
  };
  const popEntry = (entryIndex: number) => {
    const entry = entries[entryIndex]!;

    stack.pop();
    const previousDoseState = previousDoseStates.pop();
    doseLimitMins = previousDoseState?.doseLimitMins ?? {};
    doseSums = previousDoseState?.doseSums ?? {};
    extrasCount -= entry.extrasCount;
    servingCount -= entry.servingMultiplier;

    if (typeof entry.product.priceAmount === "number" && entry.product.priceAmount > 0) {
      priceCount -= 1;
      priceSum -= entry.product.priceAmount;
    }

    safetyMask = previousSafetyMasks.pop() ?? 0;

    for (const [needIndex, metric] of metricsMatrix[entryIndex]!.entries()) {
      if (!metric) {
        continue;
      }

      coverageSums[needIndex] -= metric.coverage;
      confidenceCoverageSums[needIndex] -= metric.confidence * metric.coverage;

      if (metric.comparableAmount !== null) {
        comparableCounts[needIndex] -= 1;
        comparableSums[needIndex] -= metric.comparableAmount;
      }

      if (metric.rawRatio !== null) {
        rawRatioCounts[needIndex] -= 1;
        rawRatioSums[needIndex] -= metric.rawRatio;
      }

      if (metric.limitComparableAmount !== null) {
        limitStacks[needIndex]!.pop();
      }
    }
  };
  const visit = (startIndex: number) => {
    if (stack.length > 0) {
      const score = currentScore();

      if (score) {
        keepScore(score);
      }
    }

    if (stack.length >= maxProducts) {
      return;
    }

    for (let index = startIndex; index < entries.length; index += 1) {
      if (stack.some((entry) => entry.product.id === entries[index]!.product.id)) {
        continue;
      }

      if (
        stack.some((entry) =>
          productVariantKey(entry.product) === productVariantKey(entries[index]!.product)
        )
      ) {
        continue;
      }

      const coveredNeedIndexes = metricsMatrix[index]!
        .map((metric, needIndex) =>
          metric && metric.coverage > V2_SCORE_EPSILON ? needIndex : null
        )
        .filter((needIndex): needIndex is number => needIndex !== null);

      if (
        coveredNeedIndexes.length > 0 &&
        coveredNeedIndexes.every((needIndex) =>
          stack.some((stackEntry) =>
            (stackEntry.metricsByNeed.get(scoringNeeds[needIndex]!.id)?.coverage ?? 0) >
            V2_SCORE_EPSILON
          )
        )
      ) {
        continue;
      }

      if (
        coveredNeedIndexes.length > 0 &&
        coveredNeedIndexes.every((needIndex) =>
          (coverageSums[needIndex] ?? 0) > V2_SCORE_EPSILON
        ) &&
        coveredNeedIndexes.every((needIndex) =>
          (coverageSums[needIndex] ?? 0) >= TARGET_DOSE_SWEET_SPOT_MIN ||
          (metricsMatrix[index]![needIndex]?.coverage ?? 0) >=
            TARGET_DOSE_SWEET_SPOT_MIN
        )
      ) {
        continue;
      }

      if (
        stack.length > 0 &&
        hasOnlyTinyPartialCoverage(metricsMatrix[index]!) &&
        marginalCoverageContributionPercent(
          metricsMatrix[index]!,
          coverageSums,
          scoringNeeds
        ) < V2_MIN_MARGINAL_PRODUCT_CONTRIBUTION_PERCENT
      ) {
        continue;
      }

      const nextDoseState = mergeStackDoseContributions(
        doseSums,
        doseLimitMins,
        entries[index]!.doseContributions
      );

      if (!nextDoseState) {
        continue;
      }

      pushEntry(index, nextDoseState);
      visit(index + 1);
      popEntry(index);
    }
  };

  visit(0);
  return {
    evaluatedStackCount,
    scores: scores.sort(compareStackScores)
  };
}

function contributionPercentForProduct(
  entry: V2ProductEntry,
  stackEntries: readonly V2ProductEntry[],
  needs: readonly ProductRecommendationNeed[]
) {
  const totalWeight = normalizedNeedWeightTotal(needs);

  if (totalWeight <= 0) {
    return 0;
  }

  let weightedContribution = 0;

  for (const need of needs) {
    const totalCoverage = stackEntries.reduce(
      (total, stackEntry) =>
        total + (stackEntry.metricsByNeed.get(need.id)?.coverage ?? 0),
      0
    );
    const ownCoverage = entry.metricsByNeed.get(need.id)?.coverage ?? 0;

    if (totalCoverage > 0 && ownCoverage > 0) {
      weightedContribution +=
        (ownCoverage / totalCoverage) * Math.min(1, totalCoverage) * need.weight;
    }
  }

  return (weightedContribution / totalWeight) * 100;
}

function scoreV2StackEntries(
  entries: readonly V2ProductEntry[],
  input: ProductRecommendationInput,
  scoringNeeds: readonly ProductRecommendationNeed[],
  allNeeds: readonly ProductRecommendationNeed[],
  weights: V2Weights
): V2StackScore | null {
  const {
    achievedCoverage,
    comparableByNeed,
    limitsByNeed,
    rawRatioByNeed
  } = stackContributionMaps(entries, scoringNeeds);
  const totalWeight = normalizedNeedWeightTotal(scoringNeeds);
  const safetyContext = safetyContextFromClientContext(input.clientContext);
  const budgetAmount = budgetAmountFromContext(input);
  let coverageNumerator = 0;
  let doseNumerator = 0;
  let doseDenominator = 0;
  let confidenceNumerator = 0;
  let confidenceDenominator = 0;
  let duplicateNeedProductNumerator = 0;
  let extrasCount = 0;
  let matchedNeedCount = 0;
  let matchedNeedWeight = 0;
  let overageNumerator = 0;
  let overlapNumerator = 0;
  let priceCount = 0;
  let priceSum = 0;
  let safetyMask = 0;
  let servingCount = 0;

  for (const entry of entries) {
    extrasCount += entry.extrasCount;
    safetyMask |= productSafetyMask(entry);
    servingCount += entry.servingMultiplier;

    if (typeof entry.product.priceAmount === "number" && entry.product.priceAmount > 0) {
      priceCount += 1;
      priceSum += entry.product.priceAmount;
    }
  }

  for (const need of scoringNeeds) {
    const coverageSum = entries.reduce(
      (total, entry) => total + (entry.metricsByNeed.get(need.id)?.coverage ?? 0),
      0
    );
    const achieved = achievedCoverage.get(need.id) ?? 0;
    const comparableSeen = comparableByNeed.has(need.id);
    const comparableAmount = comparableByNeed.get(need.id) ?? 0;
    const rawRatio = rawRatioByNeed.get(need.id) ?? null;
    const limit = limitsByNeed.get(need.id) ?? null;

    if (limit && comparableSeen && comparableAmount > limit) {
      return null;
    }

    coverageNumerator += achieved * need.weight;

    if (achieved > 0) {
      const confidenceCoverageSum = entries.reduce((total, entry) => {
        const metric = entry.metricsByNeed.get(need.id) ?? null;

        return metric
          ? total + metric.coverage * metric.confidence
          : total;
      }, 0);
      const confidence = coverageSum > 0
        ? confidenceCoverageSum / coverageSum
        : 0;

      matchedNeedCount += 1;
      matchedNeedWeight += need.weight;
      doseNumerator += need.weight * achieved * doseBandScore(rawRatio);
      doseDenominator += need.weight * achieved;
      confidenceNumerator += need.weight * achieved * confidence;
      confidenceDenominator += need.weight * achieved;
    }

    overlapNumerator += Math.max(0, coverageSum - achieved) * need.weight;

    if (rawRatio !== null && rawRatio > TARGET_DOSE_SOFT_MAX) {
      overageNumerator += Math.min(1, rawRatio - TARGET_DOSE_SOFT_MAX) * need.weight;
    }

    const coverageProductCount = entries.reduce((count, entry) => {
      const metric = entry.metricsByNeed.get(need.id) ?? null;

      return metric && metric.coverage > V2_SCORE_EPSILON ? count + 1 : count;
    }, 0);

    if (coverageProductCount > 1) {
      duplicateNeedProductNumerator += (coverageProductCount - 1) * need.weight;
    }
  }

  const coverage = totalWeight > 0 ? coverageNumerator / totalWeight : 0;
  const dosePrecision = doseDenominator > 0 ? doseNumerator / doseDenominator : 0;
  const confidence = confidenceDenominator > 0
    ? confidenceNumerator / confidenceDenominator
    : 0;
  const extraServings = Math.max(0, servingCount - entries.length);
  const simplicity = clamp01(
    1 -
      0.12 * Math.max(0, entries.length - 3) -
      V2_EXTRA_SERVING_SIMPLICITY_PENALTY * extraServings
  );
  const price = priceCount > 0 ? priceSum : null;
  const affordability =
    budgetAmount && price
      ? clamp01(1 - Math.max(0, price - budgetAmount) / budgetAmount)
      : 0.5;
  const costEfficiency = clamp01(coverage * 0.7 + affordability * 0.3);
  const extras = usefulExtrasScore(extrasCount);
  const overlapPenalty = totalWeight > 0 ? overlapNumerator / totalWeight : 0;
  const overagePenalty = totalWeight > 0 ? overageNumerator / totalWeight : 0;
  const extraFactPenalty = excessiveExtrasPenalty(extrasCount);
  const duplicateNeedProductPenalty = totalWeight > 0
    ? duplicateNeedProductNumerator / totalWeight
    : 0;
  const safetyContextPenalty = safetyContextPenaltyForMask(
    safetyMask,
    safetyContext
  );
  const penalty = clamp01(
    0.3 * overlapPenalty +
    V2_DUPLICATE_NEED_PRODUCT_PENALTY_WEIGHT * duplicateNeedProductPenalty +
    0.4 * overagePenalty +
    V2_EXCESSIVE_EXTRAS_PENALTY_WEIGHT * extraFactPenalty +
    safetyContextPenalty
  );
  const componentScores = {
    confidence: roundScore(confidence),
    cost: roundScore(costEfficiency),
    coverage: roundScore(coverage),
    dose: roundScore(dosePrecision),
    duplicateNeedProductPenalty: roundScore(duplicateNeedProductPenalty),
    extraFactPenalty: roundScore(extraFactPenalty),
    extras: roundScore(extras),
    overagePenalty: roundScore(overagePenalty),
    penalty: roundScore(penalty),
    safetyContextPenalty: roundScore(safetyContextPenalty),
    simplicity: roundScore(simplicity)
  };
  const score =
    weights.coverage * coverage +
    weights.dose * dosePrecision +
    weights.simplicity * simplicity +
    weights.cost * costEfficiency +
    weights.extras * extras +
    weights.confidence * confidence -
    penalty;
  const productNeeds = supplementProductNeeds(allNeeds);

  return {
    achievedCoverage,
    comparableByNeed,
    componentScores,
    entries: [...entries],
    matchedNeedCount,
    matchedNeedWeight,
    overagePenalty,
    rawRatioByNeed,
    safetyContextPenalty,
    score,
    servingCount,
    supplementProductCoveragePercent: safePercent(
      stackCoveragePercent(achievedCoverage, productNeeds)
    ),
    totalPlanCoveragePercent: safePercent(
      stackCoveragePercent(achievedCoverage, allNeeds)
    )
  };
}

function pruneLowContributionStackEntries(
  stack: V2StackScore,
  input: ProductRecommendationInput,
  scoringNeeds: readonly ProductRecommendationNeed[],
  allNeeds: readonly ProductRecommendationNeed[],
  weights: V2Weights
) {
  let entries = [...stack.entries];

  while (entries.length > 1) {
    const lowContributionEntry = entries
      .map((entry) => ({
        contribution: contributionPercentForProduct(entry, entries, scoringNeeds),
        entry
      }))
      .filter(
        ({ contribution, entry }) =>
          contribution + V2_SCORE_EPSILON <
            V2_MIN_MARGINAL_PRODUCT_CONTRIBUTION_PERCENT &&
          hasOnlyTinyPartialCoverage(
            scoringNeeds.map((need) => entry.metricsByNeed.get(need.id) ?? null)
          )
      )
      .sort(
        (first, second) =>
          first.contribution - second.contribution ||
          first.entry.coverage.percent - second.entry.coverage.percent ||
          first.entry.product.title.localeCompare(second.entry.product.title) ||
          first.entry.product.id.localeCompare(second.entry.product.id)
      )[0];

    if (!lowContributionEntry) {
      break;
    }

    entries = entries.filter((entry) => entry !== lowContributionEntry.entry);
  }

  if (entries.length === stack.entries.length) {
    return stack;
  }

  return (
    scoreV2StackEntries(entries, input, scoringNeeds, allNeeds, weights) ??
    stack
  );
}

function recommendationsFromV2Stack(
  stack: V2StackScore,
  scoringNeeds: readonly ProductRecommendationNeed[]
) {
  return stack.entries
    .map((entry) => {
      const contribution = contributionPercentForProduct(
        entry,
        stack.entries,
        scoringNeeds
      );

      return {
        contribution,
        entry
      };
    })
    .sort((first, second) =>
      second.contribution - first.contribution ||
      second.entry.coverage.percent - first.entry.coverage.percent ||
      first.entry.product.title.localeCompare(second.entry.product.title) ||
      first.entry.product.id.localeCompare(second.entry.product.id)
    )
    .map(({ contribution, entry }, index) => {
      const coveredNeeds = scoringNeeds.filter((need) =>
        (entry.coverage.coverageByNeed.get(need.id) ?? 0) > 0
      );

      return {
        affiliate: Boolean(entry.product.activeAffiliateUrl),
        offerId: entry.product.activeOfferId ?? null,
        coveredNeeds,
        product: entry.product,
        productCoveragePercent: visibleCoveragePercent(
          entry.coverage.percent,
          coveredNeeds.length > 0
        ),
        rank: index + 1,
        score: roundScore(contribution),
        servingMultiplier: entry.servingMultiplier,
        stackContributionPercent: visibleCoveragePercent(contribution, contribution > 0),
        unknownAtRecommendation: false,
        url: entry.product.activeAffiliateUrl || entry.product.productUrl,
        why: whyProductMatches(
          entry.product,
          coveredNeeds,
          contribution,
          entry.servingMultiplier
        )
      } satisfies ProductRecommendationSelection;
    });
}

function v2Shortfalls(
  needs: readonly ProductRecommendationNeed[],
  coverage: ReadonlyMap<string, number>
) {
  return needs.map((need) => {
    const coveragePercent = safePercent((coverage.get(need.id) ?? 0) * 100);

    return {
      coveragePercent,
      displayName: need.displayName,
      id: need.id,
      shortfallPercent: safePercent(100 - coveragePercent)
    };
  });
}

function recommendProductStackExact(
  input: ProductRecommendationInput,
  options: Readonly<{
    algorithmVersion: ProductRecommendationAlgorithmVersion;
    searchMode: "full-beam" | "shortlist";
  }>
) {
  const stackPreference = normalizeProductStackPreference(input.stackPreference);
  const maxProducts = Math.min(
    DEFAULT_MAX_COUNT,
    Math.max(1, input.maxProducts ?? DEFAULT_MAX_COUNT)
  );
  const scoringNeeds = supplementProductNeeds(input.needs);
  const exclusions: ProductRecommendationExclusion[] = [];
  const bestRejectedByNeed = new Map<string, ProductRecommendationExclusion>();
  const bestRejectedCoverageByNeed = new Map<string, number>();
  const { deltas, weights } = normalizedV2Weights(input.clientContext);
  const safetyContext = safetyContextFromClientContext(input.clientContext);
  const recordBestRejectedNeeds = (
    entry: V2ProductEntry,
    exclusion: ProductRecommendationExclusion
  ) => {
    for (const need of entry.coverage.coveredNeeds) {
      const current = bestRejectedCoverageByNeed.get(need.id) ?? 0;
      const next = entry.coverage.coverageByNeed.get(need.id) ?? 0;

      if (next > current) {
        bestRejectedCoverageByNeed.set(need.id, next);
        bestRejectedByNeed.set(need.id, exclusion);
      }
    }
  };
  const entries = input.candidates
    .flatMap((product) => {
      const baseEntry = productCoverageV2(product, scoringNeeds, input.clientSex);
      const reason =
        exclusionReason(product) ??
        productAudienceMismatchReason(product, input.clientSex);

      if (reason) {
        const exclusion = {
          productId: product.id,
          reason,
          title: product.title
        };

        exclusions.push(exclusion);
        recordBestRejectedNeeds(baseEntry, exclusion);

        return [];
      }

      const blockedSafetyReasons = new Set<string>();
      const productEntries = productServingMultipliers(product)
        .map((servingMultiplier) =>
          productCoverageV2(product, scoringNeeds, input.clientSex, servingMultiplier)
        )
        .filter((entry) => {
          if (entry.coverage.percent <= 0) {
            return false;
          }

          const safetyReason = safetyContextBlockReasonForMask(
            productSafetyMask(entry),
            safetyContext
          );

          if (safetyReason) {
            blockedSafetyReasons.add(safetyReason);
            return false;
          }

          return true;
        });

      if (productEntries.length <= 0) {
        const exclusion = {
          productId: product.id,
          reason:
            [...blockedSafetyReasons][0] ??
            productFactAudienceMismatchReason(
              product,
              scoringNeeds,
              input.clientSex
            ) ?? "Product does not cover current client needs",
          title: product.title
        };

        exclusions.push(exclusion);

        if (exclusion.reason !== "Product does not cover current client needs") {
          recordBestRejectedNeeds(baseEntry, exclusion);
        }

        return [];
      }

      return productEntries;
    })
    .filter((entry): entry is V2ProductEntry => Boolean(entry));
  const candidatePool = options.searchMode === "shortlist"
    ? shortlistEntries(entries, scoringNeeds)
    : entries;
  const stackSearch = options.searchMode === "full-beam"
    ? beamSearchStackScores(
        candidatePool,
        input,
        scoringNeeds,
        scoringNeeds,
        weights,
        maxProducts,
        V2_FULL_BEAM_WIDTH,
        stackPreference === "compact" ? 128 : 32
      )
    : enumerateStackScores(
        candidatePool,
        input,
        scoringNeeds,
        scoringNeeds,
        weights,
        maxProducts
      );
  const stackScores = uniqueStackScores(
    stackSearch.scores.map((stack) =>
      pruneLowContributionStackEntries(
        stack,
        input,
        scoringNeeds,
        scoringNeeds,
        weights
      )
    )
  );
  const bestStack = selectStackForPreference(
    stackScores,
    scoringNeeds,
    stackPreference
  );
  const finalCoverage = bestStack
    ? stackCoverageForNeeds(bestStack.entries, scoringNeeds)
    : new Map<string, number>();
  const productNeedsCoverage = bestStack
    ? stackCoverageForNeeds(bestStack.entries, scoringNeeds)
    : new Map<string, number>();
  const supplementProductCoveragePercent = safePercent(
    stackCoveragePercent(productNeedsCoverage, scoringNeeds)
  );
  const foodCoveragePercent = 0;
  const totalPlanCoveragePercent = safePercent(
    stackCoveragePercent(finalCoverage, scoringNeeds)
  );
  const needDiagnostics = diagnosticNeeds(
    scoringNeeds,
    finalCoverage,
    bestRejectedByNeed,
    bestAvailableCoverageByNeed(entries)
  );
  const selectedIds = new Set(
    bestStack?.entries.map((entry) => entry.product.id) ?? []
  );
  const nearMisses = entries
    .filter((entry) => !selectedIds.has(entry.product.id))
    .map((entry) => ({
      coveragePercent: safePercent(entry.coverage.percent),
      productId: entry.product.id,
      reason:
        options.searchMode === "shortlist" &&
        !candidatePool.some((item) => item.product.id === entry.product.id)
          ? "Outside deterministic shortlist"
          : "Lower utility than selected stack",
      title: entry.product.title
    }))
    .filter((item) => item.coveragePercent > 0)
    .sort((first, second) =>
      second.coveragePercent - first.coveragePercent ||
      first.title.localeCompare(second.title) ||
      first.productId.localeCompare(second.productId)
    )
    .slice(0, 12);
  const trace: ProductRecommendationTrace = {
    alternativeStacks: distinctAlternativeStacks(
      stackScores,
      bestStack,
      scoringNeeds
    )
      .map((stack) => ({
        productIds: stack.entries.map((entry) => entry.product.id),
        productTitles: stack.entries.map((entry) => entry.product.title),
        score: roundScore(stack.score),
        supplementProductCoveragePercent: stack.supplementProductCoveragePercent,
        totalPlanCoveragePercent: stack.totalPlanCoveragePercent
      })),
    candidatePoolSize: entries.length,
    componentScores: bestStack?.componentScores ?? {},
    contextSignals: v2ContextSignals(input),
    evaluatedStackCount: stackSearch.evaluatedStackCount,
    excludedPredicates: exclusions.filter(
      (item) => item.reason !== "Product does not cover current client needs"
    ),
    maxProducts,
    searchMode: options.searchMode,
    shortfalls: v2Shortfalls(scoringNeeds, finalCoverage),
    shortlistSize: candidatePool.length,
    stackPreference,
    targetProducts: input.targetProducts ?? undefined,
    utilityScore: roundScore(bestStack?.score ?? 0),
    weightDeltas: deltas,
    weights
  };

  return {
    clientNeeds: scoringNeeds,
    diagnostics: {
      algorithmVersion: options.algorithmVersion,
      blockedProducts: exclusions.filter(
        (item) => item.reason !== "Product does not cover current client needs"
      ),
      coverage: {
        foodCoveragePercent,
        supplementProductCoveragePercent,
        totalPlanCoveragePercent
      },
      factIssues: factIssueExclusions(exclusions),
      matchedNeeds: needDiagnostics.filter((item) => item.coveragePercent > 0),
      marketRegion: input.countryCode ?? undefined,
      nearMisses,
      productsConsidered: input.candidates.length,
      stackPreference,
      trace,
      unmatchedNeeds: needDiagnostics.filter((item) => item.coveragePercent <= 0)
    },
    exclusions,
    recommendations: bestStack
      ? recommendationsFromV2Stack(bestStack, scoringNeeds)
      : [],
    foodCoveragePercent,
    stackCoveragePercent: supplementProductCoveragePercent,
    supplementProductCoveragePercent,
    totalPlanCoveragePercent
  } satisfies ProductRecommendationResult;
}

export function recommendProductStackV2(input: ProductRecommendationInput) {
  return recommendProductStackExact(input, {
    algorithmVersion: V2_ALGORITHM_VERSION,
    searchMode: "shortlist"
  });
}

export function recommendProductStackFullBeam(input: ProductRecommendationInput) {
  return recommendProductStackExact(input, {
    algorithmVersion: V2_FULL_BEAM_ALGORITHM_VERSION,
    searchMode: "full-beam"
  });
}

export function recommendProductStack(input: ProductRecommendationInput) {
  return recommendProductStackFullBeam(input);
}
