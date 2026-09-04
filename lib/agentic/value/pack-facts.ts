import type { CatalogueProduct } from "@/lib/agentic/catalogue/types";

const PACK_COUNT_PATTERN =
  /(?:per|x)\s*(\d{2,4})\s*(?:cap|caps|capsule|capsules|softgel|softgels|tablet|tablets|sachet|sachets|serving|servings)\b|\b(\d{2,4})\s*(?:cap|caps|capsule|capsules|softgel|softgels|tablet|tablets|sachet|sachets|serving|servings)\s*(?:per|\/)\s*(?:bottle|pack|container|tub)\b/i;
const TITLE_PACK_PATTERN = /(?:^|\s)(\d{2,4})\s*(?:cap|caps|capsule|capsules|softgel|softgels|tablet|tablets|sachet|sachets)\b/i;
const PACK_COUNT_STRIP_PATTERN =
  /(?:;\s*)?(?:per|x)\s*\d{2,4}\s*(?:cap|caps|capsule|capsules|softgel|softgels|tablet|tablets|sachet|sachets|serving|servings)\b|(?:;\s*)?\b\d{2,4}\s*(?:cap|caps|capsule|capsules|softgel|softgels|tablet|tablets|sachet|sachets|serving|servings)\s*(?:per|\/)\s*(?:bottle|pack|container|tub)\b/gi;

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

export function parsePackCountFromText(value: string | null | undefined) {
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

function countFromText(value: string | null | undefined) {
  return parsePackCountFromText(value);
}

export function servingLabelWithPackCount(
  label: string | null | undefined,
  count: number | null
) {
  const stripped = String(label ?? "")
    .replace(PACK_COUNT_STRIP_PATTERN, "")
    .replace(/\s*;\s*;/g, ";")
    .replace(/^[\s;]+|[\s;]+$/g, "")
    .trim();
  if (count == null || !Number.isInteger(count) || count <= 12 || count > 1000) {
    return stripped || null;
  }
  const encoded = `${count} servings per container`;
  return stripped ? `${stripped}; ${encoded}` : encoded;
}

export function packCountFromFacts(
  facts: readonly Readonly<{ servingLabel?: string | null }>[]
) {
  for (const fact of facts) {
    const count = parsePackCountFromText(fact.servingLabel);
    if (count != null) {
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
    productId: product.productId,
    reasonCode: facts.complete ? null : ("catalogue_data_incomplete" as const)
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
