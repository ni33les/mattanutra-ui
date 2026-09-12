import { assessPreferences, verifiedPillLowerBound } from "@/lib/matcher/preferences";
import { productContributionAvailability } from '@/lib/matcher/product-availability';
import { administrationDailyPills } from "@/lib/product-administration";
import { sha256Hex } from "@/lib/sha256";
import { webHealthAdvice } from "@/lib/web-health-advice";
import { isPrenatalOrFertilitySku } from "@/lib/agentic/catalogue/product-fit";
import { COVERAGE_SCALE, MATCHER_VERSION } from "@/lib/matcher/config";
import { canonicalTargetSetHash, impliedOmegaPreference } from "@/lib/matcher/canonicalizer";
import { canonicalizeCurrents, canonicalizeTargets } from "@/lib/matcher/canonicalizer";
import { compileGroups, contributionFor } from "@/lib/matcher/candidates";
import {
  WEB_MATCHER_CONFIG
} from "@/lib/matcher/config";
import { coverageUnits } from "@/lib/matcher/dominance";
import { isDoseError, scaleAmount } from "@/lib/matcher/dose";
import { match } from "@/lib/matcher";
import type { CanonicalRequest, CatalogSnapshot, ProductGroup } from "@/lib/matcher/types";
import { compareBaskets, hasFewerConcerns, selectOptions } from "@/lib/matcher/selector";
import { ratioForSupportedServings } from "@/lib/matcher/serving-grid";
import { matcherSafetyCeilings } from "@/lib/matcher/safety-ceilings";
import { marketingCoveragePercentFromNeedCoverage } from "@/lib/marketing-coverage";
import { whyProductMatches } from "@/lib/product-recommendation-metrics";
import { productContainsFoodAllergen } from "@/lib/product-food-allergens";
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

function amountFromNeed(need: ProductRecommendationNeed) {
  const amount = need.targetDose?.amount ?? need.targetComparableAmount ?? 0;
  const unit = need.targetDose?.unit;
  return amount * (unit === "billion_cfu" ? 1_000_000_000 : unit === "million_cfu" ? 1_000_000 : 1);
}

const matcherProductByCandidate = new WeakMap<ProductCandidate, MatcherProduct>();
const searchContextByResult = new WeakMap<ProductRecommendationResult, { request: CanonicalRequest; baskets: ScoredBasket[] }>();
const compiledGroupsByCandidates = new WeakMap<
  readonly ProductCandidate[],
  { catalog: CatalogSnapshot; groups: ProductGroup[]; requestKey: string }
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
  const labelledContributions = candidate.facts.filter(fact => fact.amount != null).map((fact) => ({
    ...{ mappingStatus: fact.mappingStatus, confidence: fact.confidence, source: fact.source, sourceUrl: fact.sourceUrl, sourceText: fact.sourceText },
    amount: fact.amount!,
    name: fact.name,
    subjectId: labelledSubjectId(fact),
    unit: fact.unit
  }));
  const mapped: MatcherProduct = {
    administration: candidate.administration ?? null,
    pillCountKnown: administrationDailyPills(candidate.administration) != null || Boolean(candidate.matchingFacts?.pillCountKnown),
    availableCountryCodes: candidate.availableCountryCodes ?? null,
    contributionSubjectIds: [
      ...new Set(
        labelledContributions
          .map((item) => item.subjectId)
          .filter((item): item is string => Boolean(item))
      )
    ],
    currency: candidate.currency,
    dailyPillsPerServing: administrationDailyPills(candidate.administration) ?? candidate.matchingFacts?.dailyPillsPerServing ?? 0,
    dietarySource: candidate.matchingFacts?.dietarySource ?? "any",
    form: candidate.administration?.physicalUnit ?? candidate.matchingFacts?.form ?? "unknown",
    imageUrl: candidate.imageUrl?.trim() || null,
    incompleteCommercialFacts: false,
    labelledContributions,
    omegaSource: candidate.matchingFacts?.omegaSource ?? "none",
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
    unknownSafetyAmount: candidate.facts.some(fact => fact.amount == null || fact.confidence !== "high" || fact.mappingStatus === "conflicting"),
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

  return Math.max(0, Math.min(100, units / (COVERAGE_SCALE / 100)));
}

