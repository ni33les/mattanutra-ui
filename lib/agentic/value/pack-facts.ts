import type { CatalogueProduct } from "@/lib/agentic/catalogue/types";

const PACK_COUNT_PATTERN =
  /(?:per|x)\s*(\d{2,4})\s*(?:cap|caps|capsule|capsules|softgel|softgels|tablet|tablets|sachet|sachets|serving|servings)\b|\b(\d{2,4})\s*(?:cap|caps|capsule|capsules|softgel|softgels|tablet|tablets|sachet|sachets|serving|servings)\s*(?:per|\/)\s*(?:bottle|pack|container|tub)\b/i;

export function servingsPerPackFromProduct(product: CatalogueProduct): number | null {
  for (const fact of product.candidate.facts) {
    const label = fact.servingLabel?.trim();

    if (!label) {
      continue;
    }

    const match = label.match(PACK_COUNT_PATTERN);

    if (!match) {
      continue;
    }

    const count = Number(match[1] || match[2]);

    if (Number.isInteger(count) && count > 12 && count <= 1000) {
      return count;
    }
  }

  return null;
}

export function actualDaysSupplied(input: Readonly<{
  dailyServings: number;
  purchasedQuantity: number;
  servingsPerPack: number | null;
}>) {
  if (
    input.servingsPerPack == null ||
    input.servingsPerPack <= 0 ||
    input.dailyServings <= 0 ||
    input.purchasedQuantity <= 0
  ) {
    return null;
  }

  return (input.servingsPerPack * input.purchasedQuantity) / input.dailyServings;
}
