import type {
  RetailCustomerOrderStatus,
  RetailShoppingListStatus,
  RetailStockLotStatus,
  RetailStockMovementType,
  RetailStockStatus,
  RetailTaskPriorityBand
} from "@/lib/admin-retail-stock";
import type { BackorderPolicy } from "@/lib/retail-cart-availability";

export function normalizeCurrency(
  value: string | null | undefined,
  type: string
) {
  const currency = value?.trim().toUpperCase() ?? "";

  return /^[A-Z]{3}$/.test(currency)
    ? currency
    : type === "platform"
      ? "USD"
      : "THB";
}

export function stockStatus(value: unknown): RetailStockStatus {
  return value === "disabled" || value === "deleted" ? value : "active";
}

export function stockBackorderPolicy(value: unknown): BackorderPolicy {
  return value === "deny" ? "deny" : "allow";
}

export function lotStatus(value: unknown): RetailStockLotStatus {
  return value === "depleted" || value === "disabled" || value === "deleted"
    ? value
    : "active";
}

export function movementType(value: unknown): RetailStockMovementType {
  return value === "sale" ||
    value === "adjustment" ||
    value === "void" ||
    value === "return" ||
    value === "transfer_in" ||
    value === "transfer_out" ||
    value === "expiry_write_off"
    ? value
    : "receive";
}

export function movementDelta(
  type: Exclude<RetailStockMovementType, "void">,
  quantity: number
) {
  const rounded = Math.round(quantity);

  if (!Number.isFinite(rounded) || rounded === 0) {
    throw new Error("Movement quantity is required");
  }

  if (type === "adjustment") {
    return rounded;
  }

  const absolute = Math.abs(rounded);

  return type === "sale" ||
    type === "transfer_out" ||
    type === "expiry_write_off"
    ? -absolute
    : absolute;
}

export function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function integerOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

export function numberMetadata(value: unknown, fallback = 0) {
  const number = numberOrNull(value);

  return number === null ? fallback : number;
}

export function stringMetadata(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isoDateOrNull(value: unknown) {
  if (!value) {
    return null;
  }

  const date = new Date(String(value));

  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

export function isoDateTime(value: Date | string) {
  return new Date(value).toISOString();
}

export function isoDateTimeOrNull(value: Date | string | null) {
  return value ? isoDateTime(value) : null;
}

export function shoppingListStatus(value: unknown): RetailShoppingListStatus {
  return value === "closed" ? "closed" : "active";
}

export function customerOrderStatus(value: unknown): RetailCustomerOrderStatus {
  return value === "allocated" ||
    value === "awaiting_stock" ||
    value === "cancelled" ||
    value === "delivered" ||
    value === "packed" ||
    value === "picking" ||
    value === "placed" ||
    value === "returned" ||
    value === "shipped"
    ? value
    : "draft";
}

export function customerOrderSource(value: unknown): "checkout" | "manual" {
  return value === "checkout" ? "checkout" : "manual";
}

export function priorityBand(score: number): RetailTaskPriorityBand {
  if (score >= 700) {
    return "urgent";
  }

  if (score >= 450) {
    return "high";
  }

  if (score < 180) {
    return "low";
  }

  return "normal";
}

export function orderNumber(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}
