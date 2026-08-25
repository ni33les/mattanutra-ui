import { QA_GOLD_CATALOG, qaGoldById } from "@/lib/matcher/qa/gold";
import { qaProduct } from "@/lib/matcher/qa/product";
import type { CatalogSnapshot, MatcherProduct } from "@/lib/matcher/types";

function catalog(
  version: string,
  products: readonly MatcherProduct[]
): CatalogSnapshot {
  return {
    availabilityAsOf: QA_GOLD_CATALOG.availabilityAsOf,
    catalogueVersion: version,
    products
  };
}

function must(id: string) {
  const found = qaGoldById(id);

  if (!found) {
    throw new Error(`QA-GOLD missing ${id}`);
  }

  return found;
}

export const QA_SPARSE = catalog("QA-SPARSE-v1", [
  must("G-D3-1000"),
  must("G-MAG-100"),
  must("G-INCIDENTAL-C")
]);

export const QA_OVERLAP = catalog("QA-OVERLAP-v1", [
  must("G-BASE-COMBO"),
  must("G-INCIDENTAL-C"),
  must("G-D3-2000"),
  must("G-MAG-200"),
  must("G-B12-250"),
  must("G-C-500"),
  must("G-O3-FISH-1000"),
  must("G-COLLAGEN-5G")
]);

export const QA_UNSAFE_ONLY = catalog("QA-UNSAFE-ONLY-v1", [must("G-HIGH-TRAP")]);

export const QA_IRRELEVANT = catalog("QA-IRRELEVANT-v1", [
  must("G-INCIDENTAL-C"),
  must("G-COLLAGEN-5G"),
  must("G-COQ10-100")
]);

export const QA_CORRUPT = catalog("QA-CORRUPT-v1", [
  qaProduct({
    facts: [{ amount: 2000, key: "d3" }],
    id: "G-CORRUPT-NO-UNIT",
    priceThb: 10,
    unknownSafetyAmount: true
  }),
  qaProduct({
    facts: [{ amount: 2000, key: "d3" }],
    id: "G-CORRUPT-INCOMPLETE",
    incompleteCommercialFacts: true,
    priceThb: 10
  }),
  {
    ...must("G-D3-2000"),
    productId: "G-CORRUPT-DUP-D3",
    retailerSku: "G-D3-2000"
  }
]);

export const QA_BOUNDARY = catalog("QA-BOUNDARY-v1", [
  must("G-D3-2000"),
  must("G-O3-FISH-1000"),
  must("G-O3-ALGAE-500"),
  must("G-PRECARE"),
  must("G-FOREIGN-D3"),
  must("G-OOS-D3-2000"),
  must("G-COLLAGEN-5G"),
  must("G-CREATINE-5G")
]);

export const QA_IMPOSSIBLE = catalog("QA-IMPOSSIBLE-v1", [
  must("G-HIGH-TRAP"),
  must("G-OOS-D3-2000"),
  must("G-FOREIGN-D3")
]);

export function qaLargeNoisy(copies = 36): CatalogSnapshot {
  const extra: MatcherProduct[] = [];

  for (let index = 0; index < copies; index += 1) {
    extra.push({
      ...must("G-D3-1000"),
      productId: `G-NOISE-D3-${String(index).padStart(2, "0")}`,
      retailerSku: `G-NOISE-D3-${index}`,
      unitPriceMinor: 20000 + index
    });
  }

  return catalog("QA-LARGE-NOISY-v1", [...QA_GOLD_CATALOG.products, ...extra]);
}
