import {
  isAnimalDerivedSku,
  isNonAlgaeOmegaLine,
  isPrenatalOrFertilitySku
} from "@/lib/agentic/catalogue/product-fit";
import type {
  CanonicalRequest,
  MatcherProduct,
  RejectionReason
} from "@/lib/matcher/types";

const SENIOR_TITLE =
  /\b(?:for\s+)?(?:50|60|70)\s*\+|\b(?:50|60|70)-?plus\b|\bseniors?\b/i;
const CHILD_TITLE =
  /\b(?:children'?s|for children|kids|for kids|pediatric)\b/i;

export function titleImpliesSeniorAgeBand(title: string) {
  return SENIOR_TITLE.test(title);
}

export function titleImpliesChildAgeBand(title: string) {
  return CHILD_TITLE.test(title);
}

function labelledFacts(product: MatcherProduct) {
  return product.labelledContributions.map((item) => ({
    amount: item.amount,
    comparableAmount: null,
    confidence: "high" as const,
    itemType: "supplement" as const,
    name: item.name,
    normalizedName: item.name,
    unit: item.unit
  }));
}

export function productRejectionReason(
  product: MatcherProduct,
  request: CanonicalRequest
): RejectionReason | null {
  if (!product.orderable) {
    return "not_orderable";
  }

  if (request.maxDailyPills != null && product.pillCountKnown === false) return "incomplete_facts";

  if (product.incompleteCommercialFacts) {
    return "incomplete_facts";
  }

  if (product.status !== "approved") {
    return "not_approved";
  }

  if (product.stockStatus === "unavailable") {
    return "oos";
  }

  if (!Number.isSafeInteger(product.unitPriceMinor) || product.unitPriceMinor <= 0 ||
    !Number.isFinite(product.dailyPillsPerServing) || product.dailyPillsPerServing < 0) {
    return "incomplete_facts";
  }

  // Unknown health facts are advice, never a catalogue availability restriction.
  if (request.excludeProductIds?.includes(product.productId)) return "excluded";

  if (
    product.availableCountryCodes &&
    product.availableCountryCodes.length > 0 &&
    !product.availableCountryCodes.includes(request.destinationCountry)
  ) {
    return "foreign_retailer";
  }

  if (
    product.currency &&
    request.currency &&
    product.currency !== request.currency
  ) {
    return "foreign_retailer";
  }

  const excluded = request.excludeSubjectIds;

  if (
    product.labelledContributions.some(
      (item) => item.subjectId && excluded.includes(item.subjectId)
    )
  ) {
    return "excluded";
  }

  if (request.allowedForms && request.allowedForms.length > 0) {
    if (!request.allowedForms.includes(product.form)) {
      return "form";
    }
  }

  if (
    request.dietaryPreference === "plant_based" &&
    (product.dietarySource === "fish" || product.omegaSource === "fish")
  ) {
    return "wrong_source";
  }

  const algaeOnly =
    request.omega3SourcePreference === "algae_only" ||
    request.dietaryPreference === "vegan";

  if (
    algaeOnly &&
    (product.omegaSource === "fish" ||
      isNonAlgaeOmegaLine({
        brandName: null,
        facts: labelledFacts(product),
        title: product.title
      }))
  ) {
    return "wrong_source";
  }

  if (
    request.dietaryPreference === "vegan" &&
    isAnimalDerivedSku({
      brandName: null,
      facts: labelledFacts(product),
      title: product.title
    })
  ) {
    return "vegan";
  }

  const sex = request.profileKnown?.sex === false ? undefined : request.profile.sex;
  const ageYears = request.profileKnown?.ageYears === false ? undefined : request.profile.ageYears;
  const lifeStage = request.profileKnown?.lifeStage === false ? undefined : request.profile.lifeStage;

  if (sex === "male" && product.productAudience === "female") {
    return "life_stage";
  }

  if (sex === "female" && product.productAudience === "male") {
    return "life_stage";
  }

  const prenatalSku =
    product.prenatalOrFertility ||
    isPrenatalOrFertilitySku({
      brandName: null,
      facts: [],
      title: product.title
    });

  if (prenatalSku) {
    const prenatalLifeStage =
      lifeStage === "pregnant" || lifeStage === "trying_to_conceive";

    if (sex === "male" || (lifeStage !== undefined && !prenatalLifeStage)) {
      return "life_stage";
    }
  }

  if (titleImpliesSeniorAgeBand(product.title)) {
    if (
      (ageYears !== undefined && ageYears < 50) ||
      lifeStage === "child" ||
      lifeStage === "pregnant" ||
      lifeStage === "trying_to_conceive"
    ) {
      return "life_stage";
    }
  }

  if (titleImpliesChildAgeBand(product.title) && lifeStage !== undefined && lifeStage !== "child") {
    return "life_stage";
  }

  if (lifeStage === "child" && product.productAudience === "male") {
    return "life_stage";
  }

  return null;
}

export function productEligible(
  product: MatcherProduct,
  request: CanonicalRequest
) {
  return productRejectionReason(product, request) == null;
}
