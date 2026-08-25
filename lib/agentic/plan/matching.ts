import type { CatalogueProduct, CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { catalogueSnapshotId, freezeCatalogueSnapshot } from "@/lib/agentic/catalogue/freeze";
import { classifySnapshotTargets } from "@/lib/agentic/plan/classify";
import { toMatcherProduct } from "@/lib/agentic/plan/to-matcher-product";
import {
  DEV_REJECTED_DUMP_LIMIT,
  impliedOmegaPreference,
  MATCHER_VERSION,
  match,
  optionIdFor,
  publicCoveragePercent,
  summarizeRejections
} from "@/lib/matcher";
import { contributionFor, variantPillBurden } from "@/lib/matcher/candidates";
import { amountFromScaled, convertAmount } from "@/lib/matcher/dose";
import { canonicalizeCurrents, canonicalizeTargets } from "@/lib/matcher/canonicalizer";
import type {
  CanonicalRequest,
  MatcherUnit,
  ScoredBasket
} from "@/lib/matcher/types";
import { upperLimitAmount } from "@/lib/agentic/plan/limits";
import { matcherSafetyCeilings } from "@/lib/matcher/safety-ceilings";
import type {
  BasketItem,
  CanonicalPlanState,
  CoverageRow,
  MatcherTelemetry,
  PlanLeftover,
  RejectedCandidate,
  StackOption
} from "@/lib/agentic/plan/types";

export { toMatcherProduct };

export function toCanonicalRequest(
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
      state.requirements.omega3SourcePreference,
      state.targets.map((item) => item.requestedName ?? item.name)
    ),
    optimization: state.optimization,
    profile: state.profile,
    retainProductIds: state.requirements.retainProductIds ?? [],
    retainSubjectIds: state.requirements.retainSupplementIds ?? [],
    safetyCeilings: matcherSafetyCeilings(),
    selectorMode: "agentic",
    targets: targets.targets
  };
}

function coverageFor(
  state: CanonicalPlanState,
  basket: ScoredBasket | null
): CoverageRow[] {
  return state.targets.map((target) => {
    const coverageUnits = basket?.coverageBySubject.get(target.supplementId) ?? 0;
    const coveragePercent = Math.round(coverageUnits / 100);
    const current = state.currentSupplements.filter(
      (item) => item.supplementId === target.supplementId
    );
    const currentAmount = current.reduce((sum, item) => {
      const converted = convertAmount({
        amount: item.dailyAmount,
        fromUnit: item.unit,
        subjectId: target.supplementId,
        subjectName: target.name,
        toUnit: target.unit
      });
      return sum + (converted ?? 0);
    }, 0);
    const deliveredScaled = basket?.exposure.totals.get(target.supplementId);
    const deliveredTotal = deliveredScaled
      ? amountFromScaled(deliveredScaled, target.unit, target.name)
      : 0;
    const deliveredAmount = Math.max(0, (deliveredTotal ?? 0) - currentAmount);
    const totalExposureAmount = currentAmount + deliveredAmount;
    const limit = upperLimitAmount(target.name, target.unit, {
      ceilings: matcherSafetyCeilings(),
      profile: state.profile,
      subjectId: target.supplementId
    });
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
      remainingGap: Math.max(0, target.amount - currentAmount),
      requestedAmount: target.amount,
      status,
      supplementId: target.supplementId,
      totalExposureAmount,
      unit: target.unit,
      upperLimitAmount: limit
    };
  });
}

const PUBLIC_NUTRIENT_NAME_LIMIT = 12;

function uniqueBoundedNames(
  names: readonly string[],
  limit = PUBLIC_NUTRIENT_NAME_LIMIT
) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const name of names) {
    const trimmed = name.trim();

    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(trimmed);

    if (out.length >= limit) {
      break;
    }
  }

  return out;
}

const CATALOGUE_UNITS = new Set([
  "CFU",
  "IU",
  "g",
  "mcg",
  "mg",
  "ml",
  "serving"
]);

