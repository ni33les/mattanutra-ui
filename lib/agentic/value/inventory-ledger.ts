import { payableSnapshot } from "@/lib/agentic/money";
import { catalogueSnapshotId } from "@/lib/agentic/catalogue/freeze";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";
import type { BasketItem, CanonicalPlanState } from "@/lib/agentic/plan/types";
import { servingsPerPackFromProduct } from "@/lib/agentic/value/pack-facts";

export type HorizonOrder = Readonly<{
  day: number;
  inventoryAfter: number;
  inventoryBefore: number;
  otherCustomerCostMinor: number;
  productIds: readonly string[];
  quantities: readonly number[];
  shippingMinor: number;
  subtotalMinor: number;
  totalMinor: number;
}>;

export type HorizonPlan = Readonly<{
  nextReplenishmentDay: number | null;
  orders: readonly HorizonOrder[];
  purchaseRequiredNow: boolean;
  reasonCode: "current_inventory_covers_now" | "purchase_now" | null;
  snapshotId: string;
}>;

function productForCurrent(
  snapshot: CatalogueSnapshot,
  current: CanonicalPlanState["currentSupplements"][number]
) {
  if (current.productId) {
    const exact = snapshot.products.find((item) => item.productId === current.productId);
    if (exact) {
      return exact;
    }
  }
  const candidates = snapshot.products.filter(
    (product) =>
      product.source !== "fixture" &&
      product.orderable &&
      !product.incompleteCommercialFacts &&
      product.contributionSupplementIds.includes(current.supplementId)
  );
  const complete = candidates.filter((product) => servingsPerPackFromProduct(product) != null);
  const pool = complete.length > 0 ? complete : candidates;
  return (
    pool.sort(
      (left, right) =>
        left.unitPriceMinor - right.unitPriceMinor || left.productId.localeCompare(right.productId)
    )[0] ?? null
  );
}

function packsForDays(servingsPerPack: number | null, days: number, dailyServings: number) {
  if (servingsPerPack == null || servingsPerPack <= 0 || dailyServings <= 0 || days <= 0) {
    return null;
  }
  return Math.max(1, Math.ceil((days * dailyServings) / servingsPerPack));
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
      return {
        day: group[0]!.day,
        inventoryAfter: group.reduce((sum, item) => sum + item.inventoryAfter, 0),
        inventoryBefore: group.reduce((sum, item) => sum + item.inventoryBefore, 0),
        otherCustomerCostMinor: payable.taxMinor,
        productIds: group.flatMap((item) => [...item.productIds]),
        quantities: group.flatMap((item) => [...item.quantities]),
        shippingMinor: payable.shippingMinor,
        subtotalMinor,
        totalMinor: payable.totalPriceMinor
      };
    });
}

function orderFor(input: Readonly<{
  day: number;
  inventoryAfter: number;
  inventoryBefore: number;
  productId: string;
  quantity: number;
  unitPriceMinor: number;
}>): HorizonOrder {
  const subtotalMinor = input.unitPriceMinor * input.quantity;
  const payable = payableSnapshot({ subtotalMinor });
  return {
    day: input.day,
    inventoryAfter: input.inventoryAfter,
    inventoryBefore: input.inventoryBefore,
    otherCustomerCostMinor: payable.taxMinor,
    productIds: [input.productId],
    quantities: [input.quantity],
    shippingMinor: payable.shippingMinor,
    subtotalMinor,
    totalMinor: payable.totalPriceMinor
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
  let nextReplenishmentDay: number | null = null;

  for (const item of items) {
    const quantity = Math.max(1, item.quantity);
    const spp = item.servingsPerPack ?? null;
    const daily = item.servingsPerDay > 0 ? item.servingsPerDay : 1;
    const before = 0;
    const after = spp != null ? spp * quantity : quantity;
    orders.push(
      orderFor({
        day: 0,
        inventoryAfter: after,
        inventoryBefore: before,
        productId: item.productId,
        quantity,
        unitPriceMinor: item.unitPriceMinor
      })
    );
    const depletion = spp != null && daily > 0 ? (spp * quantity) / daily : null;
    if (depletion != null) {
      nextReplenishmentDay =
        nextReplenishmentDay == null ? depletion : Math.min(nextReplenishmentDay, depletion);
    }
    if (depletion != null && depletion < 90) {
      const remaining = 90 - depletion;
      const restock = packsForDays(spp, remaining, daily);
      if (restock != null) {
        orders.push(
          orderFor({
            day: depletion,
            inventoryAfter: restock * (spp ?? 1),
            inventoryBefore: 0,
            productId: item.productId,
            quantity: restock,
            unitPriceMinor: item.unitPriceMinor
          })
        );
      }
    }
  }

  for (const current of input.state.currentSupplements) {
    if (current.daysRemaining == null) {
      continue;
    }
    const covers = input.state.targets.some(
      (target) => target.supplementId === current.supplementId && current.dailyAmount >= target.amount
    );
    if (!covers && items.length > 0) {
      continue;
    }
    nextReplenishmentDay =
      nextReplenishmentDay == null
        ? current.daysRemaining
        : Math.min(nextReplenishmentDay, current.daysRemaining);
    if (current.daysRemaining >= 90) {
      continue;
    }
    const product = productForCurrent(input.snapshot, current);
    if (!product) {
      continue;
    }
    const spp = servingsPerPackFromProduct(product);
    const remainingDays = 90 - current.daysRemaining;
    const quantity = packsForDays(spp, remainingDays, 1);
    if (quantity == null) {
      continue;
    }
    orders.push(
      orderFor({
        day: current.daysRemaining,
        inventoryAfter: quantity * (spp ?? 1),
        inventoryBefore: 0,
        productId: product.productId,
        quantity,
        unitPriceMinor: product.unitPriceMinor
      })
    );
  }

  const purchaseRequiredNow = items.length > 0;
  return {
    nextReplenishmentDay,
    orders: consolidateOrders(orders),
    purchaseRequiredNow,
    reasonCode: purchaseRequiredNow
      ? "purchase_now"
      : nextReplenishmentDay != null
        ? "current_inventory_covers_now"
        : null,
    snapshotId: catalogueSnapshotId(input.snapshot)
  };
}
