import {
  comparableDoseAmount,
  normalizeDoseUnit,
  type ParsedDose
} from "@/lib/dose-conversion";
import {
  productFactAliasKeys,
  productFactLooksLikeConcentration,
  productKeysMatch,
  normalizeProductFactKey
} from "@/lib/product-key-matching";
import {
  V2_TINY_PARTIAL_PRODUCT_COVERAGE_CEILING
} from "@/lib/product-recommendation-v2-config";
import type {
  ProductCandidate,
  ProductCandidateFact,
  ProductClientSex,
  ProductConfidence,
  ProductRecommendationExclusion,
  ProductRecommendationNeed,
  ProductRecommendationNeedDiagnostic
} from "@/lib/product-recommendation-types";

export type CoverageResult = Readonly<{
  coverageByNeed: Map<string, number>;
  coveredNeeds: ProductRecommendationNeed[];
  percent: number;
}>;

export function safePercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function visibleCoveragePercent(value: number, hasCoverage: boolean) {
  const percent = safePercent(value);

  return hasCoverage && value > 0 && percent === 0 ? 1 : percent;
}

export function positiveNumber(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function doseFromAmount(
  amount: number | null,
  unit: string | null
): ParsedDose | null {
  if (amount === null || amount <= 0 || !unit) {
    return null;
  }

  const normalizedUnit = normalizeDoseUnit(unit);

  return normalizedUnit
    ? {
        amount,
        originalText: `${amount} ${normalizedUnit}`,
        unit: normalizedUnit
      }
    : null;
}

export function factComparableAmount(fact: ProductCandidateFact) {
  if (
    productFactLooksLikeConcentration(fact.name) ||
    productFactLooksLikeConcentration(fact.normalizedName)
  ) {
    return null;
  }

  if (typeof fact.comparableAmount === "number" && fact.comparableAmount > 0) {
    return fact.comparableAmount;
  }

  const dose = doseFromAmount(positiveNumber(fact.amount), fact.unit);

  if (!dose) {
    return null;
  }

  const keys = [
    normalizeProductFactKey(fact.name),
    normalizeProductFactKey(fact.normalizedName),
    ...productFactAliasKeys(fact.name || fact.normalizedName, fact.aliasKeys)
  ];

  for (const key of [...new Set(keys)].filter(Boolean)) {
    const comparableAmount = comparableDoseAmount(dose, key);

    if (comparableAmount !== null) {
      return comparableAmount;
    }
  }

  return null;
}

export function confidenceMultiplier(confidence: ProductConfidence) {
  if (confidence === "high") {
    return 1;
  }

  return confidence === "moderate" ? 0.85 : 0.65;
}

function matchesNeed(fact: ProductCandidateFact, need: ProductRecommendationNeed) {
  if (fact.itemType !== need.itemType && fact.itemType !== "nutrient") {
    return false;
  }

  if (fact.itemType === "supplement" && fact.supplementId === need.sourceId) {
    return true;
  }

  if (fact.itemType === "food" && fact.foodId === need.sourceId) {
    return true;
  }

  return productKeysMatch(
    fact.name || fact.normalizedName,
    need.displayName || need.normalizedName,
    fact.aliasKeys,
    need.aliasKeys
  );
}

function factAudienceMismatchReason(
  fact: ProductCandidateFact,
  clientSex?: ProductClientSex | null
) {
  const audience = fact.supplementAudience ?? "both";

  if (!clientSex || audience === "both" || audience === clientSex) {
    return null;
  }

  return audience === "female"
    ? "Supplement is for women only"
    : "Supplement is for men only";
}

export function factAllowedForClient(
  fact: ProductCandidateFact,
  clientSex?: ProductClientSex | null
) {
  return !factAudienceMismatchReason(fact, clientSex);
}

export function productFactAudienceMismatchReason(
  product: ProductCandidate,
  needs: readonly ProductRecommendationNeed[],
  clientSex?: ProductClientSex | null
) {
  if (!clientSex) {
    return null;
  }

  const mismatched = product.facts.find(
    (fact) =>
      factAudienceMismatchReason(fact, clientSex) &&
      needs.some((need) => matchesNeed(fact, need))
  );

  return mismatched ? factAudienceMismatchReason(mismatched, clientSex) : null;
}

export function exclusionReason(product: ProductCandidate) {
  if (product.brandStatus === "ignored") {
    return "Brand is ignored";
  }

  if (product.status === "ignored") {
    return "Product is ignored";
  }

  if (product.labelStatus !== "parsed" || product.facts.length < 1) {
    return "Product label facts are missing";
  }

  if (product.validation && product.validation.status !== "pass") {
    return `Product validation needs review: ${product.validation.summary}`;
  }

  if (
    product.status !== "approved" ||
    product.brandStatus !== "approved"
  ) {
    return "Product is not approved yet";
  }

  if (
    product.productDataExpiresAt &&
    new Date(product.productDataExpiresAt).getTime() < Date.now()
  ) {
    return "Product cache expired";
  }

  if (!product.automatedSafetyPassed) {
    return "Product failed automated safety checks";
  }

  return null;
}

export function productAudienceMismatchReason(
  product: ProductCandidate,
  clientSex?: ProductClientSex | null
) {
  const audience = product.productAudience ?? "both";

  if (!clientSex || audience === "both" || audience === clientSex) {
    return null;
  }

  return audience === "female"
    ? "Product is for women only"
    : "Product is for men only";
}

export function stackCoveragePercent(
  coverage: Map<string, number>,
  needs: readonly ProductRecommendationNeed[]
) {
  const totalWeight = needs.reduce((total, need) => total + need.weight, 0);
  const weightedCoverage = needs.reduce(
    (total, need) => total + (coverage.get(need.id) ?? 0) * need.weight,
    0
  );

  return totalWeight > 0 ? (weightedCoverage / totalWeight) * 100 : 0;
}

export function diagnosticNeeds(
  needs: ProductRecommendationNeed[],
  coverage: Map<string, number>,
  bestRejectedByNeed: ReadonlyMap<string, ProductRecommendationExclusion>,
  availableCoverageByNeed: ReadonlyMap<string, number> = new Map()
) {
  return needs.map((need) => {
    const bestRejected = bestRejectedByNeed.get(need.id);
    const coveragePercent = safePercent((coverage.get(need.id) ?? 0) * 100);
    const availableCoveragePercent = safePercent(
      (availableCoverageByNeed.get(need.id) ?? 0) * 100
    );
    const hasUsefulCoverage = coveragePercent >= 90;
    const availableButUnselectedReason =
      availableCoveragePercent > 0
        ? availableCoveragePercent < V2_TINY_PARTIAL_PRODUCT_COVERAGE_CEILING * 100
          ? "Available approved products underdose this formula target"
          : "Available in the catalogue but not selected by this stack preference"
        : null;
    const bestRejectedReason =
      hasUsefulCoverage
        ? null
        : coveragePercent <= 0 && availableButUnselectedReason
          ? availableButUnselectedReason
          : bestRejected?.reason ??
            (coveragePercent <= 0
              ? "No approved product in the catalogue covers this need"
              : null);

    return {
      bestRejectedProductId:
        bestRejectedReason && bestRejectedReason === bestRejected?.reason
          ? bestRejected.productId
          : null,
      bestRejectedReason,
      coveragePercent,
      displayName: need.displayName,
      id: need.id,
      itemType: need.itemType
    } satisfies ProductRecommendationNeedDiagnostic;
  });
}

export function factIssueExclusions(exclusions: ProductRecommendationExclusion[]) {
  return exclusions.filter((item) =>
    /validation|label|fact|safety|cache|approved|unavailable|blocked/i.test(item.reason)
  );
}

export function whyProductMatches(
  product: ProductCandidate,
  coveredNeeds: ProductRecommendationNeed[],
  stackContributionPercent: number,
  servingMultiplier = 1
) {
  void product;

  const names = coveredNeeds.slice(0, 3).map((need) => need.displayName);
  const servingPrefix = servingMultiplier > 1
    ? `Use ${servingMultiplier} servings; `
    : "";
  const prefix = `${servingPrefix}Strong match`;
  const contribution = safePercent(stackContributionPercent);

  if (names.length < 1) {
    return contribution > 0
      ? `${prefix}; accounts for ${contribution}% of the selected stack.`
      : `${prefix}; fills an otherwise uncovered need.`;
  }

  return contribution > 0
    ? `${prefix} for ${names.join(", ")}; accounts for ${contribution}% of the selected stack.`
    : `${prefix} for ${names.join(", ")}; fills an otherwise uncovered need.`;
}