function uniqueBoundedNutrients(
  facts: readonly { amount: number; name: string; unit: string }[],
  limit = 12
) {
  const seen = new Set<string>();
  const out: Array<{ amount: number; name: string; unit: BasketItem["incidentalNutrients"][number]["unit"] }> = [];

  for (const fact of facts) {
    const name = fact.name.trim();
    const unit = fact.unit.trim();

    if (!name || fact.amount <= 0 || !CATALOGUE_UNITS.has(unit)) {
      continue;
    }

    const key = name.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push({
      amount: fact.amount,
      name,
      unit: unit as BasketItem["incidentalNutrients"][number]["unit"]
    });

    if (out.length >= limit) {
      break;
    }
  }

  return out;
}

function nutrientSplit(
  product: CatalogueProduct,
  state: CanonicalPlanState,
  servingsPerDay: number
) {
  const matcherProduct = toMatcherProduct(product);
  const requested: { amount: number; name: string; unit: string }[] = [];
  const incidental: { amount: number; name: string; unit: string }[] = [];
  const multiplier = Math.max(1, servingsPerDay);

  for (const fact of matcherProduct.labelledContributions) {
    if (fact.amount == null || fact.amount <= 0 || !fact.name?.trim() || !fact.unit) {
      continue;
    }

    const matchesTarget = state.targets.some((target) =>
      contributionFor(matcherProduct, target.name, target.supplementId).includes(
        fact
      )
    );
    const row = {
      amount: fact.amount * multiplier,
      name: fact.name,
      unit: fact.unit
    };

    if (matchesTarget) {
      requested.push(row);
    } else {
      incidental.push(row);
    }
  }

  const incidentalNutrients = uniqueBoundedNutrients(incidental);
  const requestedNutrients = uniqueBoundedNutrients(requested);

  return {
    incidentalNutrientNames: uniqueBoundedNames(incidentalNutrients.map((item) => item.name)),
    incidentalNutrients,
    requestedNutrientNames: uniqueBoundedNames(requestedNutrients.map((item) => item.name)),
    requestedNutrients
  };
}

function dailyUnitsForProduct(
  productId: string,
  variantIds: readonly string[]
) {
  const prefix = `${productId}:x`;
  const variantId = variantIds.find((id) => id.startsWith(prefix));
  const parsed = Number(variantId?.slice(prefix.length));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
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
    .map((product) => {
      const dailyUnits = dailyUnitsForProduct(product.productId, basket.variantIds);
      const quantity = Math.max(1, dailyUnits);
      const nutrients = nutrientSplit(product, state, quantity);

      return {
        availabilityAsOf: snapshot.availabilityAsOf,
        contributionSupplementIds: product.contributionSupplementIds,
        currency: product.candidate.currency || state.currency,
        dailyPills: variantPillBurden(
          {
            dailyPillsPerServing: product.dailyPills,
            form: product.form
          },
          quantity
        ),
        deliveryWindow: product.stockStatus === "backorder" ? "backorder" : "3-5 days",
        fixture: product.source === "fixture",
        form: product.form,
        imageUrl: product.candidate.imageUrl?.trim() || null,
        incidentalNutrientNames: nutrients.incidentalNutrientNames,
        incidentalNutrients: nutrients.incidentalNutrients,
        incompleteCommercialFacts: product.incompleteCommercialFacts,
        lineTotalMinor: product.unitPriceMinor * quantity,
        pillsPerServing: product.dailyPills,
        productId: product.productId,
        productName: product.candidate.title,
        quantity,
        requestedNutrientNames: nutrients.requestedNutrientNames,
        retailerSku: product.retailerSku,
        sellerId: product.sellerId,
        sellerName: product.sellerName,
        servingsPerDay: quantity,
        source: product.source,
        stockStatus: product.stockStatus === "backorder" ? "backorder" : "in_stock",
        unitPriceMinor: product.unitPriceMinor
      };
    });
}

