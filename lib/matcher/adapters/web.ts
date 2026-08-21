import { isPrenatalOrFertilitySku } from "@/lib/agentic/catalogue/product-fit";
import { MATCHER_VERSION } from "@/lib/matcher/config";
import { impliedOmegaPreference } from "@/lib/matcher/canonicalizer";
import { canonicalizeCurrents, canonicalizeTargets } from "@/lib/matcher/canonicalizer";
import { match } from "@/lib/matcher";
import { matcherSafetyCeilings } from "@/lib/matcher/safety-ceilings";
import { productEligible } from "@/lib/matcher/eligibility";
import { publicCoveragePercent } from "@/lib/matcher/explainer";
import type { MatcherProduct, MatcherUnit } from "@/lib/matcher/types";
import type {
  ProductCandidate,
  ProductRecommendationInput,
  ProductRecommendationResult,
  ProductRecommendationSelection
} from "@/lib/product-recommendation-types";

function unitFromNeed(unit: string | null | undefined): MatcherUnit {
  const normalized = (unit ?? "mg").toLowerCase();

  if (normalized === "iu") {
    return "IU";
  }

  if (normalized === "cfu" || normalized === "billion_cfu" || normalized === "million_cfu") {
    return "CFU";
  }

  if (normalized === "g") {
    return "g";
  }

  if (normalized === "mcg" || normalized === "ug") {
    return "mcg";
  }

  if (normalized === "ml") {
    return "ml";
  }

  if (normalized === "serving") {
    return "serving";
  }

  return "mg";
}

function toMatcherProduct(candidate: ProductCandidate): MatcherProduct {
  const price = candidate.unitPriceAmount ?? candidate.priceAmount ?? 0;
  return {
    availableCountryCodes: candidate.availableCountryCodes ?? null,
    contributionSubjectIds: candidate.facts
      .map((fact) => fact.supplementId)
      .filter((item): item is string => Boolean(item)),
    currency: candidate.currency,
    dailyPillsPerServing: 1,
    dietarySource: "any",
    form: "capsule",
    imageUrl: candidate.imageUrl?.trim() || null,
    incompleteCommercialFacts: false,
    labelledContributions: candidate.facts.map((fact) => ({
      amount: fact.comparableAmount ?? fact.amount ?? 0,
      name: fact.name,
      subjectId: fact.supplementId ?? null,
      unit: fact.comparableAmount != null ? "mcg" : fact.unit
    })),
    omegaSource: "none",
    orderable:
      candidate.status === "approved" &&
      candidate.availabilityStatus !== "unavailable" &&
      price > 0,
    prenatalOrFertility: isPrenatalOrFertilitySku(candidate),
    productAudience: candidate.productAudience ?? "both",
    productId: candidate.id,
    retailerSku: candidate.retailSellableProductId ?? candidate.id,
    sellerId: candidate.selectedRetailerOrganisationId ?? "retailer",
    sellerName: candidate.selectedRetailerName ?? "Retailer",
    source: "retail",
    status:
      candidate.status === "deleted" ||
      candidate.status === "ignored" ||
      candidate.status === "pending_review"
        ? candidate.status
        : "approved",
    stockStatus:
      candidate.retailAvailabilityStatus === "backorder"
        ? "backorder"
        : candidate.availabilityStatus === "out_of_stock" ||
            candidate.retailAvailabilityStatus === "unavailable"
          ? "unavailable"
          : "in_stock",
    title: candidate.title,
    unknownSafetyAmount: false,
    unitPriceMinor: Math.round(price * 100)
  };
}

