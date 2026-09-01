import { catalogueSnapshotId } from "@/lib/agentic/catalogue/freeze";
import type { CatalogueProduct, CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import type {
  BasketItem,
  CanonicalPlanState,
  CoverageRow,
  EconomicsBaselineLine,
  EconomicsComparisonBasis,
  EconomicsLedger
} from "@/lib/agentic/plan/types";
import { productIsDedicatedForTarget } from "@/lib/matcher/candidates";
import { toMatcherProduct } from "@/lib/agentic/plan/to-matcher-product";
import { packsForHorizon } from "@/lib/agentic/value/horizon-cash";
import { actualDaysSupplied, servingsPerPackFromProduct } from "@/lib/agentic/value/pack-facts";
import {
  buildHorizonPlan,
  cashInHorizon,
  type HorizonOrder
} from "@/lib/agentic/value/inventory-ledger";

const DEFAULT_HORIZONS = [30, 90] as const;

export function packsThroughHorizon(input: Readonly<{
  dailyServings: number;
  horizonDays: number;
  servingsPerPack: number | null | undefined;
}>) {
  return packsForHorizon(input);
}

export function leftoverServingsAt(input: Readonly<{
  dailyServings: number;
  horizonDays: number;
  servingsPerPack: number | null | undefined;
}>) {
  if (input.servingsPerPack == null || input.servingsPerPack <= 0 || input.dailyServings <= 0) {
    return null;
  }

  const packs = packsThroughHorizon(input);
  if (packs == null) {
    return null;
  }
  return packs * input.servingsPerPack - input.horizonDays * input.dailyServings;
}

export function enrichBasketPackFacts(item: BasketItem): BasketItem {
  const servingsPerPack = item.servingsPerPack ?? null;
  const purchasedQuantity = Math.max(1, item.quantity);
  const dailyServings = Math.max(1, item.servingsPerDay);
  const availableServings =
    servingsPerPack != null ? servingsPerPack * purchasedQuantity : null;
  const daysOfSupply = actualDaysSupplied({
    dailyServings,
    purchasedQuantity,
    servingsPerPack
  });

  return {
    ...item,
    availableServings,
    daysOfSupply,
    leftoverServings30: leftoverServingsAt({
      dailyServings,
      horizonDays: 30,
      servingsPerPack
    }),
    leftoverServings90: leftoverServingsAt({
      dailyServings,
      horizonDays: 90,
      servingsPerPack
    }),
    lineTotalMinor: item.unitPriceMinor * purchasedQuantity,
    quantity: purchasedQuantity,
    replenishmentDay: daysOfSupply,
    servingsPerPack
  };
}

function lineConsumption(item: BasketItem, horizonDays: number) {
  if (item.servingsPerPack == null || item.servingsPerPack <= 0 || item.servingsPerDay <= 0) {
    return null;
  }

  return Math.round(
    (item.unitPriceMinor / item.servingsPerPack) * horizonDays * item.servingsPerDay
  );
}

function coveredCount(coverage: readonly CoverageRow[]) {
  return coverage.filter(
    (row) =>
      row.status === "covered" ||
      row.status === "already_covered" ||
      row.status === "over_target"
  ).length;
}

function administrationCount(items: readonly BasketItem[]) {
  return items.filter((item) => /powder|liquid|sachet/i.test(item.form)).length;
}

function dedicatedProduct(
  snapshot: CatalogueSnapshot,
  state: CanonicalPlanState,
  coverage: CoverageRow
): CatalogueProduct | null {
  const target = state.targets.find((item) => item.supplementId === coverage.supplementId);

  if (!target) {
    return null;
  }

  const matcherTarget = {
    importance: target.importance ?? "required",
    name: target.name,
    requested: {
      dim: "mass_ng" as const,
      subjectId: target.supplementId,
      units: BigInt(0)
    },
    requestedAmount: target.amount,
    requestedUnit: target.unit,
    subjectId: target.supplementId
  };
  return (
    snapshot.products
      .filter(
        (product) =>
          product.source !== "fixture" &&
          product.orderable &&
          !product.incompleteCommercialFacts &&
          product.contributionSupplementIds.includes(target.supplementId) &&
          productIsDedicatedForTarget(toMatcherProduct(product), matcherTarget)
      )
      .sort(
        (left, right) =>
          left.unitPriceMinor - right.unitPriceMinor || left.productId.localeCompare(right.productId)
      )[0] ?? null
  );
}

function syntheticBasketItem(
  product: CatalogueProduct,
  snapshot: CatalogueSnapshot,
  state: CanonicalPlanState,
  dailyServings = 1,
  quantity = 1
): BasketItem {
  return enrichBasketPackFacts({
    availabilityAsOf: snapshot.availabilityAsOf,
    contributionSupplementIds: product.contributionSupplementIds,
    currency: product.candidate.currency || state.currency,
    dailyPills: product.dailyPills,
    deliveryWindow: product.stockStatus === "backorder" ? "backorder" : "3-5 days",
    fixture: product.source === "fixture",
    form: product.form,
    imageUrl: product.candidate.imageUrl?.trim() || null,
    incidentalNutrientNames: [],
    incidentalNutrients: [],
    incompleteCommercialFacts: product.incompleteCommercialFacts,
    lineTotalMinor: product.unitPriceMinor * quantity,
    pillsPerServing: product.dailyPills,
    productId: product.productId,
    productName: product.candidate.title,
    quantity,
    requestedNutrientNames: [],
    retailerSku: product.retailerSku,
    sellerId: product.sellerId,
    sellerName: product.sellerName,
    servingsPerDay: Math.max(1, dailyServings),
    servingsPerPack: servingsPerPackFromProduct(product),
    source: product.source,
    stockStatus: product.stockStatus === "backorder" ? "backorder" : "in_stock",
    unitPriceMinor: product.unitPriceMinor
  });
}

function baselineBasketItems(input: Readonly<{
  coverage: readonly CoverageRow[];
  items: readonly BasketItem[];
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): BasketItem[] {
  if (input.state.baseline?.type === "current_basket" && input.state.baseline.items?.length) {
    return input.state.baseline.items
      .map((item) => {
        const product = input.snapshot.products.find((row) => row.productId === item.productId);
        if (!product) {
          return null;
        }
        const quantity = Math.max(1, Math.ceil(item.quantity));
        const fromOption = input.items.find((row) => row.productId === product.productId);
        if (fromOption) {
          return enrichBasketPackFacts({ ...fromOption, quantity });
        }
        return syntheticBasketItem(product, input.snapshot, input.state, 1, quantity);
      })
      .filter((item): item is BasketItem => Boolean(item));
  }

  const seen = new Set<string>();
  const items: BasketItem[] = [];
  for (const row of input.coverage) {
    if (row.status !== "covered" && row.status !== "over_target") {
      continue;
    }
    const product = dedicatedProduct(input.snapshot, input.state, row);
    if (!product || seen.has(product.productId)) {
      continue;
    }
    seen.add(product.productId);
    const fromOption = input.items.find((item) => item.productId === product.productId);
    items.push(fromOption ?? syntheticBasketItem(product, input.snapshot, input.state));
  }
  return items;
}

function linesFromOrders(
  orders: readonly HorizonOrder[],
  snapshot: CatalogueSnapshot
): EconomicsBaselineLine[] {
  const totals = new Map<string, { quantity: number; unitPriceMinor: number }>();
  for (const order of orders) {
    order.productIds.forEach((productId, index) => {
      const quantity = order.quantities[index] ?? 1;
      const product = snapshot.products.find((item) => item.productId === productId);
      const unitPriceMinor = product?.unitPriceMinor ?? 0;
      const previous = totals.get(productId);
      totals.set(productId, {
        quantity: (previous?.quantity ?? 0) + quantity,
        unitPriceMinor: previous?.unitPriceMinor ?? unitPriceMinor
      });
    });
  }
  return [...totals.entries()].map(([productId, row]) => ({
    lineTotalMinor: row.unitPriceMinor * row.quantity,
    productId,
    quantity: row.quantity,
    unitPriceMinor: row.unitPriceMinor
  }));
}

function comparisonBasisFor(
  snapshot: CatalogueSnapshot,
  state: CanonicalPlanState
): EconomicsComparisonBasis {
  return {
    baselineType: state.baseline?.type ?? "separate_direct_products",
    catalogueSnapshotId: catalogueSnapshotId(snapshot),
    costHorizonsDays: [...DEFAULT_HORIZONS],
    currency: state.currency,
    currentInventory: state.currentSupplements.map((item) => ({
      daysRemaining: item.daysRemaining ?? null,
      productId: item.productId ?? null,
      supplementId: item.supplementId
    })),
    destinationCountry: state.destinationCountry,
    orderBoundary: "order_at_H_excluded",
    rounding: "minor_unit_once"
  };
}

export function buildEconomics(input: Readonly<{
  coverage: readonly CoverageRow[];
  items: readonly BasketItem[];
  recommendedCoverage?: readonly CoverageRow[];
  recommendedItems?: readonly BasketItem[];
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): EconomicsLedger {
  const items = input.items.map(enrichBasketPackFacts);
  const consumption30Parts = items.map((item) => lineConsumption(item, 30));
  const consumption90Parts = items.map((item) => lineConsumption(item, 90));
  const consumption30DayMinor = consumption30Parts.every((item) => item != null)
    ? consumption30Parts.reduce((sum, item) => sum + (item ?? 0), 0)
    : null;
  const consumption90DayMinor = consumption90Parts.every((item) => item != null)
    ? consumption90Parts.reduce((sum, item) => sum + (item ?? 0), 0)
    : null;
  const horizon = buildHorizonPlan({
    items,
    snapshot: input.snapshot,
    state: input.state
  });
  const cash30DayMinor = cashInHorizon(horizon.orders, 30);
  const cash90DayMinor = cashInHorizon(horizon.orders, 90);
  const day0 = horizon.orders.find((item) => item.day === 0);
  const firstOrderSubtotalMinor =
    day0?.subtotalMinor ?? items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  const shippingMinor = day0?.shippingMinor ?? 0;
  const otherCustomerCostMinor = day0?.otherCustomerCostMinor ?? 0;
  const baselineItems = baselineBasketItems({
    coverage: input.coverage,
    items,
    snapshot: input.snapshot,
    state: input.state
  });
  const baselineHorizon = buildHorizonPlan({
    items: baselineItems,
    snapshot: input.snapshot,
    state: input.state
  });
  const baselineCash90 = cashInHorizon(baselineHorizon.orders, 90);
  const baselineLines = linesFromOrders(baselineHorizon.orders, input.snapshot);
  const savings90DayMinor = baselineCash90 - cash90DayMinor;
  const equivalent = input.coverage.every((row) => {
    const target = input.state.targets.find((item) => item.supplementId === row.supplementId);
    const importance = target?.importance ?? "required";

    if (importance !== "core" && importance !== "required") {
      return true;
    }

    return (
      row.status === "covered" ||
      row.status === "already_covered" ||
      row.status === "over_target"
    );
  });
  const recommended = input.recommendedItems?.map(enrichBasketPackFacts) ?? items;
  const recommendedCoverage = input.recommendedCoverage ?? input.coverage;
  const complete =
    items.length > 0 &&
    items.every((item) => item.servingsPerPack != null && item.servingsPerPack > 0) &&
    cash30DayMinor != null &&
    cash90DayMinor != null &&
    consumption30DayMinor != null &&
    consumption90DayMinor != null;
  const eligibleSaving = complete && equivalent && savings90DayMinor != null;
  const savingClaim = !eligibleSaving
    ? "none"
    : savings90DayMinor > 0
      ? "positive"
      : savings90DayMinor < 0
        ? "loss"
        : "none";

  return {
    baseline: {
      cash90DayMinor: baselineCash90,
      lines: baselineLines,
      type: input.state.baseline?.type ?? "separate_direct_products"
    },
    comparisonBasis: comparisonBasisFor(input.snapshot, input.state),
    cash30DayMinor,
    cash90DayMinor,
    cashTotalMinor: day0?.totalMinor ?? 0,
    complete,
    consumption30DayMinor,
    consumption90DayMinor,
    deltas: {
      administrations: administrationCount(items) - administrationCount(recommended),
      coverage: coveredCount(input.coverage) - coveredCount(recommendedCoverage),
      pills:
        items.reduce((sum, item) => sum + item.dailyPills, 0) -
        recommended.reduce((sum, item) => sum + item.dailyPills, 0),
      products: items.length - recommended.length
    },
    equivalent,
    firstOrderSubtotalMinor,
    otherCustomerCostMinor,
    savingClaim,
    savings90DayMinor: eligibleSaving ? savings90DayMinor : null,
    savings90DayPercent:
      !eligibleSaving || baselineCash90 === 0 || savings90DayMinor == null
        ? null
        : savings90DayMinor / baselineCash90,
    shippingMinor
  };
}
