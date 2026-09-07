import { payableSnapshot } from "@/lib/agentic/money";
import { catalogueSnapshotId } from "@/lib/agentic/catalogue/freeze";
import type { CatalogueProduct, CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import type { BasketItem, CanonicalPlanState, EconomicsUnavailableReason, HorizonOrder } from "@/lib/agentic/plan/types";
import { toMatcherProduct } from "@/lib/agentic/plan/to-matcher-product";
import { contributionFor } from "@/lib/matcher/candidates";
import { amountFromScaled, isDoseError, scaleAmount } from "@/lib/matcher/dose";
import { nutrientNameMatchesTarget } from "@/lib/nutrient-identity";
import { servingsPerPackFromProduct } from "@/lib/agentic/value/pack-facts";

export type { HorizonOrder };

export type HorizonPlan = Readonly<{
  durationUnknown: boolean;
  complete: boolean;
  unavailableReasons: readonly EconomicsUnavailableReason[];
  nextReplenishmentDay: number | null;
  orders: readonly HorizonOrder[];
  purchaseRequiredNow: boolean;
  reasonCode:
    | "current_inventory_covers_now"
    | "current_inventory_duration_unknown"
    | "current_inventory_information_incomplete"
    | "purchase_now"
    | null;
  snapshotId: string;
}>;

type ContinuedInventory = Readonly<{
  dailyAmount: number | null; daysRemaining?: number; productId?: string;
  supplementId?: string; name: string; unit?: string; certainty: "known" | "estimated" | "unknown"; path: string;
  unresolved?: boolean;
}>;

function continuedInventory(state: CanonicalPlanState): ContinuedInventory[] {
  return [
    ...state.currentSupplements.flatMap((row, index) => row.dailyAmount > 0 ? [{ ...row, certainty: "known" as const, path: `currentSupplements[${index}]` }] : []),
    ...(state.intake ?? []).flatMap((row, index) => row.source !== "current_supplement" ||
      (row.certainty === "known" && row.amount === 0) || (row.certainty === "estimated" && row.maximum === 0) ? [] : [{
      dailyAmount: row.certainty === "known" ? row.amount ?? null : null,
      daysRemaining: row.daysRemaining,
      name: row.name ?? row.supplementId ?? "Continued supplement", supplementId: row.supplementId,
      productId: row.productId, unit: row.certainty === "unknown" ? undefined : row.unit, certainty: row.certainty, path: `intake[${index}]`
    }]),
    ...state.leftovers.flatMap((row, index) => {
      if (row.source !== "current_supplement" || row.amount === 0) return [];
      const original = row.requestIndex == null ? undefined : state.originalRequest?.currentSupplements?.[row.requestIndex];
      return [{ dailyAmount: null, daysRemaining: original?.daysRemaining, productId: original?.productId,
        name: row.name, unit: row.unit, certainty: "unknown" as const, unresolved: true,
        path: row.requestIndex == null ? `leftovers[${index}]` : `currentSupplements[${row.requestIndex}]` }];
    })
  ];
}

export function hasContinuedInventory(state: CanonicalPlanState) { return continuedInventory(state).length > 0; }

export function coveringInventoryDurationUnknown(state: CanonicalPlanState) {
  // Partial continued intake still consumes stock and can create future costs.
  return continuedInventory(state).some(row => row.daysRemaining == null);
}

/** Measured form-compatible facts only; gross oil and duplicate label aliases do not count twice. */
function measuredServing(product: CatalogueProduct, current: Pick<ContinuedInventory, "name" | "supplementId" | "unit">) {
  if (!current.supplementId || !current.unit) return null;
  const facts = contributionFor(toMatcherProduct(product), current.name, current.supplementId);
  if (!facts.length) return null;
  const converted = facts.map(fact => fact.amount == null || !fact.unit ? null : scaleAmount({
    amount: fact.amount, subjectId: current.supplementId!, subjectName: fact.name, unit: fact.unit
  }));
  if (converted.some(row => !row || isDoseError(row) || row.units <= BigInt(0))) return null;
  const amounts = converted.filter((row): row is Exclude<typeof row, null | { reason: string }> => Boolean(row && !isDoseError(row)));
  const first = amounts[0];
  if (!first || amounts.some(row => row.dim !== first.dim)) return null;
  const components = /^(?:omega[- _]?3|omega[- _]?3 fatty acids)$/i.test(current.name) &&
    facts.every(row => nutrientNameMatchesTarget("EPA", row.name) || nutrientNameMatchesTarget("DHA", row.name));
  const units = amounts.reduce((total, row) => components ? total + row.units : total > row.units ? total : row.units, BigInt(0));
  return { ...first, units };
}

export function labelledNutrientPerServing(product: CatalogueProduct, current: Readonly<{ name: string; supplementId: string; unit: CanonicalPlanState["targets"][number]["unit"] }>) {
  const amount = measuredServing(product, current);
  return amount ? amountFromScaled(amount, current.unit, current.name) : null;
}

function continuedDose(product: CatalogueProduct, row: ContinuedInventory) {
  if (row.certainty !== "known" || row.dailyAmount == null || !row.unit || !row.supplementId) return null;
  const labelled = measuredServing(product, row);
  const daily = scaleAmount({ amount: row.dailyAmount, subjectId: row.supplementId, subjectName: row.name, unit: row.unit });
  if (!labelled || isDoseError(daily) || daily.units <= BigInt(0) || daily.dim !== labelled.dim) return null;
  return { numerator: daily.units, denominator: labelled.units, servings: Number(daily.units) / Number(labelled.units) };
}

function packsForDays(servingsPerPack: number | null, days: number, dailyServings: number) {
  if (servingsPerPack == null || servingsPerPack <= 0 || dailyServings <= 0 || days <= 0) {
    return null;
  }
  return Math.max(1, Math.ceil((days * dailyServings) / servingsPerPack));
}

function inventoryFraction(value: number) {
  const [mantissa, exponent = "0"] = String(value).split("e");
  const [whole, decimals = ""] = mantissa!.split(".");
  const scale = decimals.length - Number(exponent);
  return { numerator: BigInt(`${whole}${decimals}`) * (scale < 0 ? BigInt(10) ** BigInt(-scale) : BigInt(1)),
    denominator: scale > 0 ? BigInt(10) ** BigInt(scale) : BigInt(1) };
}

/** A measured dose ratio must not become an extra pack through binary rounding. */
function continuedReplenishment(servingsPerPack: number, daysRemaining: number, dose: { numerator: bigint; denominator: bigint }) {
  const pack = inventoryFraction(servingsPerPack);
  const days = inventoryFraction(daysRemaining);
  const numerator = (BigInt(90) * days.denominator - days.numerator) * dose.numerator * pack.denominator;
  const denominator = days.denominator * dose.denominator * pack.numerator;
  const quantity = (numerator + denominator - BigInt(1)) / denominator;
  const nextNumerator = days.numerator * dose.numerator * pack.denominator + quantity * pack.numerator * dose.denominator * days.denominator;
  const nextDenominator = days.denominator * dose.numerator * pack.denominator;
  return { quantity: Number(quantity), nextReplenishmentDay: Number(nextNumerator) / Number(nextDenominator) };
}

/** One published 90-day schedule; a refill before day H contributes to cash and inventory at H. */
export function newProductReplenishment(input: Readonly<{ servingsPerPack: number | null; dailyServings: number; quantity: number }>) {
  const { servingsPerPack: spp, dailyServings: daily } = input;
  const depletion = spp != null && spp > 0 && daily > 0 ? (spp * input.quantity) / daily : null;
  const quantity = depletion != null && depletion < 90 ? packsForDays(spp, 90 - depletion, daily) : null;
  return { depletion, quantity };
}

function consolidateOrders(orders: readonly HorizonOrder[]): HorizonOrder[] {
  const byDay = new Map<number, HorizonOrder[]>();
  for (const order of orders) {
    const group = byDay.get(order.day) ?? [];
    group.push(order);
    byDay.set(order.day, group);
  }

  return [...byDay.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, group]) => {
      if (group.length === 1) {
        return group[0]!;
      }
      const subtotalMinor = group.reduce((sum, item) => sum + item.subtotalMinor, 0);
      const payable = payableSnapshot({ subtotalMinor });
      const type = group.some((item) => item.type === "immediate") ? "immediate" : "replenishment";
      const nextReplenishmentDay = group
        .map((item) => item.nextReplenishmentDay)
        .filter((item): item is number => item != null)
        .sort((left, right) => left - right)[0] ?? null;
      return {
        day: group[0]!.day,
        inventoryAfter: group.reduce((sum, item) => sum + item.inventoryAfter, 0),
        inventoryBefore: group.reduce((sum, item) => sum + item.inventoryBefore, 0),
        lines: group.flatMap((item) => [...item.lines]),
        nextReplenishmentDay,
        otherCustomerCostMinor: payable.taxMinor,
        productIds: group.flatMap((item) => [...item.productIds]),
        quantities: group.flatMap((item) => [...item.quantities]),
        shippingMinor: payable.shippingMinor,
        shippingRuleId: payable.shippingRuleId,
        shippingRuleVersion: payable.shippingRuleVersion,
        subtotalMinor,
        totalMinor: payable.totalPriceMinor,
        type
      };
    });
}

