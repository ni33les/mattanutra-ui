export type CheckoutAddress = Readonly<{
  addressLine1: string;
  addressLine2?: string;
  city: string;
  country: string;
  customerEmail: string;
  customerName: string;
  phone: string;
  postalCode: string;
  province: string;
}>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseCheckoutAddress(
  value: unknown,
  plannedCountry: string
): { address: CheckoutAddress } | { error: string } {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const address: CheckoutAddress = {
    addressLine1: text(record.addressLine1),
    addressLine2: text(record.addressLine2) || undefined,
    city: text(record.city),
    country: text(record.country).toUpperCase(),
    customerEmail: text(record.customerEmail),
    customerName: text(record.customerName),
    phone: text(record.phone),
    postalCode: text(record.postalCode),
    province: text(record.province)
  };

  if (address.country !== plannedCountry.toUpperCase()) {
    return { error: "Delivery country must match the planned destination." };
  }

  if (!address.customerName || !address.phone || !address.customerEmail) {
    return { error: "Name, phone and email are required." };
  }

  if (!EMAIL.test(address.customerEmail)) {
    return { error: "Enter a valid email address." };
  }

  if (!address.addressLine1 || !address.city || !address.province || !address.postalCode) {
    return { error: "A complete Thailand delivery address is required." };
  }

  return { address };
}
