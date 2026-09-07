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
  hasContinuedInventory,
  labelledNutrientPerServing,
  newProductReplenishment,
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
  const dailyServings = item.servingsPerDay;
  const availableServings =
    servingsPerPack != null ? servingsPerPack * purchasedQuantity : null;
  const daysOfSupply = actualDaysSupplied({
    dailyServings,
    purchasedQuantity,
    servingsPerPack
  });
  const refill = newProductReplenishment({ servingsPerPack, dailyServings, quantity: purchasedQuantity });
  const scheduledLeftover = (horizonDays: number) => availableServings == null ? null :
    availableServings + (refill.depletion != null && refill.depletion < horizonDays && refill.quantity != null
      ? refill.quantity * (servingsPerPack ?? 0) : 0) - horizonDays * dailyServings;

  return {
    ...item,
    availableServings,
    daysOfSupply,
    leftoverServings30: scheduledLeftover(30),
    leftoverServings90: scheduledLeftover(90),
    lineTotalMinor: item.unitPriceMinor * purchasedQuantity,
    quantity: purchasedQuantity,
    replenishmentDay: daysOfSupply,
    servingsPerPack
  };
}

function decimalFraction(value: number) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
  const [whole, decimals = ""] = mantissa!.split(".");
  const scale = decimals.length - Number(exponent);
  return { numerator: BigInt(`${whole}${decimals}`) * (scale < 0 ? BigInt(10) ** BigInt(-scale) : BigInt(1)),
    denominator: scale > 0 ? BigInt(10) ** BigInt(scale) : BigInt(1) };
}

/** Sum exact decimal-input fractions, then round once to the nearest minor unit. */
function totalConsumption(items: readonly BasketItem[], horizonDays: number) {
  let numerator = BigInt(0), denominator = BigInt(1);
  for (const item of items) {
    const pack = item.servingsPerPack == null ? null : decimalFraction(item.servingsPerPack);
    const daily = decimalFraction(item.servingsPerDay);
    if (!pack || !daily || !Number.isSafeInteger(item.unitPriceMinor) || item.unitPriceMinor < 0) return null;
    const lineNumerator = BigInt(item.unitPriceMinor) * BigInt(horizonDays) * daily.numerator * pack.denominator;
    const lineDenominator = daily.denominator * pack.numerator;
    numerator = numerator * lineDenominator + lineNumerator * denominator;
    denominator *= lineDenominator;
  }
  const rounded = (BigInt(2) * numerator + denominator) / (BigInt(2) * denominator);
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null;
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
    servingsPerDay: dailyServings,
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
        if (item.dailyServings == null) return null;
        return syntheticBasketItem(product, input.snapshot, input.state, item.dailyServings, quantity);
      })
      .filter((item): item is BasketItem => Boolean(item));
  }

  const seen = new Set<string>();
  const items: BasketItem[] = [];
  for (const row of input.coverage) {
    if (row.deliveredAmount <= 0 || row.status === "conditional_deferred" || row.status === "optional_omitted") {
      continue;
    }
    const product = dedicatedProduct(input.snapshot, input.state, row);
    if (!product || seen.has(product.productId)) {
      continue;
    }
    seen.add(product.productId);
    const target = input.state.targets.find(target => target.supplementId === row.supplementId);
    const perServing = target ? nutrientPerServing(product, target) : null;
    if (perServing == null || perServing <= 0) continue;
    items.push(syntheticBasketItem(product, input.snapshot, input.state, Math.max(1, Math.ceil(row.deliveredAmount / perServing))));
  }
  return items;
}

function nutrientPerServing(product: CatalogueProduct, target: CanonicalPlanState["targets"][number]): number | null {
  return labelledNutrientPerServing(product, target);
}