export function matcherProductCoversNeed(
  product: MatcherProduct,
  need: ProductRecommendationNeed
) {
  return contributionFor(product, need.displayName, need.normalizedName || need.sourceId || need.id).length > 0;
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
  const declared = selected?.variantDoses?.find(dose => dose.productId === productId)?.dailyUnits;
  if (declared != null) return declared;
  const variantId = selected?.variantIds.find((id) =>
    id.includes(`${productId}:x`) || id.startsWith(`${productId}:x`)
  );
  const parsed = Number(variantId?.split(":x").at(-1));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
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
    const amount = amountFromNeed(need);
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

      const ratio = ratioForSupportedServings(product, servingMultiplier);
      if (!ratio) continue;
      delivered += scaled.units * ratio.num / ratio.den;
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
  selected: ScoredBasket | null,
  available?: ReturnType<typeof productContributionAvailability>
): ProductRecommendationNeedDiagnostic[] {
  return needs.map((need) => ({
    targetBasis: need.itemType === "supplement" || need.itemType === "nutrient" ? "supplemental" as const : undefined,
    bestRejectedProductId: null,
    bestRejectedReason: matcherNeedCoveragePercent(selected?.coverageBySubject, need) > 0 || !available ? null
      : needSubjectIds(need).some(id => available.supplied.has(id)) ? 'not_selected'
        : needSubjectIds(need).some(id => available.unknown.has(id)) ? 'unknown' : 'unavailable',
    coveragePercent: matcherNeedCoveragePercent(
      selected?.coverageBySubject,
      need
    ),
    displayName: need.displayName,
    id: need.id,
    itemType: need.itemType === "food" ? "food" : "supplement"
  }));
}

export function webTargetsForNeeds(needs: readonly ProductRecommendationNeed[]) {
  return canonicalizeTargets({
    targets: needs.filter(need => need.itemType === "supplement" || need.itemType === "nutrient").map((need) => ({
      amount: amountFromNeed(need),
      basis: "supplemental",
      importance: /(?:add[ -]?on|optional)/i.test(need.category) ? "optional" : /^foundation$/i.test(need.category.trim()) ? "core" : "required",
      name: need.displayName,
      subjectId: need.normalizedName || need.sourceId || need.id,
      unit: need.targetDose
        ? unitFromNeed(need.targetDose.unit)
        : "mcg"
    }))
  });
}