function toStackOption(
  state: CanonicalPlanState,
  snapshot: CatalogueSnapshot,
  basket: ScoredBasket
): StackOption {
  const items = basketFromIds(state, snapshot, basket);
  return {
    basket: items,
    coverage: coverageFor(state, basket),
    coveragePercent: publicCoveragePercent(basket),
    dailyPills: basket.dailyPills,
    matcherVersion: MATCHER_VERSION,
    optionId: optionIdFor(basket.productIds),
    reason: basket.reason,
    snapshotId: catalogueSnapshotId(snapshot),
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

  if (!selected) {
    for (const target of state.targets) {
      push({
        amount: target.amount,
        name: target.name,
        reason: "uncovered",
        severity: "high",
        supplementId: target.supplementId,
        unit: target.unit
      });
    }

    return leftovers;
  }

  for (const row of selected.coverage) {
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
  ackMs?: number;
  leftovers: readonly PlanLeftover[];
  matchMs?: number;
  rejected?: readonly RejectedCandidate[];
  searchDeadlineMs?: number;
  selected: StackOption | null;
  snapshot?: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): MatcherTelemetry {
  const rejected = input.rejected ?? [];
  const summary = summarizeRejections(rejected);
  const request = toCanonicalRequest(input.state);
  const classifications = input.snapshot
    ? classifySnapshotTargets({
        request,
        selected: input.selected,
        snapshot: input.snapshot,
        state: input.state
      })
    : [];

  return {
    ...(input.ackMs != null ? { ackMs: input.ackMs } : {}),
    ...(input.matchMs != null ? { matchMs: input.matchMs } : {}),
    ...(input.searchDeadlineMs != null
      ? { searchDeadlineMs: input.searchDeadlineMs }
      : {}),
    ...(input.snapshot
      ? {
          availabilityAsOf: input.snapshot.availabilityAsOf,
          snapshotId: catalogueSnapshotId(input.snapshot)
        }
      : {}),
    constraints: {
      ...input.state.requirements,
      conditionCodes: input.state.conditionCodes,
      medicationCodes: input.state.medicationCodes
    },
    coveragePercent: input.selected?.coveragePercent ?? null,
    leftovers: input.leftovers,
    matcherVersion: MATCHER_VERSION,
    productIds: input.selected?.basket.map((item) => item.productId) ?? [],
    productSkus: input.selected?.basket.map((item) => item.retailerSku) ?? [],
    ...(summary.total > 0 ? { rejected: summary } : {}),
    ...(rejected.length > 0
      ? { rejectedAll: rejected.slice(0, DEV_REJECTED_DUMP_LIMIT) }
      : {}),
    ...(classifications.length > 0 ? { targetClassifications: classifications } : {}),
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
  rejected: RejectedCandidate[];
  selected: StackOption | null;
  unmetRequirements: string[];
} {
  const request = toCanonicalRequest(input.state);

  if ("error" in request) {
    return {
      alternatives: [],
      leftovers: [...input.state.leftovers],
      rejected: [],
      selected: null,
      unmetRequirements: []
    };
  }

  const snapshot = freezeCatalogueSnapshot(input.snapshot);
  const result = match(request, {
    availabilityAsOf: snapshot.availabilityAsOf,
    catalogueVersion: snapshot.catalogueVersion,
    products: snapshot.products.map(toMatcherProduct)
  });
  const selected = result.selected
    ? toStackOption(input.state, snapshot, result.selected)
    : null;
  const alternatives = result.alternatives.map((item) =>
    toStackOption(input.state, snapshot, item)
  );
  const leftovers = leftoversFor(input.state, selected, alternatives[0] ?? null);

  return {
    alternatives,
    leftovers,
    rejected: [...result.rejected],
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
    if (input.state.requirements.maxPriceMinor != null) {
      unmet.push("maxPriceMinor");
    }

    if (input.state.requirements.maxDailyPills != null) {
      unmet.push("maxDailyPills");
    }

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
