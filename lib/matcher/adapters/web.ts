import { isPrenatalOrFertilitySku } from "@/lib/agentic/catalogue/product-fit";
import { COVERAGE_SCALE, MATCHER_VERSION } from "@/lib/matcher/config";
import { impliedOmegaPreference } from "@/lib/matcher/canonicalizer";
import { canonicalizeCurrents, canonicalizeTargets } from "@/lib/matcher/canonicalizer";
import { compileGroups, contributionFor } from "@/lib/matcher/candidates";
import {
  WEB_COMPACT_MATCHER_CONFIG,
  WEB_MATCHER_CONFIG
} from "@/lib/matcher/config";
import { coverageUnits } from "@/lib/matcher/dominance";
import { isDoseError, scaleAmount } from "@/lib/matcher/dose";
import { match } from "@/lib/matcher";
import type { CatalogSnapshot, ProductGroup } from "@/lib/matcher/types";
import { matcherSafetyCeilings } from "@/lib/matcher/safety-ceilings";
import { publicCoveragePercent } from "@/lib/matcher/explainer";
import { whyProductMatches } from "@/lib/product-recommendation-metrics";
import {
  normalizeProductFactKey,
  productKeysMatch
} from "@/lib/product-key-matching";
import type {
  LifeStage,
  MatcherProduct,
  MatcherUnit,
  ScoredBasket
} from "@/lib/matcher/types";
import type {
  ProductCandidate,
  ProductRecommendationInput,
  ProductRecommendationNeed,
  ProductRecommendationNeedDiagnostic,
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

const matcherProductByCandidate = new WeakMap<ProductCandidate, MatcherProduct>();
const compiledGroupsByCandidates = new WeakMap<
  readonly ProductCandidate[],
  { catalog: CatalogSnapshot; groups: ProductGroup[] }
>();

function labelledSubjectId(fact: ProductCandidate["facts"][number]) {
  const fromName = fact.normalizedName?.trim();

  if (fromName && !/^[0-9a-f-]{36}$/i.test(fromName)) {
    return fromName;
  }

  const fromId = fact.supplementId?.trim();

  if (fromId && !/^[0-9a-f-]{36}$/i.test(fromId)) {
    return fromId;
  }

  return fromName || null;
}

function toMatcherProduct(candidate: ProductCandidate): MatcherProduct {
  const cached = matcherProductByCandidate.get(candidate);

  if (cached) {
    return cached;
  }

  const price = candidate.unitPriceAmount ?? candidate.priceAmount ?? 0;
  const labelledContributions = candidate.facts.map((fact) => ({
    amount: fact.amount ?? 0,
    name: fact.name,
    subjectId: labelledSubjectId(fact),
    unit: fact.unit
  }));
  const mapped: MatcherProduct = {
    availableCountryCodes: candidate.availableCountryCodes ?? null,
    contributionSubjectIds: [
      ...new Set(
        labelledContributions
          .map((item) => item.subjectId)
          .filter((item): item is string => Boolean(item))
      )
    ],
    currency: candidate.currency,
    dailyPillsPerServing: 1,
    dietarySource: "any",
    form: "capsule",
    imageUrl: candidate.imageUrl?.trim() || null,
    incompleteCommercialFacts: false,
    labelledContributions,
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

  matcherProductByCandidate.set(candidate, mapped);

  return mapped;
}

function needSubjectIds(need: ProductRecommendationNeed) {
  const sourceId = need.sourceId?.trim();
  const id = need.id?.trim();
  const fromPrefixed = id?.includes(":")
    ? id.slice(id.indexOf(":") + 1)
    : null;
  const raw = [need.normalizedName?.trim(), sourceId, id, fromPrefixed].filter(
    Boolean
  ) as string[];

  return [
    ...new Set(
      raw.flatMap((value) => [
        value,
        value.replace(/-/g, "_"),
        value.replace(/_/g, "-")
      ])
    )
  ];
}

export function matcherNeedCoveragePercent(
  coverageBySubject: ReadonlyMap<string, number> | undefined,
  need: ProductRecommendationNeed
) {
  if (!coverageBySubject) {
    return 0;
  }

  let units = 0;

  for (const subjectId of needSubjectIds(need)) {
    units = Math.max(units, coverageBySubject.get(subjectId) ?? 0);
  }

  return Math.max(0, Math.min(100, Math.round(units / (COVERAGE_SCALE / 100))));
}

export function matcherProductCoversNeed(
  product: MatcherProduct,
  need: ProductRecommendationNeed
) {
  const subjectIds = new Set(needSubjectIds(need));

  if (product.contributionSubjectIds.some((id) => subjectIds.has(id))) {
    return true;
  }

  for (const contribution of product.labelledContributions) {
    if (!contribution.amount || contribution.amount <= 0) {
      continue;
    }

    if (contribution.subjectId && subjectIds.has(contribution.subjectId)) {
      return true;
    }

    const factKey = normalizeProductFactKey(contribution.name);
    const aliases = need.aliasKeys ?? [];

    if (
      factKey === need.normalizedName ||
      aliases.includes(factKey) ||
      productKeysMatch(need.normalizedName, factKey, aliases)
    ) {
      return true;
    }
  }

  return false;
}

function matcherLifeStage(value: string | null | undefined): LifeStage {
  const text = (value ?? "").toLowerCase().replace(/-/g, "_");

  if (text.includes("pregnan")) {
    return "pregnant";
  }

  if (
    text.includes("trying_to_conceive") ||
    text.includes("trying to conceive") ||
    /\bttc\b/.test(text)
  ) {
    return "trying_to_conceive";
  }

  if (text.includes("breastfeed")) {
    return "breastfeeding";
  }

  if (/\bchild\b/.test(text)) {
    return "child";
  }

  return "adult";
}

function servingMultiplierFromBasket(
  productId: string,
  selected: ScoredBasket | null
) {
  const variantId = selected?.variantIds.find((id) =>
    id.startsWith(`${productId}:x`)
  );
  const parsed = Number(variantId?.match(/:x(\d+)$/)?.[1]);

  return parsed === 2 || parsed === 3 ? parsed : 1;
}

function matcherProductOwnCoveragePercent(
  product: MatcherProduct,
  needs: readonly ProductRecommendationNeed[],
  servingMultiplier = 1
) {
  if (needs.length < 1) {
    return 0;
  }

  let weightedUnits = 0;
  let totalWeight = 0;

  for (const need of needs) {
    const weight = need.weight > 0 ? need.weight : 1;
    totalWeight += weight;
    const amount = need.targetDose?.amount ?? need.targetComparableAmount ?? 0;
    const unit = need.targetDose ? unitFromNeed(need.targetDose.unit) : "mcg";
    const subjectId = need.normalizedName || need.sourceId || need.id;
    const requested = scaleAmount({
      amount,
      subjectId,
      subjectName: need.displayName,
      unit
    });

    if (isDoseError(requested) || requested.units <= BigInt(0)) {
      continue;
    }

    let delivered = BigInt(0);

    for (const fact of contributionFor(product, need.displayName, subjectId)) {
      if (fact.amount == null || !fact.unit) {
        continue;
      }

      const scaled = scaleAmount({
        amount: fact.amount,
        subjectId,
        subjectName: need.displayName,
        unit: fact.unit
      });

      if (isDoseError(scaled) || scaled.dim !== requested.dim) {
        continue;
      }

      delivered += scaled.units * BigInt(Math.max(1, servingMultiplier));
    }

    weightedUnits += weight * coverageUnits(delivered, requested.units);
  }

  if (totalWeight <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(100, Math.round(weightedUnits / totalWeight / (COVERAGE_SCALE / 100)))
  );
}

function needDiagnosticsFromBasket(
  needs: readonly ProductRecommendationNeed[],
  selected: ScoredBasket | null
): ProductRecommendationNeedDiagnostic[] {
  return needs.map((need) => ({
    bestRejectedProductId: null,
    bestRejectedReason: null,
    coveragePercent: matcherNeedCoveragePercent(
      selected?.coverageBySubject,
      need
    ),
    displayName: need.displayName,
    id: need.id,
    itemType: need.itemType === "food" ? "food" : "supplement"
  }));
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
      subjectId: need.normalizedName || need.sourceId || need.id,
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

  const dietary =
    input.clientContext?.preferredForm === "vegan" ? "vegan" : "any";
  const request = {
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
    omega3SourcePreference: impliedOmegaPreference(
      dietary,
      "any",
      targets.targets.map((item) => item.name)
    ),
    optimization:
      input.stackPreference === "compact" ? "fewest_pills" : "best_coverage",
    profile: {
      ageYears: 38,
      lifeStage: matcherLifeStage(input.clientContext?.lifestage),
      sex: input.clientSex === "female" || input.clientSex === "male"
        ? input.clientSex
        : "unspecified"
    },
    retainProductIds: [],
    retainSubjectIds: [],
    safetyCeilings: matcherSafetyCeilings(),
    selectorMode:
      input.stackPreference === "compact" ? "agentic" : "web_single",
    targets: targets.targets
  } as const;
  const compileStartedAt = Date.now();
  let compiled = compiledGroupsByCandidates.get(input.candidates);

  if (!compiled) {
    const catalog = {
      availabilityAsOf: new Date(0).toISOString(),
      catalogueVersion: "web",
      products: input.candidates.map(toMatcherProduct)
    };
    compiled = {
      catalog,
      groups: compileGroups(request, catalog)
    };
    compiledGroupsByCandidates.set(input.candidates, compiled);
  }

  const compileMs = Date.now() - compileStartedAt;
  const searchStartedAt = Date.now();
  const result = match(
    request,
    compiled.catalog,
    input.stackPreference === "compact"
      ? WEB_COMPACT_MATCHER_CONFIG
      : WEB_MATCHER_CONFIG,
    compiled.groups
  );
  const variantCount = compiled.groups.reduce(
    (sum, group) => sum + group.variants.length,
    0
  );

  console.info("[matching:search]", {
    compileMs,
    groups: compiled.groups.length,
    mode: result.searchMode,
    searchMs: Date.now() - searchStartedAt,
    stackPreference: input.stackPreference ?? "balanced",
    beamWidth:
      input.stackPreference === "compact"
        ? WEB_COMPACT_MATCHER_CONFIG.initialBeamWidth
        : WEB_MATCHER_CONFIG.initialBeamWidth,
    trimmed: result.trimmed,
    variants: variantCount
  });
  const coverage = publicCoveragePercent(result.selected);
  const needDiagnostics = needDiagnosticsFromBasket(
    supplementNeeds,
    result.selected
  );
  const byId = new Map(input.candidates.map((item) => [item.id, item]));
  const recommendations: ProductRecommendationSelection[] = [];
  for (const [index, productId] of (result.selected?.productIds ?? []).entries()) {
    const product = byId.get(productId);
    if (!product) {
      continue;
    }
    const matcherProduct = toMatcherProduct(product);
    const servingMultiplier = servingMultiplierFromBasket(
      product.id,
      result.selected
    );
    const skuCoverage = matcherProductOwnCoveragePercent(
      matcherProduct,
      supplementNeeds,
      servingMultiplier
    );
    const coveredNeeds = supplementNeeds.filter((need) =>
      matcherProductCoversNeed(matcherProduct, need)
    );
    recommendations.push({
      coveredNeeds,
      availabilityStatus:
        product.retailAvailabilityStatus ??
        (product.availabilityStatus === "in_stock" ? "available_now" : "available_now"),
      etaDate: product.retailEtaDate ?? null,
      priceSource: product.priceSource ?? null,
      product,
      productCoveragePercent: skuCoverage,
      rank: index + 1,
      retailSellableProductId: product.retailSellableProductId ?? null,
      score: skuCoverage,
      selectedRetailerName: product.selectedRetailerName ?? null,
      selectedRetailerOrganisationId:
        product.selectedRetailerOrganisationId ?? null,
      servingMultiplier,
      stackContributionPercent: skuCoverage,
      unitPriceAmount: product.unitPriceAmount ?? product.priceAmount ?? null,
      url: product.productUrl,
      unknownAtRecommendation: false,
      why: whyProductMatches(
        product,
        coveredNeeds,
        skuCoverage,
        servingMultiplier
      )
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
      matchedNeeds: needDiagnostics.filter((item) => item.coveragePercent > 0),
      nearMisses: [],
      productsConsidered: input.candidates.length,
      stackPreference: input.stackPreference ?? "balanced",
      unmatchedNeeds: needDiagnostics.filter((item) => item.coveragePercent <= 0),
      trace: {
        alternativeStacks: [],
        componentScores: {},
        contextSignals: {},
        excludedPredicates: [],
        searchMode: "full-beam",
        shortfalls: [],
        shortlistSize: input.candidates.length,
        stackPreference: input.stackPreference ?? "balanced",
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
