import { createHash } from "node:crypto";
import { parseDose } from "@/lib/dose-conversion";
import { recommendProductStackFullBeam } from "@/lib/product-recommendations";
import type { ProductRecommendationNeed } from "@/lib/product-recommendation-types";
import type { CatalogueProduct, CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import { upperLimitAmount } from "@/lib/agentic/plan/limits";
import {
  doseComparable,
  fromComparable,
  roundDose
} from "@/lib/agentic/plan/units";
import type {
  BasketItem,
  CanonicalPlanState,
  CoverageRow,
  MatcherTelemetry,
  PlanLeftover,
  StackOption
} from "@/lib/agentic/plan/types";

function productEligible(product: CatalogueProduct, state: CanonicalPlanState) {
  if (!product.orderable || product.incompleteCommercialFacts) {
    return false;
  }

  if (product.candidate.availableCountryCodes?.includes("TH") === false) {
    return false;
  }

  const excluded = state.requirements.excludeSupplementIds ?? [];

  if (product.contributionSupplementIds.some((id) => excluded.includes(id))) {
    return false;
  }

  if (
    state.requirements.dietaryPreference === "plant_based" &&
    (product.dietarySource === "fish" || product.omegaSource === "fish")
  ) {
    return false;
  }

  if (
    state.requirements.omega3SourcePreference === "algae_only" &&
    product.omegaSource === "fish"
  ) {
    return false;
  }

  const allowedForms = state.requirements.allowedForms;

  if (allowedForms && allowedForms.length > 0 && !allowedForms.includes(product.form)) {
    return false;
  }

  if (state.profile.lifeStage === "child" && product.audience === "adult") {
    return false;
  }

  return true;
}

function toNeed(state: CanonicalPlanState): ProductRecommendationNeed[] {
  return state.targets.map((target, index) => ({
    category: "Supplement",
    displayName: target.name,
    id: `supplement:${target.supplementId}`,
    itemType: "supplement",
    normalizedName: target.name.toLowerCase().replace(/\s+/g, "_"),
    sourceId: target.supplementId,
    targetComparableAmount: doseComparable(target.amount, target.unit, target.name),
    targetDose: parseDose(`${target.amount} ${target.unit}`, target.name),
    targetText: `${target.amount} ${target.unit}`,
    weight: Math.max(1, 8 - index)
  }));
}

function optionIdFor(productIds: readonly string[]) {
  return `opt_${createHash("sha256").update(productIds.slice().sort().join("|")).digest("hex").slice(0, 16)}`;
}

function coverageFor(
  state: CanonicalPlanState,
  products: readonly CatalogueProduct[]
): CoverageRow[] {
  return state.targets.map((target) => {
    const requestedComparable = doseComparable(
      target.amount,
      target.unit,
      target.name
    );
    const currentComparable = state.currentSupplements
      .filter((item) => item.supplementId === target.supplementId)
      .reduce(
        (sum, item) =>
          sum + doseComparable(item.dailyAmount, item.unit, item.name),
        0
      );
    const deliveredComparable = products
      .filter((item) => item.contributionSupplementIds.includes(target.supplementId))
      .reduce((sum, item) => {
        const wanted = target.name.trim().toLowerCase();
        const fact =
          item.candidate.facts.find((row) => {
            const name = (row.name ?? row.normalizedName ?? "")
              .replace(/_/g, " ")
              .trim()
              .toLowerCase();
            return name === wanted || name.includes(wanted) || wanted.includes(name);
          }) ?? item.candidate.facts[0];
        return sum + (fact?.comparableAmount ?? 0);
      }, 0);
    const coveragePercent = requestedComparable > 0
      ? Math.min(200, Math.round((deliveredComparable / requestedComparable) * 100))
      : 0;
    let status: CoverageRow["status"] = "uncovered";

    if (coveragePercent >= 90 && coveragePercent <= 125) {
      status = "covered";
    } else if (coveragePercent > 125) {
      status = "over_target";
    } else if (coveragePercent > 0) {
      status = "partial";
    }

    const requestedAmount = roundDose(target.amount);
    const currentAmount = roundDose(
      fromComparable(currentComparable, target.unit, target.name)
    );
    const deliveredAmount = roundDose(
      fromComparable(deliveredComparable, target.unit, target.name)
    );
    const totalExposureAmount = roundDose(currentAmount + deliveredAmount);
    const limit = upperLimitAmount(target.name, target.unit);
    const percentOfUpperLimit =
      limit != null && limit > 0
        ? Math.round((totalExposureAmount / limit) * 100)
        : null;

    if (limit != null && totalExposureAmount >= limit) {
      status = "upper_limit_risk";
    }

    return {
      coveragePercent,
      currentAmount,
      deliveredAmount,
      name: target.name,
      percentOfUpperLimit,
      requestedAmount,
      status,
      supplementId: target.supplementId,
      totalExposureAmount,
      unit: target.unit,
      upperLimitAmount: limit
    };
  });
}

function basketFromProducts(
  products: readonly CatalogueProduct[],
  availabilityAsOf: string
): BasketItem[] {
  return products.map((product) => ({
    availabilityAsOf,
    contributionSupplementIds: product.contributionSupplementIds,
    currency: "THB",
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

function stackFromProducts(
  state: CanonicalPlanState,
  products: readonly CatalogueProduct[],
  availabilityAsOf: string,
  reason: string
): StackOption {
  const basket = basketFromProducts(products, availabilityAsOf);
  const coverage = coverageFor(state, products);
  const covered = coverage.filter((row) => row.status === "covered" || row.status === "over_target").length;
  const coveragePercent = coverage.length > 0
    ? Math.round((covered / coverage.length) * 100)
    : 0;

  return {
    basket,
    coverage,
    coveragePercent,
    dailyPills: basket.reduce((sum, item) => sum + item.dailyPills, 0),
    optionId: optionIdFor(basket.map((item) => item.productId)),
    reason,
    totalPriceMinor: basket.reduce((sum, item) => sum + item.lineTotalMinor, 0)
  };
}

function maxProductCount(state: CanonicalPlanState) {
  return state.requirements.maxProductCount ?? 8;
}

function coverageRatio(product: CatalogueProduct, target: CanonicalPlanState["targets"][number]) {
  const requested = doseComparable(target.amount, target.unit, target.name);
  const delivered = product.candidate.facts[0]?.comparableAmount ?? 0;

  if (requested <= 0) {
    return 0;
  }

  return delivered / requested;
}

function pickForTarget(
  target: CanonicalPlanState["targets"][number],
  eligible: readonly CatalogueProduct[],
  mode: "cheapest" | "coverage"
) {
  const candidates = eligible
    .filter((item) => item.contributionSupplementIds.includes(target.supplementId))
    .slice()
    .sort((left, right) => {
      if (mode === "coverage") {
        const leftRatio = coverageRatio(left, target);
        const rightRatio = coverageRatio(right, target);
        const leftComplete = leftRatio >= 0.9 ? 1 : 0;
        const rightComplete = rightRatio >= 0.9 ? 1 : 0;

        if (leftComplete !== rightComplete) {
          return rightComplete - leftComplete;
        }

        if (leftComplete === 1) {
          if (left.unitPriceMinor !== right.unitPriceMinor) {
            return left.unitPriceMinor - right.unitPriceMinor;
          }
        } else if (leftRatio !== rightRatio) {
          return rightRatio - leftRatio;
        }
      }

      if (left.unitPriceMinor !== right.unitPriceMinor) {
        return left.unitPriceMinor - right.unitPriceMinor;
      }

      if (left.dailyPills !== right.dailyPills) {
        return left.dailyPills - right.dailyPills;
      }

      return left.productId.localeCompare(right.productId);
    });

  return candidates[0] ?? null;
}

function greedyStack(
  state: CanonicalPlanState,
  eligible: readonly CatalogueProduct[],
  availabilityAsOf: string,
  reason: string,
  mode: "cheapest" | "coverage" = "cheapest"
) {
  const selected: CatalogueProduct[] = [];
  const retain = new Set(state.requirements.retainProductIds ?? []);
  const cap = maxProductCount(state);

  for (const product of eligible) {
    if (retain.has(product.productId) && selected.length < cap) {
      selected.push(product);
    }
  }

  for (const target of state.targets) {
    if (selected.length >= cap) {
      break;
    }

    if (state.requirements.excludeSupplementIds?.includes(target.supplementId)) {
      continue;
    }

    if (selected.some((item) => item.contributionSupplementIds.includes(target.supplementId))) {
      continue;
    }

    const picked = pickForTarget(target, eligible, mode);

    if (picked) {
      selected.push(picked);
    }
  }

  selected.sort((left, right) => left.productId.localeCompare(right.productId));
  return stackFromProducts(state, selected, availabilityAsOf, reason);
}

function optionIsComplete(option: StackOption) {
  if (option.coverage.length === 0) {
    return false;
  }

  return option.coverage.every(
    (row) => row.status === "covered" || row.status === "over_target"
  );
}

function cheaperReason(selected: StackOption, cheaper: StackOption) {
  if (cheaper.totalPriceMinor >= selected.totalPriceMinor) {
    return "Alternative stack";
  }

  return optionIsComplete(cheaper)
    ? "Lower-cost complete stack"
    : "Lower-cost incomplete stack";
}

function basketKey(option: StackOption) {
  return option.basket
    .map((item) => item.productId)
    .slice()
    .sort()
    .join("|");
}

function materialDifference(left: StackOption | null, right: StackOption | null) {
  if (!left || !right) {
    return false;
  }

  if (left.optionId === right.optionId || basketKey(left) === basketKey(right)) {
    return false;
  }

  return (
    Math.abs(left.totalPriceMinor - right.totalPriceMinor) >= 1000 ||
    Math.abs(left.coveragePercent - right.coveragePercent) >= 5 ||
    Math.abs(left.dailyPills - right.dailyPills) >= 1 ||
    left.basket.length !== right.basket.length
  );
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

      if (
        selectedRow &&
        row.coveragePercent + 10 < selectedRow.coveragePercent
      ) {
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
  const eligible = input.snapshot.products.filter((product) =>
    productEligible(product, input.state)
  );
  const needs = toNeed(input.state);
  const maxProducts = maxProductCount(input.state);
  const coverageFirst = greedyStack(
    input.state,
    eligible,
    input.snapshot.availabilityAsOf,
    "Highest-coverage feasible stack",
    "coverage"
  );
  const cheapest = greedyStack(
    { ...input.state, optimization: "lowest_cost" },
    eligible,
    input.snapshot.availabilityAsOf,
    "Lower-cost incomplete stack",
    "cheapest"
  );
  let selected = coverageFirst;

  if (input.state.optimization === "lowest_cost") {
    selected = cheapest;
  }

  if (needs.length > 0 && eligible.length > 0) {
    const beam = recommendProductStackFullBeam({
      budgetAmount: input.state.requirements.maxPriceMinor
        ? input.state.requirements.maxPriceMinor / 100
        : null,
      candidates: eligible.map((item) => item.candidate),
      countryCode: "TH",
      maxProducts,
      needs,
      stackPreference:
        input.state.optimization === "fewest_pills" ? "compact" : "balanced"
    });
    const mapped = beam.recommendations
      .map((row) => eligible.find((item) => item.candidate.id === row.product.id))
      .filter((item): item is CatalogueProduct => Boolean(item));

    if (mapped.length > 0) {
      const beamed = stackFromProducts(
        input.state,
        mapped,
        input.snapshot.availabilityAsOf,
        "Selected for coverage, price and daily pills"
      );

      if (
        input.state.optimization === "lowest_cost"
          ? beamed.totalPriceMinor < selected.totalPriceMinor
          : beamed.coveragePercent > selected.coveragePercent ||
            (beamed.coveragePercent === selected.coveragePercent &&
              beamed.totalPriceMinor < selected.totalPriceMinor)
      ) {
        selected = beamed;
      }
    }
  }

  if (
    input.state.optimization !== "lowest_cost" &&
    (coverageFirst.coveragePercent > selected.coveragePercent ||
      (coverageFirst.coveragePercent === selected.coveragePercent &&
        coverageFirst.totalPriceMinor < selected.totalPriceMinor))
  ) {
    selected = coverageFirst;
  }

  const alternatives: StackOption[] = [];

  if (input.state.optimization !== "lowest_cost" && materialDifference(selected, cheapest)) {
    alternatives.push({
      ...cheapest,
      reason: cheaperReason(selected, cheapest)
    });
  }

  if (input.state.optimization !== "fewest_pills") {
    const compactEligible = eligible.slice().sort((left, right) => {
      if (left.dailyPills !== right.dailyPills) {
        return left.dailyPills - right.dailyPills;
      }

      return left.productId.localeCompare(right.productId);
    });
    const compact = greedyStack(
      { ...input.state, optimization: "fewest_pills" },
      compactEligible,
      input.snapshot.availabilityAsOf,
      "Fewer daily pills",
      "coverage"
    );

    if (
      materialDifference(selected, compact) &&
      alternatives.every((item) => materialDifference(item, compact))
    ) {
      alternatives.push(compact);
    }
  }

  const limited = alternatives.slice(0, 2);
  const leftovers = leftoversFor(input.state, selected, cheapest);

  return {
    alternatives: limited,
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