export function recommendWithMatcher(
  input: ProductRecommendationInput
): ProductRecommendationResult {
  const empty: ProductRecommendationResult = {
    clientNeeds: input.needs,
    diagnostics: {
      catalogueFingerprint: input.catalogueFingerprint,
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

  const request = webMatcherRequest(input);
  if (!request) return empty;
  return recommendPreparedWeb(input, request);
}

/** Shared preparation for actual matching and the pre-formulation allow-list. */
export function webMatcherRequest(input: ProductRecommendationInput): CanonicalRequest | null {
  const targets = webTargetsForNeeds(input.needs.filter(need => need.itemType === 'supplement' || need.itemType === 'nutrient'));
  const currents = canonicalizeCurrents(input.clientContext?.continuedIntake ?? []);

  if ("error" in currents) {
    return null;
  }

  const dietary = input.clientContext?.dietaryPreference ?? "any";
  const excludedProductIds = [...new Set([
    ...(input.clientContext?.excludeProductIds ?? []),
    ...input.candidates.filter(product => (input.clientContext?.foodAllergies ?? [])
      .some(allergen => productContainsFoodAllergen(product, allergen))).map(product => product.id)
  ])].sort();
  const monthlyBudget = ({ u1000: 1000, "1000-2500": 2500, "2500-5000": 5000, low: 1000, mid: 2500, good: 5000 } as Record<string, number>)[input.clientContext?.budgetPreference ?? ""] ?? null;
  const monthlyBasis = input.budgetAmount == null && monthlyBudget !== null;
  const request = {
    acceptedGapSubjectIds: [],
    allowedForms: null,
    conditionCodes: [...(input.clientContext?.conditions ?? [])],
    currency: input.candidates[0]?.currency ?? "THB",
    currentSupplements: currents,
    destinationCountry: (input.countryCode ?? "TH").toUpperCase(),
    dietaryPreference: dietary,
    excludeSubjectIds: [...(input.clientContext?.excludeSupplementIds ?? [])],
    excludeProductIds: excludedProductIds,
    profileKnown: input.clientContext?.profileKnown ?? { ageYears: input.clientContext?.ageYears != null, lifeStage: Boolean(input.clientContext?.lifestage), sex: Boolean(input.clientSex) },
    unknownIntakeSubjectIds: input.clientContext?.unknownIntakeSubjectIds ?? (input.clientContext?.currentSupplements === "none" || input.clientContext?.continuedIntake ? [] : targets.targets.map(target => target.subjectId)),
    estimatedIntakeSubjectIds: input.clientContext?.estimatedIntakeSubjectIds ?? [],
    leftovers: targets.leftovers,
    maxDailyPills: /^\d+(?:-\d+)?$/.test(input.clientContext?.pillLimit ?? "") ? Number(input.clientContext!.pillLimit!.split("-").at(-1)) : null,
    preferenceImportance: /^\d+(?:-\d+)?$/.test(input.clientContext?.pillLimit ?? "") ? { maxDailyPills: "strong" as const } : undefined,
    ...(monthlyBasis ? { pricePreferenceBasis: "monthly_30_days" as const } : {}),
    maxPriceMinor:
      input.budgetAmount != null ? Math.round(input.budgetAmount * 100) : monthlyBudget == null ? null : monthlyBudget * 100,
    maxProductCount: input.maxProducts ?? null,
    productDoses: input.productDoses ?? [],
    searchEffort: input.searchEffort ?? "standard",
    medicationCodes: [...(input.clientContext?.medicationTypes ?? [])],
    omega3SourcePreference: impliedOmegaPreference(
      dietary,
      "any",
      targets.targets.map((item) => item.name)
    ),
    optimization:
      input.stackPreference === "compact" ? "fewest_pills" : "balanced",
    profile: {
      ageYears: input.clientContext?.ageYears ?? 38,
      lifeStage: matcherLifeStage(input.clientContext?.lifestage),
      ...(input.clientSex === "female" || input.clientSex === "male"
        ? { sex: input.clientSex }
        : {})
    },
    retainProductIds: [],
    retainSubjectIds: [],
    safetyCeilings: matcherSafetyCeilings(),
    selectorMode: "web_single",
    targets: targets.targets
  } as const;
  return request;
}

export function webIngredientAvailability(input: ProductRecommendationInput) {
  const request = webMatcherRequest(input);
  if (!request) throw new Error('Invalid continued intake in formulation input');
  return productContributionAvailability(request, input.candidates.map(toMatcherProduct));
}

function recommendPreparedWeb(input: ProductRecommendationInput, request: CanonicalRequest): ProductRecommendationResult {
  const supplementNeeds = input.needs.filter(need => need.itemType === 'supplement' || need.itemType === 'nutrient');
  const compileStartedAt = Date.now();
  // Eligibility and variants depend on the full request, including safety ceilings.
  // Retain only the most recent compilation per weakly held candidate array.
  const requestKey = JSON.stringify(request, (_key, value: unknown) =>
    typeof value === "bigint" ? { matcherInteger: value.toString() } : value
  );
  let compiled = compiledGroupsByCandidates.get(input.candidates);

  if (!compiled || compiled.requestKey !== requestKey) {
    const catalog = compiled?.catalog ?? {
      availabilityAsOf: new Date(0).toISOString(),
      catalogueVersion: input.catalogueFingerprint ?? "web",
      products: input.candidates.map(toMatcherProduct)
    };
    compiled = {
      catalog,
      groups: compileGroups(request, catalog),
      requestKey
    };
    compiledGroupsByCandidates.set(input.candidates, compiled);
  }

  const compileMs = Date.now() - compileStartedAt;
  const searchStartedAt = Date.now();
  const result = match(
    request,
    compiled.catalog,
    WEB_MATCHER_CONFIG,
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
    beamWidth: WEB_MATCHER_CONFIG.initialBeamWidth,
    trimmed: result.trimmed,
    variants: variantCount
  });
  const available = productContributionAvailability(request, compiled.catalog.products);
  const needDiagnostics = needDiagnosticsFromBasket(
    supplementNeeds,
    result.selected,
    available
  );
  const coverage = marketingCoveragePercentFromNeedCoverage(needDiagnostics);
  const byId = new Map(input.candidates.map((item) => [item.id, item]));
  function selectionsFor(basket: ScoredBasket | null): ProductRecommendationSelection[] {
    const recommendations: ProductRecommendationSelection[] = [];
  for (const [index, productId] of (basket?.productIds ?? []).entries()) {
    const product = byId.get(productId);
    if (!product) {
      continue;
    }
    const matcherProduct = toMatcherProduct(product);
    const servingMultiplier = servingMultiplierFromBasket(
      product.id,
      basket
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
    return recommendations;
  }
  const recommendations = selectionsFor(result.selected);
  const options = [result.selected, ...result.alternatives].filter((basket): basket is ScoredBasket => Boolean(basket)).map(basket => {
    const limitRows = (basket.doseFit?.perLimit ?? []).filter(row => (row.exposureMaximum ?? row.exposure) >= row.limit);
    const advice = limitRows.map(row => webHealthAdvice({
      code: "reference_limit_exceeded", kind: "limit", ingredient: row.name,
      amount: row.exposureMaximum ?? row.exposure, unit: row.unit,
      amountRange: row.exposureMinimum != null && row.exposureMaximum != null && row.exposureMinimum !== row.exposureMaximum
        ? { minimum: row.exposureMinimum, maximum: row.exposureMaximum } : null,
      limit: { amount: row.limit, unit: row.unit, sourceScope: row.sourceScope },
      authorityUrl: row.authorityUrl, evidence: row.ruleId
    }));
    for (const row of basket.doseFit?.perTarget ?? []) {
      if ((row.exposureMaximum ?? row.exposure) <= row.target) continue;
      advice.push(webHealthAdvice({ code: "target_exceeded", kind: "target", ingredient: row.name,
        amount: row.exposure, unit: row.unit,
        amountRange: row.exposureMinimum != null && row.exposureMaximum != null && row.exposureMinimum !== row.exposureMaximum
          ? { minimum: row.exposureMinimum, maximum: row.exposureMaximum } : null,
        referenceDose: { amount: row.target, unit: row.unit, basis: "agreed_target" }, evidence: "Agreed supplemental target" }));
    }
    for (const row of basket.doseFit?.perContinuedDose ?? []) {
      if (row.over <= 0) continue;
      advice.push(webHealthAdvice({ code: "continued_dose_increased", kind: "continued", ingredient: row.name,
        amount: row.exposure, unit: row.unit,
        amountRange: row.exposureMinimum !== row.exposureMaximum ? { minimum: row.exposureMinimum, maximum: row.exposureMaximum } : null,
        referenceDose: { amount: row.referenceDose, unit: row.unit, basis: "continued_dose" },
        evidence: `Reported continued supplement intake: ${row.sourceIds.join(", ")}` }));
    }
    for (const finding of basket.safety.findings) {
      if (finding.code === "target_exceeded" || finding.code === "continued_dose_increased" || limitRows.some(row => row.ruleId === finding.ruleId)) continue;
      const scale = finding.unit ? scaleAmount({ amount: 1, unit: finding.unit, subjectId: finding.subjectId ?? "", subjectName: finding.nutrientName ?? "" }) : null;
      const amount = scale && !isDoseError(scale) && scale.units > BigInt(0) && finding.exposureUnits != null
        ? Number(finding.exposureUnits) / Number(scale.units) : null;
      advice.push(webHealthAdvice({ code: finding.code, kind: /unknown|incomplete|unverified/.test(finding.code) ? "unknown" : "context", amount,
        unit: finding.unit, ingredient: finding.nutrientName ?? finding.subjectId ?? "Ingredient", authorityUrl: finding.authorityUrl, evidence: finding.ruleId }));
    }
    for (const subjectId of basket.doseFit?.unknownSubjectIds ?? []) {
      advice.push(webHealthAdvice({ code: "intake_unknown", kind: "unknown", ingredient: supplementNeeds.find(need => need.normalizedName === subjectId)?.displayName ?? subjectId }));
    }
    if (input.clientContext?.unknownHealthFields?.length && !advice.some(row => row.code === "incomplete_health_information")) {
      advice.push(webHealthAdvice({ code: "incomplete_health_information", kind: "unknown", ingredient: "Health information",
        evidence: "Medication or condition information is incomplete." }));
    }
    const dailyPills = basket.pillCountKnown === false ? null : basket.dailyPills;
    const completePrice = basket.productIds.every(id => {
      const candidate = byId.get(id);
      return candidate && !toMatcherProduct(candidate).incompleteCommercialFacts;
    });
    return {
      preferences: assessPreferences(request, { productCount: basket.productCount, dailyPills,
        dailyPillsLowerBound: verifiedPillLowerBound((basket.variantDoses ?? []).map(dose => ({ dailyPills: dose.dailyPills, pillCountKnown: byId.has(dose.productId) && toMatcherProduct(byId.get(dose.productId)!).pillCountKnown !== false }))), firstOrderGoodsPriceMinor: completePrice ? basket.priceMinor : null,
        monthlyGoodsPriceMinor: request.pricePreferenceBasis === 'monthly_30_days' ? basket.overallScore?.preferences.maxPriceMinor.actual ?? null : undefined, currency: request.currency }),
      overallScore: basket.overallScore,
      roles: basket.roles, purchaseEligible: basket.productIds.length > 0,
      candidateKey: `webopt_${sha256Hex([...basket.variantIds].sort().join("|")).slice(0, 20)}`,
      productIds: [...basket.productIds], dailyServings: basket.productIds.map(id => servingMultiplierFromBasket(id, basket)),
      coveragePercent: marketingCoveragePercentFromNeedCoverage(needDiagnosticsFromBasket(supplementNeeds, basket)),
      priceMinor: basket.priceMinor,
      dailyPills,
      doseFit: basket.doseFit ?? null, advice,
      recommendations: selectionsFor(basket)
    };
  });

  const recommendationResult: ProductRecommendationResult = {
    clientNeeds: input.needs,
    diagnostics: {
      catalogueFingerprint: input.catalogueFingerprint,
      matching: { operationalStatus: recommendations.length ? "ready" : options.some(option => option.purchaseEligible) ? "review_options" : "no_purchase", selectedCandidateKey: options[0]?.candidateKey ?? null, options, alternativeSearch: result.alternativeSearch, searchSummary: result.searchSummary, matchingDiagnostics: result.matchingDiagnostics },
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
  searchContextByResult.set(recommendationResult, { request, baskets: [result.selected, ...result.alternatives].filter((basket): basket is ScoredBasket => Boolean(basket)) });
  return recommendationResult;
}

/** Preserve the selected retailer while comparing explicit alternatives across all eligible retailers. */
export function mergeWebRetailerAlternatives(primary: ProductRecommendationResult, peers: readonly ProductRecommendationResult[]) {
  const context = searchContextByResult.get(primary);
  const selected = context?.baskets[0];
  const matching = primary.diagnostics.matching;
  if (!context || !selected || !matching) return primary;
  const requestIdentity = canonicalTargetSetHash(context.request);
  const entries = [primary, ...peers].flatMap(peer => {
    const other = searchContextByResult.get(peer);
    if (!other || canonicalTargetSetHash(other.request) !== requestIdentity) return [];
    return other.baskets.flatMap((basket, index) => {
      const option = peer.diagnostics.matching?.options[index];
      return option ? [{ basket, option }] : [];
    });
  });
  // Use the same role selectors as the core; a health-search status says nothing
  // about whether a cheaper or simpler purchase option is useful.
  const roles = selectOptions({ request: context.request, baskets: entries.map(row => row.basket) });
  const commercial = [roles.selected, ...roles.alternatives].filter((basket): basket is ScoredBasket => Boolean(basket))
    .filter(basket => basket.roles?.some(role => role === "lower_cost" || role === "simpler"));
  const fewer = entries.filter(row => hasFewerConcerns(row.basket, selected, context.request))
    .sort((a, b) => compareBaskets(a.basket, b.basket, context.request))[0];
  const options = new Map<string, NonNullable<ProductRecommendationResult["diagnostics"]["matching"]>["options"][number]>(matching.options.map(option => [option.candidateKey, { ...option, roles: option.roles?.filter(role => role !== "lower_cost" && role !== "simpler") }]));
  for (const basket of commercial) {
    const entry = entries.find(row => row.basket.sellerId === basket.sellerId && row.basket.variantIds.join("|") === basket.variantIds.join("|"));
    if (!entry) continue;
    const previous = options.get(entry.option.candidateKey);
    const commercialRoles = basket.roles!.filter(role => role === "lower_cost" || role === "simpler");
    options.set(entry.option.candidateKey, { ...entry.option, roles: [...new Set([...(previous?.roles ?? []), ...commercialRoles])] });
  }
  if (fewer) {
    const previous = options.get(fewer.option.candidateKey);
    options.set(fewer.option.candidateKey, { ...fewer.option, roles: [...new Set([...(previous?.roles ?? []), "fewer_concerns" as const])] });
  }
  const incomplete = peers.some(peer => peer.diagnostics.matching?.alternativeSearch?.status === "incomplete");
  const alternativeSearch = fewer ? { status: "found" as const, reason: "Fewer concerns without lower requested-target coverage across eligible retailers" }
    : matching.alternativeSearch?.status === "not_needed" ? matching.alternativeSearch
      : incomplete ? { status: "incomplete" as const, reason: "Some retailer alternatives could not be fully evaluated" }
        : { status: "none_found" as const, reason: "No distinct option with fewer concerns met the same requirements across eligible retailers" };
  const retainedOptions = [...options.values()].filter(option => option.candidateKey === matching.selectedCandidateKey || Boolean(option.roles?.length));
  return { ...primary, diagnostics: { ...primary.diagnostics, matching: { ...matching, options: retainedOptions, alternativeSearch } } };
}
