export const TH_MOCK_SHIPPING_MINOR = 5000;
export const TH_MOCK_TAX_MINOR = 0;

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
  const shippingMinor = asMinorOr(input.shippingMinor, TH_MOCK_SHIPPING_MINOR);
  const taxMinor = asMinorOr(input.taxMinor, TH_MOCK_TAX_MINOR);

  return {
    shippingMinor,
    subtotalMinor,
    taxMinor,
    totalPriceMinor: addMinor(subtotalMinor, shippingMinor, taxMinor)
  };
}
