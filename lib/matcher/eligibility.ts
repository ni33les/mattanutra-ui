import {
  isAnimalDerivedSku,
  isNonAlgaeOmegaLine,
  isPrenatalOrFertilitySku
} from "@/lib/agentic/catalogue/product-fit";
import type { CanonicalRequest, MatcherProduct } from "@/lib/matcher/types";

export function productEligible(
  product: MatcherProduct,
  request: CanonicalRequest
) {
  if (!product.orderable || product.incompleteCommercialFacts) {
    return false;
  }

  if (product.status !== "approved") {
    return false;
  }

  if (product.stockStatus === "unavailable") {
    return false;
  }

  if (product.unitPriceMinor <= 0) {
    return false;
  }

  if (product.unknownSafetyAmount) {
    return false;
  }

  if (
    product.availableCountryCodes &&
    product.availableCountryCodes.length > 0 &&
    !product.availableCountryCodes.includes(request.destinationCountry)
  ) {
    return false;
  }

  const excluded = request.excludeSubjectIds;

  if (
    product.labelledContributions.some(
      (item) => item.subjectId && excluded.includes(item.subjectId)
    )
  ) {
    return false;
  }

  if (request.allowedForms && request.allowedForms.length > 0) {
    if (!request.allowedForms.includes(product.form)) {
      return false;
    }
  }

  if (
    request.dietaryPreference === "plant_based" &&
    (product.dietarySource === "fish" || product.omegaSource === "fish")
  ) {
    return false;
  }

  const algaeOnly =
    request.omega3SourcePreference === "algae_only" ||
    request.dietaryPreference === "vegan";

  if (
    algaeOnly &&
    (product.omegaSource === "fish" ||
      isNonAlgaeOmegaLine({
        brandName: null,
        facts: product.labelledContributions.map((item) => ({
          amount: item.amount,
          comparableAmount: null,
          confidence: "high" as const,
          itemType: "supplement" as const,
          name: item.name,
          normalizedName: item.name,
          unit: item.unit
        })),
        title: product.title
      }))
  ) {
    return false;
  }

  if (
    request.dietaryPreference === "vegan" &&
    isAnimalDerivedSku({
      brandName: null,
      facts: product.labelledContributions.map((item) => ({
        amount: item.amount,
        comparableAmount: null,
        confidence: "high" as const,
        itemType: "supplement" as const,
        name: item.name,
        normalizedName: item.name,
        unit: item.unit
      })),
      title: product.title
    })
  ) {
    return false;
  }

  const sex = request.profile.sex;

  if (sex === "male" && product.productAudience === "female") {
    return false;
  }

  if (sex === "female" && product.productAudience === "male") {
    return false;
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
      request.profile.lifeStage === "pregnant" ||
      request.profile.lifeStage === "trying_to_conceive";

    if (sex === "male" || !prenatalLifeStage) {
      return false;
    }
  }

  if (request.profile.lifeStage === "child" && product.productAudience === "male") {
    return false;
  }

  return true;
}
