import type { CatalogueProduct, CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { isPrenatalOrFertilitySku } from "@/lib/agentic/catalogue/product-fit";
import { impliedOmegaPreference, match, optionIdFor, publicCoveragePercent } from "@/lib/matcher";
import { amountFromScaled } from "@/lib/matcher/dose";
import { canonicalizeCurrents, canonicalizeTargets } from "@/lib/matcher/canonicalizer";
import type {
  CanonicalRequest,
  MatcherProduct,
  MatcherUnit,
  ScoredBasket
} from "@/lib/matcher/types";
import { upperLimitAmount } from "@/lib/agentic/plan/limits";
import type {
  BasketItem,
  CanonicalPlanState,
  CoverageRow,
  MatcherTelemetry,
  PlanLeftover,
  StackOption
} from "@/lib/agentic/plan/types";

function toMatcherProduct(product: CatalogueProduct): MatcherProduct {
  return {
    availableCountryCodes: product.candidate.availableCountryCodes ?? null,
    contributionSubjectIds: product.contributionSupplementIds,
    currency: product.candidate.currency,
    dailyPillsPerServing: product.dailyPills,
    dietarySource: product.dietarySource,
    form: product.form,
    imageUrl: product.candidate.imageUrl?.trim() || null,
    incompleteCommercialFacts: product.incompleteCommercialFacts,
    labelledContributions: product.candidate.facts.map((fact) => ({
      amount: fact.amount ?? fact.comparableAmount ?? 0,
      name: fact.name,
      subjectId: null,
      unit: fact.unit
    })),
    omegaSource: product.omegaSource,
    orderable: product.orderable,
    prenatalOrFertility: isPrenatalOrFertilitySku(product.candidate),
    productAudience: product.candidate.productAudience ?? "both",
    productId: product.productId,
    retailerSku: product.retailerSku,
    sellerId: product.sellerId,
    sellerName: product.sellerName,
    source: product.source,
    status: product.candidate.status ?? "approved",
    stockStatus: product.stockStatus === "backorder" ? "backorder" : product.stockStatus === "unavailable" ? "unavailable" : "in_stock",
    title: product.candidate.title,
    unknownSafetyAmount: false,
    unitPriceMinor: product.unitPriceMinor
  };
}

function toCanonicalRequest(
  state: CanonicalPlanState
): CanonicalRequest | { error: string; reason: "unsupported_unit" } {
  const targets = canonicalizeTargets({
    leftovers: state.leftovers.map((item) => ({
      amount: item.amount,
      name: item.name,
      note: item.note,
      reason: item.reason,
      severity: item.severity,
      subjectId: item.supplementId,
      unit: item.unit as MatcherUnit | undefined
    })),
    targets: state.targets.map((item) => ({
      amount: item.amount,
      name: item.name,
      subjectId: item.supplementId,
      unit: item.unit
    }))
  });

  if ("error" in targets) {
    return targets;
  }

  const currents = canonicalizeCurrents(
    state.currentSupplements.map((item, index) => ({
      dailyAmount: item.dailyAmount,
      name: item.name,
      sourceId: `${item.supplementId}:${index}`,
      subjectId: item.supplementId,
      unit: item.unit
    }))
  );

  if ("error" in currents) {
    return currents;
  }

  const dietary = state.requirements.dietaryPreference ?? "any";

  return {
    acceptedGapSubjectIds: state.acceptedGaps.map((item) => item.supplementId),
    allowedForms: state.requirements.allowedForms ?? null,
    conditionCodes: state.conditionCodes,
    currency: state.currency,
    currentSupplements: currents,
    destinationCountry: state.destinationCountry,
    dietaryPreference: dietary,
    excludeSubjectIds: state.requirements.excludeSupplementIds ?? [],
    leftovers: targets.leftovers,
    maxDailyPills: state.requirements.maxDailyPills ?? null,
    maxPriceMinor: state.requirements.maxPriceMinor ?? null,
    maxProductCount: state.requirements.maxProductCount ?? 8,
    medicationCodes: state.medicationCodes,
    omega3SourcePreference: impliedOmegaPreference(
      dietary,
      state.requirements.omega3SourcePreference
    ),
    optimization: state.optimization,
    profile: state.profile,
    retainProductIds: state.requirements.retainProductIds ?? [],
    retainSubjectIds: state.requirements.retainSupplementIds ?? [],
    selectorMode: "agentic",
    targets: targets.targets
  };
}

function coverageFor(
  state: CanonicalPlanState,
  basket: ScoredBasket | null,
  products: readonly CatalogueProduct[]
): CoverageRow[] {
  return state.targets.map((target) => {
    const coverageUnits = basket?.coverageBySubject.get(target.supplementId) ?? 0;
    const coveragePercent = Math.round(coverageUnits / 100);
    const current = state.currentSupplements.filter(
      (item) => item.supplementId === target.supplementId
    );
    const currentAmount = current.reduce((sum, item) => sum + item.dailyAmount, 0);
    const deliveredScaled = basket?.exposure.totals.get(target.supplementId);
    const deliveredTotal = deliveredScaled
      ? amountFromScaled(deliveredScaled, target.unit, target.name)
      : 0;
    const deliveredAmount = Math.max(0, (deliveredTotal ?? 0) - currentAmount);
    const totalExposureAmount = currentAmount + deliveredAmount;
    const limit = upperLimitAmount(target.name, target.unit);
    let status: CoverageRow["status"] = "uncovered";

    if (coveragePercent >= 90 && coveragePercent <= 125) {
      status = "covered";
    } else if (coveragePercent > 125) {
      status = "over_target";
    } else if (coveragePercent > 0) {
      status = "partial";
    }

    if (limit != null && totalExposureAmount >= limit) {
      status = "upper_limit_risk";
    }

    return {
      coveragePercent,
      currentAmount,
      deliveredAmount,
      name: target.name,
      percentOfUpperLimit:
        limit != null && limit > 0
          ? Math.round((totalExposureAmount / limit) * 100)
          : null,
      requestedAmount: target.amount,
      status,
      supplementId: target.supplementId,
      totalExposureAmount,
      unit: target.unit,
      upperLimitAmount: limit
    };
  });
}

function basketFromIds(
  state: CanonicalPlanState,
  snapshot: CatalogueSnapshot,
  basket: ScoredBasket
): BasketItem[] {
  return basket.productIds
    .map((productId) =>
      snapshot.products.find(
        (item) =>
          item.productId === productId &&
          (item.sellerId === basket.sellerId || !basket.sellerId)
      )
    )
    .filter((item): item is CatalogueProduct => Boolean(item))
    .map((product) => ({
      availabilityAsOf: snapshot.availabilityAsOf,
      contributionSupplementIds: product.contributionSupplementIds,
      currency: product.candidate.currency || state.currency,
      dailyPills: product.dailyPills,
      deliveryWindow: product.stockStatus === "backorder" ? "backorder" : "3-5 days",
      fixture: product.source === "fixture",
      form: product.form,
      imageUrl: product.candidate.imageUrl?.trim() || null,
      incompleteCommercialFacts: product.incompleteCommercialFacts,
      lineTotalMinor: product.unitPriceMinor,
      productId: product.productId,
      productName: product.candidate.title,
      quantity: 1,
      retailerSku: product.retailerSku,
      sellerId: product.sellerId,
      sellerName: product.sellerName,
      source: product.source,
      stockStatus: product.stockStatus === "backorder" ? "backorder" : "in_stock",
      unitPriceMinor: product.unitPriceMinor
    }));
}

function toStackOption(
  state: CanonicalPlanState,
  snapshot: CatalogueSnapshot,
  basket: ScoredBasket
): StackOption {
  const items = basketFromIds(state, snapshot, basket);
  return {
    basket: items,
    coverage: coverageFor(state, basket, snapshot.products),
    coveragePercent: publicCoveragePercent(basket),
    dailyPills: basket.dailyPills,
    optionId: optionIdFor(basket.productIds),
    reason: basket.reason,
    totalPriceMinor: basket.priceMinor
  };
}

export function leftoversFor(
  state: CanonicalPlanState,
  selected: StackOption | null,
  cheaper: StackOption | null
): PlanLeftover[] {
  const leftovers: PlanLeftover[] = [...state.leftovers];
  const seen = new Set(leftovers.map((item) => `${item.reason}:${item.name}`));

  function push(item: PlanLeftover) {
    const key = `${item.reason}:${item.name}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    leftovers.push(item);
  }

  for (const row of selected?.coverage ?? []) {
    if (row.status === "uncovered") {
      push({
        amount: row.requestedAmount,
        name: row.name,
        reason: "uncovered",
        severity: "high",
        supplementId: row.supplementId,
        unit: row.unit
      });
    } else if (row.status === "partial") {
      push({
        amount: row.requestedAmount,
        name: row.name,
        note: `covered ${row.coveragePercent}%`,
        reason: "dose_gap",
        severity: "medium",
        supplementId: row.supplementId,
        unit: row.unit
      });
    }
  }

  if (cheaper && selected && cheaper.totalPriceMinor < selected.totalPriceMinor) {
    for (const row of cheaper.coverage) {
      const selectedRow = selected.coverage.find(
        (item) => item.supplementId === row.supplementId
      );

      if (selectedRow && row.coveragePercent + 10 < selectedRow.coveragePercent) {
        push({
          name: row.name,
          note: "cheaper SKU covers less",
          reason: "weaker_sku",
          severity: "low",
          supplementId: row.supplementId,
          unit: row.unit
        });
      }
    }
  }

  return leftovers;
}

export function matcherTelemetryFor(input: Readonly<{
  leftovers: readonly PlanLeftover[];
  selected: StackOption | null;
  state: CanonicalPlanState;
}>): MatcherTelemetry {
  return {
    constraints: {
      ...input.state.requirements,
      conditionCodes: input.state.conditionCodes,
      medicationCodes: input.state.medicationCodes
    },
    coveragePercent: input.selected?.coveragePercent ?? null,
    leftovers: input.leftovers,
    productIds: input.selected?.basket.map((item) => item.productId) ?? [],
    productSkus: input.selected?.basket.map((item) => item.retailerSku) ?? [],
    requestedDoses: [
      ...input.state.targets.map((item) => ({
        amount: item.amount,
        name: item.name,
        unit: item.unit
      })),
      ...input.state.leftovers
        .filter((item) => item.reason === "not_in_catalogue" && item.amount != null && item.unit)
        .map((item) => ({
          amount: item.amount as number,
          name: item.name,
          unit: item.unit as CanonicalPlanState["targets"][number]["unit"]
        }))
    ],
    requestedNames: [
      ...input.state.targets.map((item) => item.name),
      ...input.state.leftovers
        .filter((item) => item.reason === "not_in_catalogue")
        .map((item) => item.name)
    ],
    selectedOptionId: input.selected?.optionId ?? null
  };
}

export function matchPlan(input: Readonly<{
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): {
  alternatives: StackOption[];
  leftovers: PlanLeftover[];
  selected: StackOption | null;
  unmetRequirements: string[];
} {
  const request = toCanonicalRequest(input.state);

  if ("error" in request) {
    return {
      alternatives: [],
      leftovers: [...input.state.leftovers],
      selected: null,
      unmetRequirements: []
    };
  }

  const result = match(request, {
    availabilityAsOf: input.snapshot.availabilityAsOf,
    catalogueVersion: input.snapshot.catalogueVersion,
    products: input.snapshot.products.map(toMatcherProduct)
  });
  const selected = result.selected
    ? toStackOption(input.state, input.snapshot, result.selected)
    : null;
  const alternatives = result.alternatives.map((item) =>
    toStackOption(input.state, input.snapshot, item)
  );
  const leftovers = leftoversFor(input.state, selected, alternatives[0] ?? null);

  return {
    alternatives,
    leftovers,
    selected,
    unmetRequirements: unmetRequirementsFor({
      option: selected,
      state: input.state
    })
  };
}

export function unmetRequirementsFor(input: Readonly<{
  option: StackOption | null;
  state: CanonicalPlanState;
}>): string[] {
  const unmet: string[] = [];
  const selected = input.option;

  if (!selected) {
    return unmet;
  }

  const retainProducts = input.state.requirements.retainProductIds ?? [];
  const selectedIds = new Set(selected.basket.map((item) => item.productId));

  for (const productId of retainProducts) {
    if (!selectedIds.has(productId)) {
      unmet.push(`retainProductIds:${productId}`);
    }
  }

  for (const supplementId of input.state.requirements.retainSupplementIds ?? []) {
    const row = selected.coverage.find((item) => item.supplementId === supplementId);
    const accepted = input.state.acceptedGaps.some(
      (gap) => gap.supplementId === supplementId
    );

    if (
      !accepted &&
      (!row || (row.status !== "covered" && row.status !== "over_target"))
    ) {
      unmet.push(`retainSupplementIds:${supplementId}`);
    }
  }

  if (
    input.state.requirements.maxPriceMinor != null &&
    selected.totalPriceMinor > input.state.requirements.maxPriceMinor
  ) {
    unmet.push("maxPriceMinor");
  }

  if (
    input.state.requirements.maxDailyPills != null &&
    selected.dailyPills > input.state.requirements.maxDailyPills
  ) {
    unmet.push("maxDailyPills");
  }

  return unmet;
}
