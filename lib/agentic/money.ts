function envMinor(name: string, fallback: number) {
  const raw = process.env[name]?.trim() ?? "";

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

export const DEFAULT_SHIPPING_MINOR = envMinor(
  "AGENTIC_DEFAULT_SHIPPING_MINOR",
  5000
);
export const DEFAULT_TAX_MINOR = envMinor("AGENTIC_DEFAULT_TAX_MINOR", 0);
export const DEFAULT_SHIPPING_RULE_ID = "default_flat_shipping";
export const DEFAULT_SHIPPING_RULE_VERSION = "v1";

export function asMinor(value: unknown): number {
  if (typeof value === "bigint") {
    if (value < BigInt(0)) {
      throw new Error("Invalid minor amount");
    }
    const asNumber = Number(value);
    if (!Number.isSafeInteger(asNumber)) {
      throw new Error("Invalid minor amount");
    }
    return asNumber;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new Error("Invalid minor amount");
    }
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const asNumber = Number(value);
    if (!Number.isFinite(asNumber) || !Number.isInteger(asNumber) || asNumber < 0) {
      throw new Error("Invalid minor amount");
    }
    return asNumber;
  }

  throw new Error("Invalid minor amount");
}

export function asMinorOr(value: unknown, fallback: number): number {
  if (value == null || value === "") {
    return asMinor(fallback);
  }
  return asMinor(value);
}

export function addMinor(...values: number[]): number {
  return values.reduce((sum, value) => sum + asMinor(value), 0);
}

export function formatMinor(
  amount: unknown,
  currency: string,
  locale: string = "en-US"
) {
  return new Intl.NumberFormat(locale, {
    currency,
    style: "currency"
  }).format(asMinor(amount) / 100);
}

export function payableSnapshot(input: Readonly<{
  shippingMinor?: unknown;
  subtotalMinor: unknown;
  taxMinor?: unknown;
}>) {
  const subtotalMinor = asMinor(input.subtotalMinor);
  const shippingMinor = asMinorOr(input.shippingMinor, DEFAULT_SHIPPING_MINOR);
  const taxMinor = asMinorOr(input.taxMinor, DEFAULT_TAX_MINOR);

  return {
    shippingMinor,
    shippingRuleId: DEFAULT_SHIPPING_RULE_ID,
    shippingRuleVersion: DEFAULT_SHIPPING_RULE_VERSION,
    subtotalMinor,
    taxMinor,
    totalPriceMinor: addMinor(subtotalMinor, shippingMinor, taxMinor)
  };
}
