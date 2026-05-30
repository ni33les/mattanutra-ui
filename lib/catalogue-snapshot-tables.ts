export type CatalogueSnapshotTable = Readonly<{
  description: string;
  name: string;
  requiredForReload: boolean;
}>;

export const CONTENT_MASTER_STATUSES = ["published", "draft", "review"] as const;

export const CATALOGUE_SNAPSHOT_TABLES: readonly CatalogueSnapshotTable[] = [
  {
    description: "Publish-gated locale registry used by localized catalogue copy.",
    name: "site_locales",
    requiredForReload: true
  },
  {
    description: "Platform finance account master rows required by cost ledgers.",
    name: "finance_accounts",
    requiredForReload: true
  },
  {
    description: "Nutrient vocabulary used by product facts and managed food profiles.",
    name: "nutrients",
    requiredForReload: true
  },
  {
    description: "Canonical supplement projection rows.",
    name: "supplements",
    requiredForReload: true
  },
  {
    description: "Canonical supplement aliases used by imports and matching.",
    name: "supplement_aliases",
    requiredForReload: true
  },
  {
    description: "Append-only safety limits and latest dose ceilings.",
    name: "supplement_safety_limits",
    requiredForReload: true
  },
  {
    description: "Locale-scalable supplement display copy and aliases.",
    name: "supplement_translations",
    requiredForReload: true
  },
  {
    description: "Append-only supplement identity/status versions.",
    name: "supplement_versions",
    requiredForReload: true
  },
  {
    description: "Manufacturer/brand projection rows.",
    name: "product_brands",
    requiredForReload: true
  },
  {
    description: "Brand country availability gates.",
    name: "product_brand_countries",
    requiredForReload: true
  },
  {
    description: "Canonical sellable product projection rows.",
    name: "products",
    requiredForReload: true
  },
  {
    description: "Product country availability gates.",
    name: "product_countries",
    requiredForReload: true
  },
  {
    description: "Locale-scalable product title and description rows.",
    name: "product_translations",
    requiredForReload: true
  },
  {
    description: "Canonical matchable product facts.",
    name: "product_facts",
    requiredForReload: true
  },
  {
    description: "Append-only product versions, including facts and evidence snapshots.",
    name: "product_versions",
    requiredForReload: true
  },
  {
    description: "Direct and affiliate product links.",
    name: "product_offers",
    requiredForReload: true
  },
  {
    description: "Manufacturer import batch records.",
    name: "product_import_runs",
    requiredForReload: true
  },
  {
    description: "Manufacturer import evidence and review state.",
    name: "product_imports",
    requiredForReload: true
  },
  {
    description: "Locale-scalable import title and description rows.",
    name: "product_import_translations",
    requiredForReload: true
  },
  {
    description: "Managed food projection rows used by deterministic food gap support.",
    name: "foods",
    requiredForReload: true
  },
  {
    description: "Managed food aliases used by review and matching support.",
    name: "food_aliases",
    requiredForReload: true
  },
  {
    description: "Managed food nutrient profiles used for food support eligibility.",
    name: "food_nutrient_profiles",
    requiredForReload: true
  },
  {
    description: "Managed food safety rules and allergy/condition exclusions.",
    name: "food_safety_rules",
    requiredForReload: true
  },
  {
    description: "Managed food serving sizes.",
    name: "food_serving_sizes",
    requiredForReload: true
  },
  {
    description: "Locale-scalable managed food display copy and image alt text.",
    name: "food_translations",
    requiredForReload: true
  },
  {
    description: "Public and admin-editable testimonials, excluding archived rows.",
    name: "testimonials",
    requiredForReload: true
  },
  {
    description: "Public and admin-editable blog posts, excluding archived rows.",
    name: "blog_posts",
    requiredForReload: true
  }
] as const;

export const CATALOGUE_RELOAD_ORDER = [
  "site_locales",
  "finance_accounts",
  "nutrients",
  "supplements",
  "supplement_aliases",
  "supplement_safety_limits",
  "supplement_translations",
  "supplement_versions",
  "product_brands",
  "product_brand_countries",
  "products",
  "product_countries",
  "product_translations",
  "product_facts",
  "product_versions",
  "product_offers",
  "product_import_runs",
  "product_imports",
  "product_import_translations",
  "foods",
  "food_aliases",
  "food_nutrient_profiles",
  "food_safety_rules",
  "food_serving_sizes",
  "food_translations",
  "testimonials",
  "blog_posts"
] as const;

export const CATALOGUE_TRUNCATE_ORDER = [
  "blog_posts",
  "testimonials",
  "food_translations",
  "food_serving_sizes",
  "food_safety_rules",
  "food_nutrient_profiles",
  "food_aliases",
  "foods",
  "product_import_translations",
  "product_imports",
  "product_import_runs",
  "product_offers",
  "product_versions",
  "product_facts",
  "product_countries",
  "product_translations",
  "products",
  "product_brand_countries",
  "product_brands",
  "supplement_versions",
  "supplement_translations",
  "supplement_safety_limits",
  "supplement_aliases",
  "supplements",
  "nutrients",
  "finance_accounts",
  "site_locales"
] as const;

export function catalogueSnapshotTableNames() {
  return CATALOGUE_SNAPSHOT_TABLES.map((table) => table.name);
}

export function isContentMasterTable(tableName: string) {
  return tableName === "blog_posts" || tableName === "testimonials";
}

export function catalogueSnapshotWhereClause(tableName: string) {
  return isContentMasterTable(tableName)
    ? `where status in (${CONTENT_MASTER_STATUSES.map((status) => `'${status}'`).join(", ")})`
    : "";
}

export function quoteCatalogueIdentifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Unsafe catalogue identifier: ${value}`);
  }

  return `"${value.replaceAll("\"", "\"\"")}"`;
}

export function catalogueSnapshotSelectSql(tableName: string) {
  const whereClause = catalogueSnapshotWhereClause(tableName);

  return [
    `select * from public.${quoteCatalogueIdentifier(tableName)}`,
    whereClause
  ].filter(Boolean).join(" ");
}