export function recommendWithMatcher(
  input: ProductRecommendationInput
): ProductRecommendationResult {
  const supplementNeeds = input.needs.filter(
    (need) => need.itemType === "supplement" || need.itemType === "nutrient"
  );
  const targets = canonicalizeTargets({
    targets: supplementNeeds.map((need) => ({
      amount:
        need.targetDose?.amount ??
        need.targetComparableAmount ??
        0,
      name: need.displayName,
      subjectId: need.sourceId || need.id,
      unit: need.targetDose
        ? unitFromNeed(need.targetDose.unit)
        : "mcg"
    }))
  });
  const empty: ProductRecommendationResult = {
    clientNeeds: input.needs,
    diagnostics: {
      algorithmVersion: MATCHER_VERSION,
      blockedProducts: [],
      coverage: {
        foodCoveragePercent: 0,
        supplementProductCoveragePercent: 0,
        totalPlanCoveragePercent: 0
      },
      factIssues: [],
      matchedNeeds: [],
      nearMisses: [],
      productsConsidered: input.candidates.length,
      unmatchedNeeds: []
    },
    exclusions: [],
    foodCoveragePercent: 0,
    recommendations: [],
    stackCoveragePercent: 0,
    supplementProductCoveragePercent: 0,
    totalPlanCoveragePercent: 0
  };

  if ("error" in targets) {
    return empty;
  }

  const currents = canonicalizeCurrents([]);

  if ("error" in currents) {
    return empty;
  }

  const lifestage = input.clientContext?.lifestage;
  const dietary =
    input.clientContext?.preferredForm === "vegan" ? "vegan" : "any";
  const result = match(
    {
      acceptedGapSubjectIds: [],
      allowedForms: null,
      conditionCodes: [...(input.clientContext?.conditions ?? [])],
      currency: input.candidates[0]?.currency ?? "THB",
      currentSupplements: currents,
      destinationCountry: (input.countryCode ?? "TH").toUpperCase(),
      dietaryPreference: dietary,
      excludeSubjectIds: [],
      leftovers: targets.leftovers,
      maxDailyPills: null,
      maxPriceMinor:
        input.budgetAmount != null ? Math.round(input.budgetAmount * 100) : null,
      maxProductCount: input.maxProducts ?? 6,
      medicationCodes: [...(input.clientContext?.medicationTypes ?? [])],
      omega3SourcePreference: impliedOmegaPreference(dietary, "any"),
      optimization:
        input.stackPreference === "compact" ? "fewest_pills" : "best_coverage",
      profile: {
        ageYears: 38,
        lifeStage:
          lifestage === "child" ||
          lifestage === "pregnant" ||
          lifestage === "breastfeeding" ||
          lifestage === "trying_to_conceive"
            ? lifestage
            : "adult",
        sex: input.clientSex === "female" || input.clientSex === "male"
          ? input.clientSex
          : "unspecified"
      },
      retainProductIds: [],
      retainSubjectIds: [],
      safetyCeilings: matcherSafetyCeilings(),
      selectorMode: "web_single",
      targets: targets.targets
    },
    {
      availabilityAsOf: new Date(0).toISOString(),
      catalogueVersion: "web",
      products: input.candidates.map(toMatcherProduct)
    }
  );
  const coverage = publicCoveragePercent(result.selected);
  const byId = new Map(input.candidates.map((item) => [item.id, item]));
  const recommendations: ProductRecommendationSelection[] = [];
  for (const [index, productId] of (result.selected?.productIds ?? []).entries()) {
    const product = byId.get(productId);
    if (!product) {
      continue;
    }
    recommendations.push({
      coveredNeeds: supplementNeeds,
      availabilityStatus:
        product.retailAvailabilityStatus ??
        (product.availabilityStatus === "in_stock" ? "available_now" : "available_now"),
      etaDate: product.retailEtaDate ?? null,
      priceSource: product.priceSource ?? null,
      product,
      productCoveragePercent: coverage,
      rank: index + 1,
      retailSellableProductId: product.retailSellableProductId ?? null,
      score: coverage,
      selectedRetailerName: product.selectedRetailerName ?? null,
      selectedRetailerOrganisationId:
        product.selectedRetailerOrganisationId ?? null,
      servingMultiplier: 1,
      stackContributionPercent: coverage,
      unitPriceAmount: product.unitPriceAmount ?? product.priceAmount ?? null,
      url: product.productUrl,
      unknownAtRecommendation: false,
      why: result.selected?.reason ?? "Selected stack"
    });
  }

  return {
    clientNeeds: input.needs,
    diagnostics: {
      algorithmVersion: MATCHER_VERSION,
      blockedProducts: [],
      coverage: {
        foodCoveragePercent: 0,
        supplementProductCoveragePercent: coverage,
        totalPlanCoveragePercent: coverage
      },
      factIssues: [],
      matchedNeeds: [],
      nearMisses: [],
      productsConsidered: input.candidates.length,
      unmatchedNeeds: [],
      trace: {
        alternativeStacks: [],
        componentScores: {},
        contextSignals: {},
        excludedPredicates: [],
        searchMode: "full-beam",
        shortfalls: [],
        shortlistSize: input.candidates.length,
        utilityScore: coverage,
        weightDeltas: {},
        weights: {}
      }
    },
    exclusions: input.candidates
      .filter((item) => !recommendations.some((row) => row.product.id === item.id))
      .filter(
        (item) =>
          item.status === "pending_review" ||
          item.status === "ignored" ||
          (item.productAudience === "female" && input.clientSex === "male") ||
          (item.productAudience === "male" && input.clientSex === "female") ||
          item.labelStatus === "missing" ||
          item.labelStatus === "failed"
      )
      .map((item) => ({
        productId: item.id,
        reason:
          item.status === "pending_review"
            ? "Product is not approved yet"
            : item.productAudience === "female" && input.clientSex === "male"
              ? "Product is intended for female clients"
              : "Excluded from matching",
        title: item.title
      })),
    foodCoveragePercent: 0,
    recommendations,
    stackCoveragePercent: coverage,
    supplementProductCoveragePercent: coverage,
    totalPlanCoveragePercent: coverage
  };
}
