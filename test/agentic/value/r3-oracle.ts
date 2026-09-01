import { asRecord } from "./impl-evidence.ts";

export type LedgerEvent = Readonly<{
  day: number;
  inventoryAfter: number;
  inventoryBefore: number;
  lines: readonly Readonly<{
    lineTotalMinor: number;
    productId: string;
    quantity: number;
    unitPriceMinor: number;
  }>[];
  nextReplenishmentDay: number | null;
  otherCustomerCostMinor: number;
  shippingMinor: number;
  shippingRuleId: string;
  shippingRuleVersion: string;
  subtotalMinor: number;
  totalMinor: number;
  type: "immediate" | "replenishment";
}>;

export function scheduleOf(plan: Record<string, unknown>, horizon = 90) {
  const schedule = asRecord(plan.orderSchedule);
  const bucket = schedule[String(horizon)];
  const rows = Array.isArray(bucket)
    ? bucket.map(asRecord)
    : Array.isArray(plan.orderSchedule)
      ? (plan.orderSchedule as unknown[]).map(asRecord)
      : [];
  return rows.filter((row) => Number(row.day) < horizon);
}

export function eventLines(event: Record<string, unknown>) {
  if (Array.isArray(event.lines)) {
    return event.lines.map(asRecord);
  }
  const ids = Array.isArray(event.productIds) ? event.productIds.map(String) : [];
  const quantities = Array.isArray(event.quantities) ? event.quantities.map(Number) : [];
  return ids.map((productId, index) => ({
    lineTotalMinor: null,
    productId,
    quantity: quantities[index] ?? 1,
    unitPriceMinor: null
  }));
}

export function eventReconciles(event: Record<string, unknown>) {
  const lines = eventLines(event);
  if (lines.length < 1) {
    return false;
  }
  const lineOk = lines.every(
    (line) =>
      Number(line.unitPriceMinor) > 0 &&
      Number(line.quantity) > 0 &&
      Number(line.lineTotalMinor) === Number(line.unitPriceMinor) * Number(line.quantity)
  );
  const subtotal = lines.reduce((sum, line) => sum + Number(line.lineTotalMinor), 0);
  return (
    lineOk &&
    Number(event.subtotalMinor) === subtotal &&
    Number(event.totalMinor) ===
      subtotal + Number(event.shippingMinor ?? 0) + Number(event.otherCustomerCostMinor ?? 0)
  );
}

export function cashFromEvents(events: readonly Record<string, unknown>[]) {
  return events.reduce((sum, event) => sum + Number(event.totalMinor ?? 0), 0);
}

export function significantLedger(plan: Record<string, unknown>) {
  return {
    cash30: plan.cash30DayMinor ?? null,
    cash90: plan.cash90DayMinor ?? null,
    nextReplenishmentDay: plan.nextReplenishmentDay ?? null,
    orders: scheduleOf(plan, 90).map((event) => ({
      day: event.day,
      inventoryAfter: event.inventoryAfter ?? null,
      inventoryBefore: event.inventoryBefore ?? null,
      lines: eventLines(event).map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor ?? null
      })),
      shippingMinor: event.shippingMinor ?? null,
      shippingRuleId: event.shippingRuleId ?? null,
      subtotalMinor: event.subtotalMinor ?? null,
      totalMinor: event.totalMinor ?? null,
      type: event.type ?? null
    })),
    purchaseRequiredNow: plan.purchaseRequiredNow ?? null,
    reasonCode: plan.reasonCode ?? null
  };
}
