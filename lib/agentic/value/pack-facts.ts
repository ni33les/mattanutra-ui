import type { CatalogueProduct } from "@/lib/agentic/catalogue/types";

const PACK_COUNT_PATTERN =
  /(?:per|x)\s*(\d{2,4})\s*(?:cap|caps|capsule|capsules|softgel|softgels|tablet|tablets|sachet|sachets|serving|servings)\b|\b(\d{2,4})\s*(?:cap|caps|capsule|capsules|softgel|softgels|tablet|tablets|sachet|sachets|serving|servings)\s*(?:per|\/)\s*(?:bottle|pack|container|tub)\b/i;
const TITLE_PACK_PATTERN = /(?:^|\s)(\d{2,4})\s*'[SsCc]\b/;

export type PackFactNames =
  | "servingsPerPack"
  | "unitsPerServing"
  | "servingSize"
  | "unitPriceMinor";

export type ProductPackFacts = Readonly<{
  complete: boolean;
  missingFactNames: readonly PackFactNames[];
  servingsPerPack: number | null;
  servingSize: Readonly<{ amount: number; unit: string }> | null;
  unitsPerServing: number | null;
}>;

function countFromText(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) {
    return null;
  }
  const labelled = text.match(PACK_COUNT_PATTERN);
  if (labelled) {
    const count = Number(labelled[1] || labelled[2]);
    if (Number.isInteger(count) && count > 12 && count <= 1000) {
      return count;
    }
  }
  const titled = text.match(TITLE_PACK_PATTERN);
  if (titled) {
    const count = Number(titled[1]);
    if (Number.isInteger(count) && count >= 20 && count <= 400) {
      return count;
    }
  }
  return null;
}

export function servingsPerPackFromProduct(product: CatalogueProduct): number | null {
  const fromTitle = countFromText(product.candidate.title);
  if (fromTitle != null) {
    return fromTitle;
  }
  for (const fact of product.candidate.facts) {
    const count = countFromText(fact.servingLabel);
    if (count != null) {
      return count;
    }
  }
  return null;
}

export function packFactsFromProduct(product: CatalogueProduct): ProductPackFacts {
  const servingsPerPack = servingsPerPackFromProduct(product);
  const unitsPerServing =
    Number.isFinite(product.dailyPills) && product.dailyPills > 0 ? product.dailyPills : null;
  const serving = product.candidate.facts.find(
    (item) => item.amount != null && item.unit && item.supplementId
  );
  const servingSize =
    serving && serving.amount != null && serving.unit
      ? { amount: serving.amount, unit: serving.unit }
      : null;
  const missing: PackFactNames[] = [];
  if (servingsPerPack == null || servingsPerPack <= 0) {
    missing.push("servingsPerPack");
  }
  if (unitsPerServing == null) {
    missing.push("unitsPerServing");
  }
  if (!servingSize) {
    missing.push("servingSize");
  }
  if (!(product.unitPriceMinor > 0)) {
    missing.push("unitPriceMinor");
  }
  return {
    complete: missing.length === 0,
    missingFactNames: missing,
    servingsPerPack,
    servingSize,
    unitsPerServing
  };
}

export function cataloguePackValidation(product: CatalogueProduct) {
  const facts = packFactsFromProduct(product);
  return {
    complete: facts.complete,
    incompleteCommercialFacts: !facts.complete,
    missingFactNames: facts.missingFactNames,
    productId: product.productId
  };
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