function orderFor(input: Readonly<{
  day: number;
  inventoryAfter: number;
  inventoryBefore: number;
  nextReplenishmentDay: number | null;
  productId: string;
  quantity: number;
  type: HorizonOrder["type"];
  unitPriceMinor: number;
}>): HorizonOrder {
  const lineTotalMinor = input.unitPriceMinor * input.quantity;
  const payable = payableSnapshot({ subtotalMinor: lineTotalMinor });
  return {
    day: input.day,
    inventoryAfter: input.inventoryAfter,
    inventoryBefore: input.inventoryBefore,
    lines: [
      {
        lineTotalMinor,
        productId: input.productId,
        quantity: input.quantity,
        unitPriceMinor: input.unitPriceMinor
      }
    ],
    nextReplenishmentDay: input.nextReplenishmentDay,
    otherCustomerCostMinor: payable.taxMinor,
    productIds: [input.productId],
    quantities: [input.quantity],
    shippingMinor: payable.shippingMinor,
    shippingRuleId: payable.shippingRuleId,
    shippingRuleVersion: payable.shippingRuleVersion,
    subtotalMinor: lineTotalMinor,
    totalMinor: payable.totalPriceMinor,
    type: input.type
  };
}

export function ordersInHorizon(orders: readonly HorizonOrder[], horizonDays: number) {
  return orders.filter((item) => item.day < horizonDays);
}