/** Equivalence concerns every requested target, including disclosed partial coverage. */
export function baselineCoverageEquivalent(input: Readonly<{
  coverage: readonly CoverageRow[];
  baselineItems: readonly BasketItem[];
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>) {
  return input.coverage.every(row => {
    const target = input.state.targets.find(target => target.supplementId === row.supplementId);
    if (!target) return row.coveragePercent === 0;
    let amount = row.currentAmount;
    for (const item of input.baselineItems) {
      const product = input.snapshot.products.find(product => product.productId === item.productId);
      if (!product) return false;
      const perServing = nutrientPerServing(product, target);
      if (perServing != null) amount += perServing * item.servingsPerDay;
      else if (product.contributionSupplementIds.includes(target.supplementId)) return false;
    }
    const baselineRatio = target.amount > 0 ? Math.min(1, amount / target.amount) : 0;
    const selectedRatio = target.amount > 0 ? Math.min(1, (row.currentAmount + row.deliveredAmount) / target.amount) : 0;
    return Math.abs(baselineRatio - selectedRatio) < 1e-9;
  });
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
  const hasCurrent = hasContinuedInventory(input.state);
  const consumption30DayMinor =
    hasCurrent ? null : items.length < 1 ? 0
      : totalConsumption(items, 30);
  const consumption90DayMinor =
    hasCurrent ? null : items.length < 1 ? 0
      : totalConsumption(items, 90);
  const horizon = buildHorizonPlan({
    items,
    snapshot: input.snapshot,
    state: input.state
  });
  const cash30DayMinor = horizon.complete ? cashInHorizon(horizon.orders, 30) : null;
  const cash90DayMinor = horizon.complete ? cashInHorizon(horizon.orders, 90) : null;
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
  const baselineCash90 = baselineHorizon.complete ? cashInHorizon(baselineHorizon.orders, 90) : null;
  const baselineLines = linesFromOrders(baselineHorizon.orders, input.snapshot);
  const savings90DayMinor =
    baselineCash90 == null || cash90DayMinor == null ? null : baselineCash90 - cash90DayMinor;
  const equivalent = baselineCoverageEquivalent({ ...input, baselineItems });
  const baselineMissing = input.state.baseline?.type === "current_basket" &&
    (!input.state.baseline.items?.length || input.state.baseline.items.some(item => !input.snapshot.products.some(p => p.productId === item.productId)));
  const baselineDoseUnknown = input.state.baseline?.type === "current_basket" &&
    input.state.baseline.items?.some(item => item.dailyServings == null);
  // A fresh purchase cannot be compared to retained stock without a replacement/inventory basis.
  // Do not add the same product's exposure and replenishment cost twice.
  const baselineInventoryOverlap = input.state.baseline?.type === "current_basket" &&
    input.state.baseline.items?.some(item => input.state.currentSupplements.some(current => current.productId === item.productId));
  const recommended = input.recommendedItems?.map(enrichBasketPackFacts) ?? items;
  const recommendedCoverage = input.recommendedCoverage ?? input.coverage;
  const pricedOrders = horizon.orders.every((order) =>
    order.lines.every((line) => line.unitPriceMinor > 0)
  );
  const cashComplete = horizon.complete && pricedOrders;
  const consumptionComplete = !hasCurrent && consumption30DayMinor != null && consumption90DayMinor != null;
  const baselineFactsComplete = baselineItems.every(item => item.servingsPerPack != null && item.servingsPerPack > 0 &&
    item.currency === input.state.currency && !item.incompleteCommercialFacts);
  const comparisonComplete = cashComplete && baselineHorizon.complete && equivalent && !baselineMissing && !baselineDoseUnknown && !baselineInventoryOverlap && baselineFactsComplete;
  const unavailableReasons = [
    ...horizon.unavailableReasons,
    ...baselineHorizon.unavailableReasons.filter(reason => !horizon.unavailableReasons.some(existing => existing.reasonCode === reason.reasonCode &&
      existing.missingFieldNames.join() === reason.missingFieldNames.join())).map(reason => ({ ...reason, dimension: "comparison" as const,
        dependentCapabilities: ["savings", "comparison"], missingFieldNames: reason.missingFieldNames.map(field => `baseline.${field}`) })),
    ...(!equivalent || baselineMissing || baselineDoseUnknown || baselineInventoryOverlap || !baselineFactsComplete
      ? [{ dependentCapabilities: ["savings", "comparison"], dimension: "comparison" as const,
          missingFieldNames: baselineMissing ? ["baseline.items.productId"] : baselineDoseUnknown ? ["baseline.items.dailyServings"] : baselineInventoryOverlap ? ["baseline.inventoryBasis"] : !baselineFactsComplete ? ["baseline.packFacts"] : ["baseline.equivalentCoverage"],
          reasonCode: baselineMissing ? "baseline_product_unavailable" : baselineDoseUnknown ? "baseline_dose_unknown" : baselineInventoryOverlap ? "baseline_inventory_overlap" : !baselineFactsComplete ? "baseline_facts_incomplete" : "baseline_coverage_not_equivalent" }]
      : []),
    ...(!consumptionComplete && hasCurrent
      ? [
          {
            dependentCapabilities: ["full_horizon_consumption"],
            dimension: "consumption" as const,
            missingFieldNames: ["acquisitionCost"],
            reasonCode: "current_inventory_acquisition_cost_unknown"
          }
        ]
      : []),
    ...(!cashComplete && horizon.unavailableReasons.length === 0
      ? [{ dependentCapabilities: ["delivered_cash", "savings", "cost_ranking"], dimension: "cash" as const,
          missingFieldNames: ["unitPriceMinor"], reasonCode: "price_unavailable" }]
      : [])
  ];
  const complete =
    cashComplete &&
    consumptionComplete &&
    (items.length === 0 ||
      items.every((item) => item.servingsPerPack != null && item.servingsPerPack > 0));
  const eligibleSaving = comparisonComplete && savings90DayMinor != null;
  const savingClaim = !eligibleSaving
    ? "none"
    : savings90DayMinor > 0
      ? "positive"
      : savings90DayMinor < 0
        ? "loss"
        : "none";

  return {
    baseline: {
      cash90DayMinor: comparisonComplete ? baselineCash90 : null,
      lines: baselineLines,
      type: input.state.baseline?.type ?? "separate_direct_products"
    },
    cashComplete,
    comparisonBasis: comparisonBasisFor(input.snapshot, input.state),
    comparisonComplete,
    cash30DayMinor,
    cash90DayMinor,
    cashTotalMinor: day0?.totalMinor ?? 0,
    complete,
    consumptionComplete,
    consumptionScope: "full_horizon",
    consumption30DayMinor,
    consumption90DayMinor,
    unavailableReasons,
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
      !eligibleSaving || baselineCash90 == null || baselineCash90 === 0 || savings90DayMinor == null
        ? null
        : savings90DayMinor / baselineCash90,
    shippingMinor
  };
}
