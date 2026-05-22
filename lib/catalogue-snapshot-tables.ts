export type CatalogueSnapshotTable = Readonly<{
  description: string;
  name: string;
  requiredForReload: boolean;
}>;

export const CATALOGUE_SNAPSHOT_TABLES: readonly CatalogueSnapshotTable[] = [
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
    description: "Append-only supplement identity/status versions.",
    name: "supplement_versions",
    requiredForReload: true
  },
  {
    description: "Supplement admin decision/audit records.",
    name: "supplement_admin_audit",
    requiredForReload: false
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
    description: "Product admin decision/audit records.",
    name: "product_admin_audit",
    requiredForReload: false
  }
] as const;

export const CATALOGUE_RELOAD_ORDER = [
  "supplements",
  "supplement_aliases",
  "supplement_safety_limits",
  "supplement_versions",
  "supplement_admin_audit",
  "product_brands",
  "product_brand_countries",
  "products",
  "product_countries",
  "product_facts",
  "product_versions",
  "product_offers",
  "product_import_runs",
  "product_imports",
  "product_admin_audit"
] as const;

export const CATALOGUE_TRUNCATE_ORDER = [
  "product_admin_audit",
  "product_imports",
  "product_import_runs",
  "product_offers",
  "product_versions",
  "product_facts",
  "product_countries",
  "products",
  "product_brand_countries",
  "product_brands",
  "supplement_admin_audit",
  "supplement_versions",
  "supplement_safety_limits",
  "supplement_aliases",
  "supplements"
] as const;

export function catalogueSnapshotTableNames() {
  return CATALOGUE_SNAPSHOT_TABLES.map((table) => table.name);
}
