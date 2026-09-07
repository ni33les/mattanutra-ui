import { sha256Hex } from "@/lib/sha256";
import { webHealthAdvice } from "@/lib/web-health-advice";
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
import type { CanonicalRequest, CatalogSnapshot, ProductGroup } from "@/lib/matcher/types";
import { hasFewerConcerns } from "@/lib/matcher/selector";
import { compareDoseFit } from "@/lib/matcher/dose-fit";
import { matcherSafetyCeilings } from "@/lib/matcher/safety-ceilings";
import { marketingCoveragePercentFromNeedCoverage } from "@/lib/marketing-coverage";
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
    dailyPillsPerServing: candidate.matchingFacts?.dailyPillsPerServing ?? 1,
    dietarySource: candidate.matchingFacts?.dietarySource ?? "any",
    form: candidate.matchingFacts?.form ?? "capsule",
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
    id.includes(`${productId}:x`) || id.startsWith(`${productId}:x`)
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
    targetBasis: need.itemType === "supplement" || need.itemType === "nutrient" ? "supplemental" as const : undefined,
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
      basis: "supplemental",
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

  const currents = canonicalizeCurrents(input.clientContext?.continuedIntake ?? []);

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
    excludeSubjectIds: [...(input.clientContext?.excludeSupplementIds ?? [])],
    excludeProductIds: [...(input.clientContext?.excludeProductIds ?? [])],
    profileKnown: input.clientContext?.profileKnown ?? { ageYears: input.clientContext?.ageYears != null, lifeStage: Boolean(input.clientContext?.lifestage), sex: Boolean(input.clientSex) },
    unknownIntakeSubjectIds: input.clientContext?.unknownIntakeSubjectIds ?? (input.clientContext?.currentSupplements === "none" || input.clientContext?.continuedIntake ? [] : targets.targets.map(target => target.subjectId)),
    estimatedIntakeSubjectIds: input.clientContext?.estimatedIntakeSubjectIds ?? [],
    leftovers: targets.leftovers,
    maxDailyPills: /^\d+(?:-\d+)?$/.test(input.clientContext?.pillLimit ?? "") ? Number(input.clientContext!.pillLimit!.split("-").at(-1)) : null,
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
      ageYears: input.clientContext?.ageYears ?? 38,
      lifeStage: matcherLifeStage(input.clientContext?.lifestage),
      ...(input.clientSex === "female" || input.clientSex === "male"
        ? { sex: input.clientSex }
        : {})
    },
    retainProductIds: [],
    retainSubjectIds: [],
    safetyCeilings: matcherSafetyCeilings(),
    selectorMode:
      input.stackPreference === "compact" ? "agentic" : "web_single",
    targets: targets.targets
  } as const;
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
      catalogueVersion: "web",
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
  const needDiagnostics = needDiagnosticsFromBasket(
    supplementNeeds,
    result.selected
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
    return {
      optionId: `webopt_${sha256Hex([...basket.variantIds].sort().join("|")).slice(0, 20)}`,
      productIds: [...basket.productIds], dailyServings: basket.productIds.map(id => servingMultiplierFromBasket(id, basket)),
      coveragePercent: marketingCoveragePercentFromNeedCoverage(needDiagnosticsFromBasket(supplementNeeds, basket)),
      priceMinor: basket.priceMinor, dailyPills: basket.dailyPills, doseFit: basket.doseFit ?? null, advice,
      recommendations: selectionsFor(basket)
    };
  });

  const recommendationResult: ProductRecommendationResult = {
    clientNeeds: input.needs,
    diagnostics: {
      matching: { operationalStatus: recommendations.length ? "ready" : "no_purchase", selectedOptionId: options[0]?.optionId ?? null, options, alternativeSearch: result.alternativeSearch },
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
  if (!context || !selected || !matching || matching.alternativeSearch?.status === "not_needed") return primary;
  const candidates = peers.flatMap(peer => {
    const other = searchContextByResult.get(peer);
    if (!other || other.request.currency !== context.request.currency) return [];
    return other.baskets.flatMap((basket, index) => {
      const option = peer.diagnostics.matching?.options[index];
      return option && hasFewerConcerns(basket, selected, context.request) ? [{ basket, option }] : [];
    });
  }).sort((a, b) => a.basket.doseFit && b.basket.doseFit ? compareDoseFit(a.basket.doseFit, b.basket.doseFit) ||
    a.basket.priceMinor - b.basket.priceMinor || a.option.optionId.localeCompare(b.option.optionId) : a.option.optionId.localeCompare(b.option.optionId));
  const alternative = candidates[0]?.option;
  const incomplete = peers.some(peer => peer.diagnostics.matching?.alternativeSearch?.status === "incomplete");
  return { ...primary, diagnostics: { ...primary.diagnostics, matching: { ...matching,
    options: [matching.options[0], ...(alternative ? [alternative] : [])].filter((option): option is typeof matching.options[number] => Boolean(option)),
    alternativeSearch: alternative ? { status: "found" as const, reason: "Fewer concerns without lower requested-target coverage across eligible retailers" }
      : incomplete ? { status: "incomplete" as const, reason: "Some retailer alternatives could not be fully evaluated" }
        : { status: "none_found" as const, reason: "No distinct option with fewer concerns met the same requirements across eligible retailers" }
  } } };
}
