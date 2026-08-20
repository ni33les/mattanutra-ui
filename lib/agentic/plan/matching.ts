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
        const fact = item.candidate.facts[0];
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
    form: product.form,
    incompleteCommercialFacts: product.incompleteCommercialFacts,
    lineTotalMinor: product.unitPriceMinor,
    productId: product.productId,
    productName: product.candidate.title,
    quantity: 1,
    retailerSku: product.retailerSku,
    sellerId: product.sellerId,
    sellerName: product.sellerName,
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

function greedyStack(
  state: CanonicalPlanState,
  eligible: readonly CatalogueProduct[],
  availabilityAsOf: string,
  reason: string
) {
  const selected: CatalogueProduct[] = [];
  const retain = new Set(state.requirements.retainProductIds ?? []);

  for (const product of eligible) {
    if (retain.has(product.productId)) {
      selected.push(product);
    }
  }

  for (const target of state.targets) {
    if (state.requirements.excludeSupplementIds?.includes(target.supplementId)) {
      continue;
    }

    if (selected.some((item) => item.contributionSupplementIds.includes(target.supplementId))) {
      continue;
    }

    const candidates = eligible
      .filter((item) => item.contributionSupplementIds.includes(target.supplementId))
      .slice()
      .sort((left, right) => {
        if (left.unitPriceMinor !== right.unitPriceMinor) {
          return left.unitPriceMinor - right.unitPriceMinor;
        }

        if (left.dailyPills !== right.dailyPills) {
          return left.dailyPills - right.dailyPills;
        }

        return left.productId.localeCompare(right.productId);
      });

    if (candidates[0]) {
      selected.push(candidates[0]);
    }
  }

  selected.sort((left, right) => left.productId.localeCompare(right.productId));
  return stackFromProducts(state, selected, availabilityAsOf, reason);
}

function materialDifference(left: StackOption, right: StackOption) {
  return (
    Math.abs(left.totalPriceMinor - right.totalPriceMinor) >= 1000 ||
    Math.abs(left.coveragePercent - right.coveragePercent) >= 5 ||
    Math.abs(left.dailyPills - right.dailyPills) >= 1 ||
    left.basket.map((item) => item.productId).join() !==
      right.basket.map((item) => item.productId).join()
  );
}

export function matchPlan(input: Readonly<{
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): {
  alternatives: StackOption[];
  selected: StackOption | null;
  unmetRequirements: string[];
} {
  const eligible = input.snapshot.products.filter((product) =>
    productEligible(product, input.state)
  );
  const needs = toNeed(input.state);
  const maxProducts = input.state.requirements.maxProductCount ?? 8;
  let selected = greedyStack(
    input.state,
    eligible,
    input.snapshot.availabilityAsOf,
    "Coverage-first stack"
  );

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
      selected = stackFromProducts(
        input.state,
        mapped,
        input.snapshot.availabilityAsOf,
        "Selected for coverage, price and daily pills"
      );
    }
  }

  const alternatives: StackOption[] = [];

  if (input.state.optimization !== "lowest_cost") {
    const cheaper = greedyStack(
      { ...input.state, optimization: "lowest_cost" },
      eligible,
      input.snapshot.availabilityAsOf,
      "Lower-cost complete stack"
    );

    if (materialDifference(selected, cheaper)) {
      alternatives.push(cheaper);
    }
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
      "Fewer daily pills"
    );

    if (
      materialDifference(selected, compact) &&
      alternatives.every((item) => materialDifference(item, compact))
    ) {
      alternatives.push(compact);
    }
  }

  const limited = alternatives.slice(0, 2);

  return {
    alternatives: limited,
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
