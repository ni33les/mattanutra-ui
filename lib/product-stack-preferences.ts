import type { ProductStackPreference } from "@/lib/product-recommendation-types";

export type ProductStackVariantConfig = Readonly<{
  maxProducts: number | null;
  stackPreference: ProductStackPreference;
}>;

export const PRODUCT_STACK_VARIANT_CONFIGS: readonly ProductStackVariantConfig[] = [
  {
    maxProducts: null,
    stackPreference: "compact"
  },
  {
    maxProducts: null,
    stackPreference: "balanced"
  }
];

export function normalizeProductStackPreference(
  value: unknown
): ProductStackPreference {
  return value === "compact" || value === "balanced"
    ? value
    : "balanced";
}
