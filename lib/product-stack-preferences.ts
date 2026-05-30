import type { ProductStackPreference } from "@/lib/product-recommendation-types";

export type ProductStackVariantConfig = Readonly<{
  maxProducts: number;
  stackPreference: ProductStackPreference;
  targetProducts: number;
}>;

export const PRODUCT_STACK_VARIANT_CONFIGS: readonly ProductStackVariantConfig[] = [
  {
    maxProducts: 3,
    stackPreference: "compact",
    targetProducts: 3
  },
  {
    maxProducts: 6,
    stackPreference: "balanced",
    targetProducts: 3
  }
];

export function normalizeProductStackPreference(
  value: unknown
): ProductStackPreference {
  return value === "compact" || value === "balanced"
    ? value
    : "balanced";
}