export function cashInHorizon(orders: readonly HorizonOrder[], horizonDays: number) {
  return ordersInHorizon(orders, horizonDays).reduce((sum, item) => sum + item.totalMinor, 0);
}

export function buildHorizonPlan(input: Readonly<{
  items?: readonly BasketItem[];
  snapshot: CatalogueSnapshot;
  state: CanonicalPlanState;
}>): HorizonPlan {
  const items = input.items ?? [];
  const orders: HorizonOrder[] = [];
  const unavailableReasons: EconomicsUnavailableReason[] = [];
  const unavailable = (reasonCode: string, missingFieldNames: string[]) => {
    unavailableReasons.push({ reasonCode, missingFieldNames, dimension: "schedule",
      dependentCapabilities: ["inventory_depletion_date", "future_order_schedule", "delivered_cash", "savings", "comparison"] });
  };
  let nextReplenishmentDay: number | null = null;

  for (const item of items) {
    const quantity = Math.max(1, item.quantity);
    const spp = item.servingsPerPack ?? null;
    const daily = item.servingsPerDay;
    if (!(daily > 0) || !Number.isFinite(daily)) unavailable("selected_product_dose_unknown", [`basket.${item.productId}.servingsPerDay`]);
    if (!(spp != null && spp > 0)) unavailable("pack_duration_unknown", [`basket.${item.productId}.servingsPerPack`]);
    if (!(item.unitPriceMinor > 0)) unavailable("price_unavailable", [`basket.${item.productId}.unitPriceMinor`]);
    const before = 0;
    const after = spp != null ? spp * quantity : quantity;
    const { depletion, quantity: restock } = newProductReplenishment({ servingsPerPack: spp, dailyServings: daily, quantity });
    if (depletion != null) {
      nextReplenishmentDay =
        nextReplenishmentDay == null ? depletion : Math.min(nextReplenishmentDay, depletion);
    }
    orders.push(
      orderFor({
        day: 0,
        inventoryAfter: after,
        inventoryBefore: before,
        nextReplenishmentDay: depletion,
        productId: item.productId,
        quantity,
        type: "immediate",
        unitPriceMinor: item.unitPriceMinor
      })
    );
    if (depletion != null && depletion < 90) {
      if (restock != null) {
        const restockDays = spp != null && daily > 0 ? (restock * spp) / daily : null;
        orders.push(
          orderFor({
            day: depletion,
            inventoryAfter: restock * (spp ?? 1),
            inventoryBefore: 0,
            nextReplenishmentDay:
              restockDays != null ? depletion + restockDays : null,
            productId: item.productId,
            quantity: restock,
            type: "replenishment",
            unitPriceMinor: item.unitPriceMinor
          })
        );
      }
    }
  }

  const byProduct = new Map<string, ContinuedInventory[]>();
  for (const row of continuedInventory(input.state)) {
    const key = row.productId ?? row.path;
    byProduct.set(key, [...(byProduct.get(key) ?? []), row]);
  }
  for (const rows of byProduct.values()) {
    const first = rows[0]!;
    const unresolved = rows.filter(row => row.unresolved);
    if (unresolved.length) {
      unavailable("current_inventory_nutrient_unresolved", unresolved.map(row => `${row.path}.name`));
      continue;
    }
    const durations = rows.map(row => row.daysRemaining);
    if (durations.some(days => days == null || !Number.isFinite(days) || days < 0)) {
      unavailable("current_inventory_duration_unknown", rows.filter(row => row.daysRemaining == null).map(row => `${row.path}.daysRemaining`));
      continue;
    }
    const daysRemaining = durations[0]!;
    if (durations.some(days => days !== daysRemaining)) {
      unavailable("current_inventory_duration_inconsistent", rows.map(row => `${row.path}.daysRemaining`));
      continue;
    }
    if (rows.some(row => row.certainty !== "known" || row.dailyAmount == null)) {
      unavailable("current_inventory_dose_unknown", rows.map(row => `${row.path}.dailyAmount`));
      continue;
    }
    nextReplenishmentDay = nextReplenishmentDay == null ? daysRemaining : Math.min(nextReplenishmentDay, daysRemaining);
    if (daysRemaining >= 90) continue; // Explicit stock duration proves no refill within this horizon.
    const product = first.productId ? input.snapshot.products.find(item => item.productId === first.productId) : null;
    if (!product) {
      unavailable(first.productId ? "current_inventory_product_unavailable" : "current_inventory_product_unknown", rows.map(row => `${row.path}.productId`));
      continue;
    }
    if (!product.orderable || product.stockStatus === "unavailable" || product.incompleteCommercialFacts || product.candidate.currency !== input.state.currency) {
      unavailable("current_inventory_product_unavailable", [`catalogue.${product.productId}.availability`]);
      continue;
    }
    if (items.some(item => item.productId === product.productId)) {
      // Selected extra servings and retained stock need one shared inventory basis;
      // separate schedules would promise two purchases of the same physical product.
      unavailable("current_inventory_selected_product_overlap", rows.map(row => `${row.path}.inventoryBasis`));
      continue;
    }
    const doses = rows.map(row => continuedDose(product, row));
    if (doses.some(dose => !dose || !(dose.servings > 0) || !Number.isFinite(dose.servings))) {
      unavailable("current_inventory_dose_unknown", rows.map(row => `${row.path}.dailyAmount`));
      continue;
    }
    const dose = doses[0]!;
    if (doses.some(other => other!.numerator * dose.denominator !== dose.numerator * other!.denominator)) {
      unavailable("current_inventory_dose_inconsistent", rows.map(row => `${row.path}.dailyAmount`));
      continue;
    }
    const spp = servingsPerPackFromProduct(product);
    if (spp == null || spp <= 0) {
      unavailable("current_inventory_pack_unknown", [`catalogue.${product.productId}.servingsPerPack`]);
      continue;
    }
    if (!(product.unitPriceMinor > 0) || !Number.isSafeInteger(product.unitPriceMinor)) {
      unavailable("current_inventory_price_unknown", [`catalogue.${product.productId}.unitPriceMinor`]);
      continue;
    }
    const { quantity, nextReplenishmentDay: restockNextDay } = continuedReplenishment(spp, daysRemaining, dose);
    if (!(quantity > 0) || !Number.isSafeInteger(quantity) || !Number.isSafeInteger(quantity * product.unitPriceMinor)) {
      unavailable("current_inventory_cost_out_of_range", rows.map(row => `${row.path}.dailyAmount`));
      continue;
    }
    orders.push(orderFor({ day: daysRemaining, inventoryAfter: quantity * spp, inventoryBefore: 0,
      nextReplenishmentDay: restockNextDay, productId: product.productId,
      quantity, type: "replenishment", unitPriceMinor: product.unitPriceMinor }));
  }

  const purchaseRequiredNow = items.length > 0;
  const durationUnknown = coveringInventoryDurationUnknown(input.state);
  return {
    durationUnknown,
    complete: unavailableReasons.length === 0,
    unavailableReasons,
    nextReplenishmentDay: unavailableReasons.length > 0 ? null : nextReplenishmentDay,
    orders: consolidateOrders(orders),
    purchaseRequiredNow,
    reasonCode: purchaseRequiredNow
      ? "purchase_now"
      : durationUnknown
        ? "current_inventory_duration_unknown"
        : unavailableReasons.length > 0
          ? "current_inventory_information_incomplete"
        : nextReplenishmentDay != null
          ? "current_inventory_covers_now"
          : null,
    snapshotId: catalogueSnapshotId(input.snapshot)
  };
}
