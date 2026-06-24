export const productForms = [
  "capsule",
  "tablet",
  "softgel",
  "pill",
  "powder",
  "gummy",
  "liquid",
  "sachet",
  "spray",
  "drop",
  "lozenge",
  "bar",
  "food",
  "unknown"
] as const;

export type ProductForm = (typeof productForms)[number];

const productFormSet = new Set<ProductForm>(productForms);

const productFormAliases: Record<string, ProductForm> = {
  bars: "bar",
  cap: "capsule",
  caps: "capsule",
  capsule: "capsule",
  capsules: "capsule",
  drops: "drop",
  foods: "food",
  gummies: "gummy",
  gummy: "gummy",
  liquids: "liquid",
  lozenges: "lozenge",
  pills: "pill",
  powders: "powder",
  sachets: "sachet",
  soft_gel: "softgel",
  soft_gels: "softgel",
  softgel: "softgel",
  softgels: "softgel",
  sprays: "spray",
  tabs: "tablet",
  tablet: "tablet",
  tablets: "tablet"
};

const productFormPatterns: Array<readonly [ProductForm, RegExp]> = [
  ["softgel", /\bsoft\s*-?\s*gels?\b|\bsoftgels?\b|ซอฟท์เจล|ซอฟต์เจล/i],
  ["capsule", /\bcapsules?\b|\bcaps\b|\bcaps?\.\b|แคปซูล/i],
  ["tablet", /\btablets?\b|\btabs?\b|เม็ด/i],
  ["powder", /\bpowders?\b|ผง/i],
  ["gummy", /\bgumm(?:y|ies)\b/i],
  ["sachet", /\bsachets?\b|\bsticks?\b|ซอง/i],
  ["spray", /\bsprays?\b|สเปรย์/i],
  ["drop", /\bdrops?\b|\bdroppers?\b/i],
  ["lozenge", /\blozenges?\b|\bpastilles?\b/i],
  ["bar", /\bbars?\b/i],
  ["liquid", /\bliquids?\b|\bsolution\b|\bsyrup\b|\bdrink\b|\bbeverage\b|น้ำ/i],
  ["food", /\bfoods?\b|\bsnacks?\b|\bgranola\b|\bcereal\b/i],
  ["pill", /\bpills?\b/i]
];

export function isProductForm(value: string): value is ProductForm {
  return productFormSet.has(value as ProductForm);
}

function normalizedProductFormKey(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
}

export function normalizeProductForm(value: unknown): ProductForm | null {
  const normalized = normalizedProductFormKey(value);

  if (!normalized) {
    return null;
  }

  if (isProductForm(normalized)) {
    return normalized;
  }

  return productFormAliases[normalized] ?? null;
}

function textPartsFromUnknown(value: unknown, depth = 0): string[] {
  if (depth > 3) {
    return [];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => textPartsFromUnknown(item, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      textPartsFromUnknown(item, depth + 1)
    );
  }

  return [];
}

export function inferProductFormFromTextParts(
  parts: readonly unknown[],
  options: Readonly<{ productKind?: string | null }> = {}
): ProductForm {
  for (const part of parts) {
    const exactForm = normalizeProductForm(part);

    if (exactForm && exactForm !== "unknown") {
      return exactForm;
    }
  }

  const text = parts
    .flatMap((part) => textPartsFromUnknown(part))
    .join(" ")
    .toLowerCase();

  for (const [form, pattern] of productFormPatterns) {
    if (pattern.test(text)) {
      return form;
    }
  }

  return options.productKind === "food" ? "food" : "unknown";
}
