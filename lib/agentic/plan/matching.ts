import { createHash } from "node:crypto";
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
import {
  contributionFor,
  variantPillBurden
} from "@/lib/matcher/candidates";
import { COVERED_THRESHOLD } from "@/lib/matcher/config";
import { amountFromScaled, convertAmount } from "@/lib/matcher/dose";
import {
  canonicalTargetSetHash,
  canonicalizeCurrents,
  canonicalizeTargets
} from "@/lib/matcher/canonicalizer";
import { canonicalNutrientKey, productKeysMatch } from "@/lib/product-key-matching";
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
  FactLedgerRow,
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

  const currentRows = [...state.currentSupplements].sort(
    (left, right) =>
      left.supplementId.localeCompare(right.supplementId) ||
      left.name.localeCompare(right.name) ||
      left.unit.localeCompare(right.unit) ||
      left.dailyAmount - right.dailyAmount
  );
  const currents = canonicalizeCurrents(
    currentRows.map((item, index) => ({
      dailyAmount: item.dailyAmount,
      name: item.name,
      sourceId: `${item.supplementId}:${item.unit}:${item.dailyAmount}:${index}`,
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

export function coverageFor(
  state: CanonicalPlanState,
  basket: ScoredBasket | null,
  items: readonly BasketItem[] = []
): CoverageRow[] {
  return state.targets.map((target) => {
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
    const limit = upperLimitAmount(target.name, target.unit, {
      ceilings: matcherSafetyCeilings(),
      profile: state.profile,
      subjectId: target.supplementId
    });
    const contributors = items.flatMap((item) => {
      const matching = (item.requestedNutrients ?? []).filter((nutrient) => {
        const sameNutrient =
          productKeysMatch(nutrient.name, target.name) ||
          productKeysMatch(nutrient.name, target.supplementId);
        const omegaLike =
          /omega|epa|dha|n-3/i.test(`${target.name} ${target.supplementId}`) &&
          /omega|epa|dha|n-3/i.test(nutrient.name);
        return sameNutrient || omegaLike;
      });

      if (matching.length > 0) {
        const amount = matching.reduce((sum, nutrient) => {
          const converted = convertAmount({
            amount: nutrient.amount,
            fromUnit: nutrient.unit,
            subjectId: target.supplementId,
            subjectName: target.name,
            toUnit: target.unit
          });
          return sum + (converted ?? 0);
        }, 0);
        return [
          {
            amount,
            productId: item.productId,
            productName: item.productName,
            unit: target.unit
          }
        ];
      }

      return [];
    });

    const deliveredFromFacts = contributors.reduce((sum, item) => sum + item.amount, 0);
    const matcherUnits = basket?.coverageBySubject.get(target.supplementId) ?? 0;
    const deliveredScaled = basket?.exposure.totals.get(target.supplementId);
    const deliveredTotal = deliveredScaled
      ? amountFromScaled(deliveredScaled, target.unit, target.name)
      : 0;
    const ignoreIncidentalFacts =
      items.length > 0 && matcherUnits < 1 && deliveredFromFacts > 0;
    const deliveredAmount = items.length > 0
      ? ignoreIncidentalFacts
        ? 0
        : deliveredFromFacts
      : Math.max(0, (deliveredTotal ?? 0) - currentAmount);
    const publishedContributors = ignoreIncidentalFacts ? [] : contributors;
    const totalExposureAmount = currentAmount + deliveredAmount;
    const coveragePercent =
      target.amount > 0
        ? Math.round((totalExposureAmount / target.amount) * 100)
        : 0;
    let status: CoverageRow["status"] = "uncovered";

    if (coveragePercent >= COVERED_THRESHOLD && coveragePercent <= 125) {
      status = "covered";
    } else if (coveragePercent > 125) {
      status = "over_target";
    } else if (coveragePercent > 0 && contributors.length > 0) {
      status = "partial";
    }

    if (limit != null && totalExposureAmount >= limit) {
      status = "upper_limit_risk";
    }

    return {
      contributors: publishedContributors,
      coveragePercent,
      currentAmount,
      deliveredAmount,
      name: target.name,
      percentOfUpperLimit:
        limit != null && limit > 0
          ? Math.round((totalExposureAmount / limit) * 100)
          : null,
      remainingGap: Math.max(0, target.amount - totalExposureAmount),
      requestedAmount: target.amount,
      status,
      supplementId: target.supplementId,
      totalExposureAmount,
      unit: target.unit,
      upperLimitAmount: limit
    };
  });
}

export function factLedgerFor(input: Readonly<{
  catalogueId: string;
  selected: StackOption | null;
  state: CanonicalPlanState;
}>): FactLedgerRow[] {
  if (!input.selected) {
    return [];
  }

  const rows: FactLedgerRow[] = [];
  const seen = new Set<string>();

  for (const target of input.state.targets) {
    const coverage = input.selected.coverage.find(
      (row) => row.supplementId === target.supplementId
    );

    for (const contributor of coverage?.contributors ?? []) {
      const item = input.selected.basket.find(
        (basketItem) => basketItem.productId === contributor.productId
      );
      const nutrient = item?.requestedNutrients?.find((entry) =>
        productKeysMatch(entry.name, target.name)
      );
      const ruleId = canonicalNutrientKey(nutrient?.name ?? target.name);
      const productFactId = [
        contributor.productId ?? item?.productId ?? "",
        ruleId,
        contributor.unit
      ].join(":");
      const key = `${target.supplementId}:${productFactId}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      rows.push({
        amount: contributor.amount,
        canonicalSupplementId: target.supplementId,
        catalogueId: input.catalogueId,
        normalizationRuleId: ruleId,
        productFactId,
        productId: contributor.productId ?? item?.productId ?? "",
        unit: contributor.unit
      });
    }
  }

  return rows.sort(
    (left, right) =>
      left.canonicalSupplementId.localeCompare(right.canonicalSupplementId) ||
      left.productFactId.localeCompare(right.productFactId)
  );
}

export function factLedgerHash(rows: readonly FactLedgerRow[]): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        rows.map((row) => ({
          amount: row.amount,
          canonicalSupplementId: row.canonicalSupplementId,
          catalogueId: row.catalogueId,
          normalizationRuleId: row.normalizationRuleId,
          productFactId: row.productFactId,
          productId: row.productId,
          unit: row.unit
        }))
      )
    )
    .digest("hex");
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
  const requestedKeys = new Set<string>();

  for (const target of state.targets) {
    for (const fact of contributionFor(
      matcherProduct,
      target.name,
      target.supplementId
    )) {
      if (fact.amount == null || fact.amount <= 0 || !fact.name?.trim() || !fact.unit) {
        continue;
      }

      const key = fact.name.trim().toLowerCase();

      if (requestedKeys.has(key)) {
        continue;
      }

      requestedKeys.add(key);
      requested.push({
        amount: fact.amount * multiplier,
        name: fact.name,
        unit: fact.unit
      });
    }
  }

  for (const fact of matcherProduct.labelledContributions) {
    if (fact.amount == null || fact.amount <= 0 || !fact.name?.trim() || !fact.unit) {
      continue;
    }

    const key = fact.name.trim().toLowerCase();

    if (requestedKeys.has(key)) {
      continue;
    }

    incidental.push({
      amount: fact.amount * multiplier,
      name: fact.name,
      unit: fact.unit
    });
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
        requestedNutrients: nutrients.requestedNutrients,
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
    coverage: coverageFor(state, basket, items),
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
    for (const row of coverageFor(state, null)) {
      if (row.remainingGap <= 0) {
        continue;
      }

      push({
        amount: row.requestedAmount,
        name: row.name,
        reason: row.currentAmount > 0 ? "dose_gap" : "uncovered",
        severity: row.currentAmount > 0 ? "medium" : "high",
        supplementId: row.supplementId,
        unit: row.unit
      });
    }

    return leftovers;
  }

  for (const row of selected.coverage) {
    if (row.status === "uncovered") {
      if (row.deliveredAmount > 0) {
        push({
          amount: row.requestedAmount,
          name: row.name,
          reason: "dose_gap",
          severity: "medium",
          supplementId: row.supplementId,
          unit: row.unit
        });
      } else {
        push({
          amount: row.requestedAmount,
          name: row.name,
          reason: "uncovered",
          severity: "high",
          supplementId: row.supplementId,
          unit: row.unit
        });
      }
    } else if (row.status === "partial") {
      push({
        amount: row.requestedAmount,
        name: row.name,
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
  catalogueMs?: number;
  leftovers: readonly PlanLeftover[];
  matchMs?: number;
  rejected?: readonly RejectedCandidate[];
  searchDeadlineMs?: number;
  searchMs?: number;
  selected: StackOption | null;
  lossCertificates?: MatcherTelemetry["lossCertificates"];
  targetFrontiers?: MatcherTelemetry["targetFrontiers"];
  serializeMs?: number;
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
    ...(input.catalogueMs != null ? { catalogueMs: input.catalogueMs } : {}),
    ...(input.matchMs != null ? { matchMs: input.matchMs } : {}),
    ...(input.searchDeadlineMs != null
      ? { searchDeadlineMs: input.searchDeadlineMs }
      : {}),
    ...(input.searchMs != null ? { searchMs: input.searchMs } : {}),
    ...(input.serializeMs != null ? { serializeMs: input.serializeMs } : {}),
    ...(() => {
      const snapshotId =
        input.selected?.snapshotId ??
        (input.snapshot && input.snapshot.products.length > 0
          ? catalogueSnapshotId(input.snapshot)
          : undefined);

      return input.snapshot
        ? {
            availabilityAsOf: input.snapshot.availabilityAsOf,
            ...(snapshotId ? { snapshotId } : {})
          }
        : snapshotId
          ? { snapshotId }
          : {};
    })(),
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
    selectedOptionId: input.selected?.optionId ?? null,
    ...(input.lossCertificates && input.lossCertificates.length > 0
      ? { lossCertificates: input.lossCertificates }
      : {}),
    ...(input.targetFrontiers && input.targetFrontiers.length > 0
      ? { targetFrontiers: input.targetFrontiers }
      : {}),
    ...(!("error" in request) ? { targetSetHash: canonicalTargetSetHash(request) } : {}),
    ...(() => {
      const catalogueId =
        input.selected?.snapshotId ??
        (input.snapshot ? catalogueSnapshotId(input.snapshot) : "");
      const ledger = factLedgerFor({
        catalogueId,
        selected: input.selected,
        state: input.state
      });

      if (ledger.length < 1) {
        return {};
      }

      return {
        factLedger: ledger,
        factLedgerHash: factLedgerHash(ledger)
      };
    })()
  };
}

export function matchPlan(input: Readonly<{
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): {
  alternatives: StackOption[];
  leftovers: PlanLeftover[];
  lossCertificates?: NonNullable<MatcherTelemetry["lossCertificates"]>;
  rejected: RejectedCandidate[];
  selected: StackOption | null;
  targetFrontiers?: NonNullable<MatcherTelemetry["targetFrontiers"]>;
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
    ...(result.lossCertificates ? { lossCertificates: result.lossCertificates } : {}),
    rejected: [...result.rejected],
    selected,
    ...(result.targetFrontiers ? { targetFrontiers: result.targetFrontiers } : {}),
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
