export type CatalogueRolloutEnvironment = "dev" | "prd" | "uat";

export function databaseNameFromUrl(connection: string | null | undefined) {
  if (!connection) {
    return "";
  }

  try {
    return new URL(connection).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

export function connectionLabel(connection: string | null | undefined) {
  if (!connection) {
    return "";
  }

  try {
    const url = new URL(connection);
    return `${url.hostname}${url.pathname}`.toLowerCase();
  } catch {
    return connection.toLowerCase();
  }
}

function withDatabaseName(connection: string, database: string) {
  const url = new URL(connection);
  url.pathname = `/${database}`;
  url.searchParams.set("sslmode", "require");
  return url.toString();
}

export function derivePrdCatalogueSourceUrl(connection: string | null | undefined) {
  if (!connection) {
    return null;
  }

  const database = databaseNameFromUrl(connection);

  if (/mn-pool-prd|mattanutra-prd/i.test(database)) {
    return connection;
  }

  if (/^mn-dev$/i.test(database) || /mattanutra-dev/i.test(database)) {
    return withDatabaseName(connection, "mn-pool-prd");
  }

  return null;
}

export function deriveUatCatalogueTargetUrl(connection: string | null | undefined) {
  if (!connection) {
    return null;
  }

  const database = databaseNameFromUrl(connection);

  if (/uat/i.test(database)) {
    return connection;
  }

  if (/^mn-dev$/i.test(database)) {
    return withDatabaseName(connection, "mn-uat");
  }

  if (/mattanutra-dev/i.test(database)) {
    return withDatabaseName(
      connection,
      database.replace(/mattanutra-dev/gi, "mattanutra-uat")
    );
  }

  return withDatabaseName(connection, "mn-uat");
}

export function isUatCatalogueDatabase(connection: string | null | undefined) {
  const label = connectionLabel(connection);
  return Boolean(label) && /(uat|mn-uat|mattanutra-uat)/i.test(label) && !/(prd|prod|production)/i.test(label);
}

export function isPrdCatalogueDatabase(connection: string | null | undefined) {
  const label = connectionLabel(connection);
  return Boolean(label) && /(mn-pool-prd|mattanutra-prd|[-_/]prd)/i.test(label);
}

export function assertUatCatalogueDatabase(
  connection: string | null | undefined,
  label = "UAT_DB_URL"
) {
  if (!connection) {
    throw new Error(`${label} is required for UAT catalogue sync.`);
  }

  if (!isUatCatalogueDatabase(connection)) {
    throw new Error(
      `Refusing UAT catalogue write against unexpected database "${databaseNameFromUrl(connection)}".`
    );
  }
}

export function assertPrdCatalogueDatabase(
  connection: string | null | undefined,
  label = "PRD_DB_URL"
) {
  if (!connection) {
    throw new Error(`${label} is required for PRD catalogue snapshot.`);
  }

  if (!isPrdCatalogueDatabase(connection)) {
    throw new Error(
      `Refusing PRD catalogue read against unexpected database "${databaseNameFromUrl(connection)}".`
    );
  }
}

export const T10_PRD_RETAIL_SOURCE = {
  identity: "organisation_id + product_id",
  organisationSlugs: ["delight-pharmacy"] as const,
  productStatus: "approved",
  query:
    "retail_sellable_products JOIN organisations (slug = 'delight-pharmacy') JOIN products (status = 'approved') WHERE sellable.status <> 'deleted'",
  sellableStatus: "not deleted"
} as const;

export const T10_CATALOGUE_GROUPS = {
  food: [
    "foods",
    "food_aliases",
    "food_nutrient_profiles",
    "food_safety_rules",
    "food_serving_sizes",
    "food_translations"
  ],
  supplement: [
    "nutrients",
    "supplements",
    "supplement_aliases",
    "supplement_safety_limits",
    "supplement_safety_limit_bands",
    "supplement_translations",
    "supplement_versions",
    "supplement_country_availability"
  ],
  "platform-product": [
    "product_brands",
    "product_brand_countries",
    "products",
    "product_countries",
    "product_identifiers",
    "product_identifier_candidates",
    "product_regulatory_approvals",
    "product_translations",
    "product_facts",
    "product_versions",
    "product_import_runs",
    "product_imports",
    "product_import_translations"
  ],
  "retail-product": ["retail_sellable_products", "retail_product_stock"]
} as const;
