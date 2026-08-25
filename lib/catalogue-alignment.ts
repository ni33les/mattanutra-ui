import { createHash } from "node:crypto";

export type CatalogueAlignmentTable = Readonly<{
  idColumn: string;
  name: string;
  root?: boolean;
  triggerName?: string;
}>;

export const PLATFORM_CATALOGUE_ALIGNMENT_TABLES: readonly CatalogueAlignmentTable[] = [
  { idColumn: "id", name: "nutrients", root: true },
  { idColumn: "id", name: "supplements", root: true },
  { idColumn: "id", name: "supplement_aliases" },
  { idColumn: "supplement_id", name: "supplement_safety_limits", triggerName: "supplement_safety_limits_no_update_delete" },
  { idColumn: "supplement_id", name: "supplement_safety_limit_bands" },
  { idColumn: "supplement_id", name: "supplement_translations" },
  { idColumn: "supplement_id", name: "supplement_versions", triggerName: "supplement_versions_no_update_delete" },
  { idColumn: "supplement_id", name: "supplement_country_availability" },
  { idColumn: "id", name: "product_brands", root: true },
  { idColumn: "brand_id", name: "product_brand_countries" },
  { idColumn: "id", name: "products", root: true },
  { idColumn: "product_id", name: "product_countries" },
  { idColumn: "product_id", name: "product_identifiers" },
  { idColumn: "product_id", name: "product_identifier_candidates" },
  { idColumn: "product_id", name: "product_regulatory_approvals" },
  { idColumn: "product_id", name: "product_translations" },
  { idColumn: "product_id", name: "product_facts" },
  { idColumn: "product_id", name: "product_versions", triggerName: "product_versions_no_update_delete" },
  { idColumn: "id", name: "product_import_runs", root: true },
  { idColumn: "id", name: "product_imports", root: true },
  { idColumn: "import_id", name: "product_import_translations" },
  { idColumn: "id", name: "foods", root: true },
  { idColumn: "food_id", name: "food_aliases" },
  { idColumn: "food_id", name: "food_nutrient_profiles" },
  { idColumn: "food_id", name: "food_safety_rules" },
  { idColumn: "food_id", name: "food_serving_sizes" },
  { idColumn: "food_id", name: "food_translations" }
] as const;

export const PLATFORM_CATALOGUE_INSERT_ORDER = [
  "nutrients",
  "supplements",
  "product_brands",
  "product_import_runs",
  "foods",
  "products",
  "product_imports",
  "supplement_aliases",
  "supplement_safety_limits",
  "supplement_safety_limit_bands",
  "supplement_translations",
  "supplement_versions",
  "supplement_country_availability",
  "product_brand_countries",
  "food_aliases",
  "food_nutrient_profiles",
  "food_safety_rules",
  "food_serving_sizes",
  "food_translations",
  "product_countries",
  "product_identifiers",
  "product_identifier_candidates",
  "product_regulatory_approvals",
  "product_translations",
  "product_facts",
  "product_versions",
  "product_import_translations"
] as const;

export const PLATFORM_CATALOGUE_DELETE_ORDER = [
  "product_import_translations",
  "product_versions",
  "product_facts",
  "product_translations",
  "product_regulatory_approvals",
  "product_identifier_candidates",
  "product_identifiers",
  "product_countries",
  "food_translations",
  "food_serving_sizes",
  "food_safety_rules",
  "food_nutrient_profiles",
  "food_aliases",
  "product_brand_countries",
  "supplement_country_availability",
  "supplement_versions",
  "supplement_translations",
  "supplement_safety_limits",
  "supplement_safety_limit_bands",
  "supplement_aliases",
  "product_imports",
  "products",
  "foods",
  "product_import_runs",
  "product_brands",
  "supplements",
  "nutrients"
] as const;

export const PLATFORM_CATALOGUE_ROOT_TABLES = PLATFORM_CATALOGUE_ALIGNMENT_TABLES
  .filter((table) => table.root)
  .map((table) => table.name);

export const PLATFORM_CATALOGUE_REQUIRED_NON_EMPTY_TABLES = [
  "supplements",
  "products",
  "foods"
] as const;

export const PLATFORM_CATALOGUE_TRIGGER_TABLES = PLATFORM_CATALOGUE_ALIGNMENT_TABLES
  .filter((table) => table.triggerName)
  .map((table) => ({
    name: table.name,
    triggerName: table.triggerName!
  }));

export const PRODUCT_STALE_ALLOWED_CLEANUP_TABLES = [
  "retail_stock_reorder_advice",
  "retail_shopping_list_lines",
  "product_recommendation_decisions",
  "product_recommendation_items",
  "retail_sellable_products",
  "retail_product_stock"
] as const;

export const PRODUCT_STALE_BLOCKER_TABLES = [
  "retail_customer_order_lines",
  "retail_order_allocations",
  "retail_product_stock_snapshots",
  "retail_stock_lots",
  "retail_stock_movements"
] as const;

export const RETAIL_CATALOGUE_TABLES = [
  "retail_sellable_products",
  "retail_product_stock"
] as const;

export const RETAIL_CATALOGUE_ORG_SLUGS = [
  "delight-pharmacy",
  "enchanted-pharmacy"
] as const;

export const RETAIL_CATALOGUE_IDENTITY_COLUMNS = [
  "id",
  "organisation_id",
  "product_id",
  "created_at"
] as const;

export const RETAIL_STOCK_LIVE_COLUMNS = [
  "stock_quantity"
] as const;

export const PRD_CATALOGUE_ROLLOUT_PROTECTED_ALLOWLIST = [
  "product_recommendation_decisions",
  "product_recommendation_items",
  "retail_sellable_products",
  "retail_product_stock"
] as const;

export function quoteCatalogueAlignmentIdentifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }

  return `"${value.replaceAll('"', '""')}"`;
}

export function stableCatalogueJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableCatalogueJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableCatalogueJson(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function catalogueRowsHash(rows: readonly Record<string, unknown>[]) {
  const normalized = rows
    .map((row) => stableCatalogueJson(row))
    .sort()
    .join("\n");

  return createHash("sha256").update(normalized).digest("hex");
}
