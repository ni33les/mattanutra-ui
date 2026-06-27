import { toJsonValue } from "@/lib/assessment-store";
import {
  createAdminProduct,
  getAdminProductsData,
  loadAdminProductRow,
  updateAdminProduct,
  type AdminProductRow,
} from "@/lib/admin-products";
import { isUuidValue } from "@/lib/admin-product-helpers";
import { getSql } from "@/lib/db";
import {
  isFirstPartyImageUrl,
  normalizeRuntimeImageUrl,
} from "@/lib/first-party-image-rules";
import {
  normalizeCurrencyCode,
  normalizeProductCountryCode,
  type ProductCountryPricing,
} from "@/lib/product-countries";
import {
  normalizeIdentifierValue,
  type ProductIdentifierInput,
} from "@/lib/product-identifiers";
import type { ProductRegulatoryApprovalInput } from "@/lib/product-regulatory-approvals";
import { normalizeLegacyProductTranslationFields } from "@/lib/product-translation-input";
import { normalizeProductKey } from "@/lib/product-recommendations";
import type {
  ProductAudience,
  ProductKind,
  ProductStatus,
} from "@/lib/product-recommendations";
import {
  V9_PRODUCT_MASTER_SCHEMA,
  v9MasterListMetadataFromSourceSnapshot,
  v9MasterListProductFromSourceSnapshot,
} from "@/lib/v9-product-master";

export type ProductCatalogueCsvScope = "platform" | "retail";

export type PlatformProductCatalogueJson = Readonly<{
  generatedAt: string;
  productCount: number;
  products: ReturnType<typeof platformProductCatalogueJsonProductFromRow>[];
  schema: typeof V9_PRODUCT_MASTER_SCHEMA;
  scope: string;
  summary: unknown;
}>;

export type RetailProductCatalogueJson = Readonly<{
  generatedAt: string;
  organisation: {
    countryCode: string | null;
    currency: string;
    id: string;
    name: string;
  };
  productCount: number;
  products: ReturnType<typeof retailProductCatalogueJsonProductFromRow>[];
  schemaVersion: 1;
  scope: "retail";
}>;

type CsvRow = Readonly<{
  columns: Record<string, string>;
  rowNumber: number;
}>;

type ProductMatch = Readonly<{
  ean13: string | null;
  manufacturerSku: string | null;
  normalizedBrandName: string | null;
  normalizedTitle: string | null;
  productId: string;
  upc: string | null;
}>;

type ProductImportSourceImageRow = Readonly<{
  id: string;
  image_urls: string[] | null;
  product_id: string | null;
  raw_snapshot: unknown;
  updated_at: Date | string;
}>;

type RetailProductCatalogueJsonRow = Readonly<{
  backorder_policy: string | null;
  barcode: string | null;
  currency: string | null;
  lead_time_days: string | number | null;
  manufacturer: string | null;
  manufacturer_sku: string | null;
  name: string;
  product_id: string;
  retail_price_amount: string | number | null;
  retail_sellable_product_id: string | null;
  status: string | null;
  stock_id: string | null;
  stock_quantity: string | number | null;
  updated_at: Date | string;
  wholesale_price_amount: string | number | null;
}>;

const TEMPORARY_PLATFORM_EXPORT_PRICE_AMOUNT = 1234;
const TEMPORARY_PLATFORM_EXPORT_PRICE_CURRENCY = "THB";

const PLATFORM_IMPORT_RETAIL_ONLY_COLUMNS = [
  "rrp",
  "master rrp",
  "retail price",
  "retail",
  "wholesale price",
  "wholesale",
  "unit cost",
  "quantity in stock",
  "stock quantity",
  "stock",
  "quantity",
  "backorder demand",
  "backorder policy",
  "backorder",
  "lead time days",
  "lead time",
  "retail status",
  "organisation",
] as const;

export type ProductCatalogueImportResult = {
  createdProducts: number;
  invalidRows: Array<{ reason: string; rowNumber: number }>;
  movementsCreated: number;
  retailRowsUpdated: number;
  rowCount: number;
  updatedProducts: number;
};

export const PRODUCT_CATALOGUE_CSV_HEADERS = [
  "SKU",
  "Brand",
  "Name",
  "English Name",
  "Thai Name",
  "Product URL",
  "Image URL",
  "Product Category",
  "Status",
  "Country",
  "RRP",
  "Currency",
  "FDA Approval",
  "Regulatory Approvals",
  "Manufacturer SKU",
  "Barcode",
  "UPC",
  "Quantity in Stock",
  "Backorder Demand",
  "Backorder Policy",
  "Wholesale Price",
  "Retail Price",
  "Lead Time Days",
  "Retail Status",
  "Organisation",
] as const;

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrDefault(value: unknown, fallback = 0) {
  const parsed = numberOrNull(value);

  return parsed === null ? fallback : Math.max(0, Math.round(parsed));
}

function isoDateTime(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : new Date(value ?? "");

  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function externalImageUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeRuntimeImageUrl(value);

  return normalized && !isFirstPartyImageUrl(normalized) ? normalized : null;
}

function productImportSourceImageUrl(row: ProductImportSourceImageRow) {
  const snapshot = objectRecord(row.raw_snapshot);

  for (const item of arrayValue(snapshot.productImageMirrors)) {
    const originalUrl = externalImageUrl(objectRecord(item).originalUrl);

    if (originalUrl) {
      return originalUrl;
    }
  }

  for (const imageUrl of row.image_urls ?? []) {
    const sourceImageUrl = externalImageUrl(imageUrl);

    if (sourceImageUrl) {
      return sourceImageUrl;
    }
  }

  return null;
}

function temporaryPlatformExportPrice(row: AdminProductRow) {
  const pricedAvailability = row.shopAvailability.find(
    (availability) => numberOrNull(availability.retailPriceAmount) !== null,
  );

  if (!pricedAvailability) {
    return {
      amount: TEMPORARY_PLATFORM_EXPORT_PRICE_AMOUNT,
      currency: TEMPORARY_PLATFORM_EXPORT_PRICE_CURRENCY,
    };
  }

  return {
    amount:
      numberOrNull(pricedAvailability.retailPriceAmount) ??
      TEMPORARY_PLATFORM_EXPORT_PRICE_AMOUNT,
    currency: normalizeCurrencyCode(
      pricedAvailability.currency,
      TEMPORARY_PLATFORM_EXPORT_PRICE_CURRENCY,
    ),
  };
}

function normalizeColumnName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);

  return cells.map((cell) => cell.trim());
}

export function parseProductCatalogueCsv(text: string): CsvRow[] {
  const normalizedText = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = normalizedText.split("\n").filter((line) => line.trim());

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0] ?? "").map(normalizeColumnName);

  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);

    return {
      columns: Object.fromEntries(
        headers.map((header, cellIndex) => [
          header,
          cells[cellIndex]?.trim() ?? "",
        ]),
      ),
      rowNumber: index + 2,
    };
  });
}

function column(row: CsvRow, names: readonly string[]) {
  for (const name of names) {
    const value = row.columns[normalizeColumnName(name)];

    if (value?.trim()) {
      return value.trim();
    }
  }

  return null;
}

function platformImportRetailOnlyColumns(row: CsvRow) {
  return PLATFORM_IMPORT_RETAIL_ONLY_COLUMNS.filter((name) => column(row, [name]));
}

function numberFromColumn(row: CsvRow, names: readonly string[]) {
  const value = column(row, names);

  if (!value) {
    return null;
  }

  const parsed = Number(value.replace(/,/g, ""));

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function integerFromColumn(row: CsvRow, names: readonly string[]) {
  const value = numberFromColumn(row, names);

  return value === null ? null : Math.max(0, Math.round(value));
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);

  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvLine(values: readonly unknown[]) {
  return values.map(csvEscape).join(",");
}

function productKindFromColumn(value: string | null): ProductKind {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  return normalized === "food" ||
    normalized === "multi" ||
    normalized === "other" ||
    normalized === "supplement"
    ? normalized
    : "supplement";
}

function productStatusFromColumn(
  value: string | null,
): ProductStatus | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  return normalized === "approved" ||
    normalized === "ignored" ||
    normalized === "pending_review"
    ? normalized
    : undefined;
}

function productAudienceFromColumn(value: string | null): ProductAudience {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  return normalized === "female" || normalized === "male" ? normalized : "both";
}

function retailStatusFromColumn(value: string | null) {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

  return normalized === "disabled" || normalized === "deleted"
    ? normalized
    : "active";
}

function backorderPolicyFromColumn(value: string | null) {
  const normalized = value?.trim().toLowerCase();

  return normalized === "deny" || normalized === "no" || normalized === "false"
    ? "deny"
    : "allow";
}

function generatedManualProductUrl(row: CsvRow) {
  const brand =
    column(row, ["brand", "manufacturer", "manufacturer name"]) ?? "product";
  const name =
    column(row, [
      "name",
      "product",
      "product name",
      "canonical product title",
    ]) ?? "item";
  const slug = `${brand}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `manual://product-catalogue-import/${slug || "item"}-${row.rowNumber}`;
}

async function productMatches() {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const rows = await sql<
    Array<{
      identifier_type: string | null;
      normalized_brand_name: string | null;
      normalized_title: string | null;
      normalized_value: string | null;
      product_id: string;
    }>
  >`
    select
      products.id::text as product_id,
      products.normalized_brand_name,
      products.normalized_title,
      product_identifiers.identifier_type,
      product_identifiers.normalized_value
    from public.products
    left join public.product_identifiers
      on product_identifiers.product_id = products.id
      and product_identifiers.status = 'active'
      and product_identifiers.identifier_type in ('ean13', 'upc', 'manufacturer_sku')
    where products.status <> 'ignored'
  `;
  const byProductId = new Map<string, ProductMatch>();
  const byFingerprint = new Map<string, ProductMatch>();
  const byIdentifier = new Map<string, ProductMatch>();

  for (const row of rows) {
    const existing = byProductId.get(row.product_id) ?? {
      ean13: null,
      manufacturerSku: null,
      normalizedBrandName: row.normalized_brand_name,
      normalizedTitle: row.normalized_title,
      productId: row.product_id,
      upc: null,
    };
    const next = {
      ...existing,
      ...(row.identifier_type === "ean13"
        ? { ean13: row.normalized_value }
        : {}),
      ...(row.identifier_type === "manufacturer_sku"
        ? { manufacturerSku: row.normalized_value }
        : {}),
      ...(row.identifier_type === "upc"
        ? { upc: row.normalized_value }
        : {}),
    };

    byProductId.set(row.product_id, next);

    if (row.identifier_type && row.normalized_value) {
      byIdentifier.set(`${row.identifier_type}:${row.normalized_value}`, next);
    }

    if (next.normalizedBrandName && next.normalizedTitle) {
      byFingerprint.set(
        `${next.normalizedBrandName}:${next.normalizedTitle}`,
        next,
      );
    }
  }

  return { byFingerprint, byIdentifier, byProductId };
}

function productRowFingerprint(
  input: Readonly<{
    brandName: string | null;
    title: string | null;
  }>,
) {
  if (!input.brandName || !input.title) {
    return null;
  }

  const normalizedBrandName = normalizeProductKey(input.brandName);
  const normalizedTitle = normalizeProductKey(input.title);

  return normalizedBrandName && normalizedTitle
    ? `${normalizedBrandName}:${normalizedTitle}`
    : null;
}

function registerProductMatch(
  matches: Awaited<ReturnType<typeof productMatches>>,
  input: Readonly<{
    brandName: string | null;
    ean13: string | null;
    manufacturerSku: string | null;
    productId: string;
    title: string | null;
    upc: string | null;
  }>,
) {
  const existing = matches.byProductId.get(input.productId);
  const next: ProductMatch = {
    ean13: input.ean13 ?? existing?.ean13 ?? null,
    manufacturerSku: input.manufacturerSku ?? existing?.manufacturerSku ?? null,
    normalizedBrandName: input.brandName
      ? normalizeProductKey(input.brandName)
      : (existing?.normalizedBrandName ?? null),
    normalizedTitle: input.title
      ? normalizeProductKey(input.title)
      : (existing?.normalizedTitle ?? null),
    productId: input.productId,
    upc: input.upc ?? existing?.upc ?? null,
  };

  matches.byProductId.set(input.productId, next);

  if (next.ean13) {
    matches.byIdentifier.set(`ean13:${next.ean13}`, next);
  }

  if (next.manufacturerSku) {
    matches.byIdentifier.set(`manufacturer_sku:${next.manufacturerSku}`, next);
  }

  if (next.upc) {
    matches.byIdentifier.set(`upc:${next.upc}`, next);
  }

  if (next.normalizedBrandName && next.normalizedTitle) {
    matches.byFingerprint.set(
      `${next.normalizedBrandName}:${next.normalizedTitle}`,
      next,
    );
  }
}

function matchRowProduct(
  row: CsvRow,
  matches: Awaited<ReturnType<typeof productMatches>>,
) {
  const sku = cleanText(
    column(row, [
      "sku",
      "internal sku",
      "mattaNutra SKU",
      "mattanutra sku",
      "product id",
    ]),
    80,
  );
  const hasSku = Boolean(sku);
  const productId = isUuidValue(sku) ? sku : null;
  const ean13 = normalizeIdentifierValue(
    "ean13",
    column(row, [
      "barcode",
      "ean13",
      "ean-13 barcode",
      "ean13 barcode",
      "ean",
      "gtin",
    ]),
  );
  const manufacturerSku = normalizeIdentifierValue(
    "manufacturer_sku",
    column(row, [
      "manufacturer sku",
      "manufacturer_sku",
      "mpn",
      "manufacturer code",
    ]),
  );
  const upc = normalizeIdentifierValue(
    "upc",
    column(row, [
      "upc",
      "upc barcode",
      "upc-a",
      "upca",
      "gtin12",
      "gtin-12",
    ]),
  );
  const title = cleanText(
    column(row, ["name", "product name", "canonical product title"]),
    500,
  );
  const brandName = cleanText(
    column(row, ["brand", "manufacturer", "manufacturer name"]),
    200,
  );
  const fingerprint = productRowFingerprint({ brandName, title });

  if (productId && matches.byProductId.has(productId)) {
    return { ean13, manufacturerSku, productId, skuInvalid: false, upc };
  }

  if (hasSku) {
    return { ean13, manufacturerSku, productId: null, skuInvalid: true, upc };
  }

  if (ean13 && matches.byIdentifier.has(`ean13:${ean13}`)) {
    return {
      ean13,
      manufacturerSku,
      productId: matches.byIdentifier.get(`ean13:${ean13}`)?.productId ?? null,
      skuInvalid: false,
      upc,
    };
  }

  if (upc && matches.byIdentifier.has(`upc:${upc}`)) {
    return {
      ean13,
      manufacturerSku,
      productId: matches.byIdentifier.get(`upc:${upc}`)?.productId ?? null,
      skuInvalid: false,
      upc,
    };
  }

  if (
    manufacturerSku &&
    matches.byIdentifier.has(`manufacturer_sku:${manufacturerSku}`)
  ) {
    return {
      ean13,
      manufacturerSku,
      productId:
        matches.byIdentifier.get(`manufacturer_sku:${manufacturerSku}`)
          ?.productId ?? null,
      skuInvalid: false,
      upc,
    };
  }

  if (fingerprint && matches.byFingerprint.has(fingerprint)) {
    return {
      ean13,
      manufacturerSku,
      productId: matches.byFingerprint.get(fingerprint)?.productId ?? null,
      skuInvalid: false,
      upc,
    };
  }

  return { ean13, manufacturerSku, productId: null, skuInvalid: false, upc };
}

function mergedIdentifiers(
  row: AdminProductRow | null,
  input: Readonly<{
    ean13: string | null;
    manufacturerSku: string | null;
    upc: string | null;
  }>,
): ProductIdentifierInput[] | undefined {
  const hasChanges = Boolean(input.ean13 || input.manufacturerSku || input.upc);

  if (!hasChanges) {
    return undefined;
  }

  const byType = new Map<string, ProductIdentifierInput>();

  for (const identifier of row?.identifiers ?? []) {
    byType.set(identifier.type, {
      confidence: identifier.confidence,
      evidenceUrl: identifier.evidenceUrl,
      source: identifier.source,
      type: identifier.type,
      value: identifier.value,
    });
  }

  if (input.ean13) {
    byType.set("ean13", {
      confidence: "trusted",
      evidenceUrl: null,
      source: "product_catalogue_csv",
      type: "ean13",
      value: input.ean13,
    });
  }

  if (input.manufacturerSku) {
    byType.set("manufacturer_sku", {
      confidence: "trusted",
      evidenceUrl: null,
      source: "product_catalogue_csv",
      type: "manufacturer_sku",
      value: input.manufacturerSku,
    });
  }

  if (input.upc) {
    byType.set("upc", {
      confidence: "trusted",
      evidenceUrl: null,
      source: "product_catalogue_csv",
      type: "upc",
      value: input.upc,
    });
  }

  return [...byType.values()];
}

function approvalInputFromRow(row: CsvRow, countryCode: string) {
  const fdaApproval = cleanText(
    column(row, [
      "fda approval",
      "fda approval number",
      "thai fda",
      "thai fda approval",
    ]),
    120,
  );
  const genericAgency = cleanText(
    column(row, [
      "regulatory agency",
      "approval agency",
      "authority",
      "agency",
    ]),
    200,
  );
  const genericNumber = cleanText(
    column(row, [
      "approval number",
      "regulatory approval number",
      "registration number",
    ]),
    120,
  );
  const approvals: ProductRegulatoryApprovalInput[] = [];

  if (fdaApproval) {
    approvals.push({
      agencyCode: "TH_FDA",
      agencyName: "Thai FDA",
      approvalNumber: fdaApproval,
      approvalType: "product_registration",
      evidenceUrl: null,
      metadata: { source: "product_catalogue_csv" },
      scopeCode: "TH",
      scopeType: "country",
      source: "product_catalogue_csv",
      status: "verified",
    });
  }

  if (genericAgency && genericNumber) {
    approvals.push({
      agencyCode: genericAgency
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40),
      agencyName: genericAgency,
      approvalNumber: genericNumber,
      approvalType: "product_registration",
      evidenceUrl: null,
      metadata: { source: "product_catalogue_csv" },
      scopeCode: countryCode,
      scopeType: "country",
      source: "product_catalogue_csv",
      status: "verified",
    });
  }

  return approvals;
}

function mergedApprovals(
  existing: AdminProductRow | null,
  nextApprovals: readonly ProductRegulatoryApprovalInput[],
) {
  if (nextApprovals.length < 1) {
    return undefined;
  }

  const approvalKey = (
    approval: Pick<
      ProductRegulatoryApprovalInput,
      "agencyCode" | "scopeCode" | "scopeType"
    >,
  ) =>
    `${approval.scopeType ?? "country"}:${approval.scopeCode ?? ""}:${approval.agencyCode ?? ""}`;
  const byKey = new Map<string, ProductRegulatoryApprovalInput>();

  for (const approval of existing?.regulatoryApprovals ?? []) {
    byKey.set(approvalKey(approval), approval);
  }

  for (const approval of nextApprovals) {
    byKey.set(approvalKey(approval), approval);
  }

  return [...byKey.values()];
}

function countrySettingsFromRow(
  row: CsvRow,
  countryCode: NonNullable<ReturnType<typeof normalizeProductCountryCode>>,
): ProductCountryPricing[] | undefined {
  if (!column(row, ["currency", "ccy"])) {
    return undefined;
  }

  return [
    {
      countryCode,
      currency: normalizeCurrencyCode(column(row, ["currency", "ccy"]), "THB"),
      priceUpdatedAt: null,
      rrpPriceAmount: null,
    },
  ];
}

async function platformProductSourceImageUrls(
  rows: readonly AdminProductRow[],
) {
  const sql = getSql();

  if (!sql || rows.length < 1) {
    return new Map<string, string | null>();
  }

  const productIds = rows.map((row) => row.id).filter(isUuidValue);
  const importIds = rows
    .map((row) => row.productImportId)
    .filter((id): id is string => Boolean(id && isUuidValue(id)));
  const productIdByImportId = new Map(
    rows
      .filter((row) => row.productImportId)
      .map((row) => [row.productImportId as string, row.id]),
  );
  const importRows = await sql<ProductImportSourceImageRow[]>`
    select
      product_imports.id::text,
      product_imports.product_id::text,
      product_imports.image_urls,
      product_imports.raw_snapshot,
      product_imports.updated_at
    from public.product_imports
    where product_imports.product_id = any(${productIds}::uuid[])
      or product_imports.id = any(${importIds}::uuid[])
    order by product_imports.updated_at desc
  `;
  const sourceImageUrls = new Map<string, string | null>();

  for (const importRow of importRows) {
    const productId =
      importRow.product_id ?? productIdByImportId.get(importRow.id) ?? null;

    if (!productId || sourceImageUrls.has(productId)) {
      continue;
    }

    sourceImageUrls.set(productId, productImportSourceImageUrl(importRow));
  }

  return sourceImageUrls;
}

export function platformProductCatalogueJsonProductFromRow(
  row: AdminProductRow,
  sourceImageUrl: string | null = null,
) {
  const v9Product = v9MasterListProductFromSourceSnapshot(row.sourceSnapshot);

  if (v9Product) {
    return {
      ...v9Product,
      canonicalImageUrl: Object.hasOwn(v9Product, "canonicalImageUrl")
        ? v9Product.canonicalImageUrl
        : row.imageUrl,
      price: Object.hasOwn(v9Product, "price")
        ? v9Product.price
        : temporaryPlatformExportPrice(row),
      productUrl: Object.hasOwn(v9Product, "productUrl")
        ? v9Product.productUrl
        : row.productUrl,
      sourceImageUrl: Object.hasOwn(v9Product, "sourceImageUrl")
        ? v9Product.sourceImageUrl
        : sourceImageUrl,
      updatedAt: Object.hasOwn(v9Product, "updatedAt")
        ? v9Product.updatedAt
        : row.updatedAt,
    };
  }

  return {
    availabilityStatus: row.availabilityStatus,
    brand: {
      id: row.brandId,
      manufacturerCountryCodes: row.manufacturerCountryCodes,
      name: row.brandName,
      status: row.brandStatus,
    },
    canonicalImageUrl: row.imageUrl,
    category: row.category,
    countries: row.availableCountryCodes.map((countryCode) => {
      const country = row.countryPricing.find(
        (item) => item.countryCode === countryCode,
      );

      return {
        countryCode,
        currency: country?.currency ?? row.currency,
        effectiveRegulatoryApprovals:
          country?.effectiveRegulatoryApprovals ?? [],
      };
    }),
    descriptions: {
      canonical: row.description,
      display: row.displayDescription,
    },
    id: row.id,
    identifiers: row.identifiers,
    ingredients: row.facts.map((fact) => ({
      aliases: fact.aliasKeys ?? [],
      amount: fact.amount,
      confidence: fact.confidence,
      foodId: fact.foodId ?? null,
      id: fact.id,
      itemType: fact.itemType,
      maxAmount: fact.maxAmount ?? null,
      maxUnit: fact.maxUnit ?? null,
      name: fact.name,
      normalizedName: fact.normalizedName,
      nutrientId: fact.nutrientId ?? null,
      safetyFlags: fact.safetyFlags ?? [],
      servingLabel: fact.servingLabel ?? null,
      source: fact.source,
      sourceText: fact.sourceText,
      sourceUrl: fact.sourceUrl,
      supplementAudience: fact.supplementAudience ?? null,
      supplementId: fact.supplementId ?? null,
      supplementStatus: fact.supplementStatus,
      unit: fact.unit,
    })),
    platform: row.platform,
    price: temporaryPlatformExportPrice(row),
    productAudience: row.productAudience,
    productKind: row.productKind,
    productUrl: row.productUrl,
    region: row.region,
    regulatoryApprovals: row.regulatoryApprovals,
    sourceImageUrl,
    status: row.status,
    titles: {
      canonical: row.title,
      display: row.displayTitle,
    },
    translations: row.translations,
    updatedAt: row.updatedAt,
  };
}

export async function buildPlatformProductCatalogueJson(): Promise<PlatformProductCatalogueJson> {
  const data = await getAdminProductsData();
  const sourceImageUrls = await platformProductSourceImageUrls(data.rows);
  const metadata = data.rows
    .map((row) => v9MasterListMetadataFromSourceSnapshot(row.sourceSnapshot))
    .find(Boolean);
  const products = data.rows.map((row) =>
    platformProductCatalogueJsonProductFromRow(
      row,
      sourceImageUrls.get(row.id) ?? null,
    ),
  );

  return {
    generatedAt: metadata?.generatedAt ?? data.generatedAt,
    productCount: products.length,
    products,
    schema: V9_PRODUCT_MASTER_SCHEMA,
    scope: metadata?.scope ?? "platform",
    summary: metadata?.summary ?? data.summary,
  };
}

export function retailProductCatalogueJsonProductFromRow(
  row: RetailProductCatalogueJsonRow,
) {
  return {
    backorderPolicy: row.backorder_policy === "deny" ? "deny" : "allow",
    barcode: row.barcode,
    currency: normalizeCurrencyCode(row.currency, "THB"),
    leadTimeDays: integerOrDefault(row.lead_time_days, 0),
    manufacturer: row.manufacturer,
    manufacturerSku: row.manufacturer_sku,
    name: row.name,
    productId: row.product_id,
    retailPriceAmount: numberOrNull(row.retail_price_amount),
    retailSellableProductId: row.retail_sellable_product_id,
    status:
      row.status === "disabled" || row.status === "deleted"
        ? row.status
        : "active",
    stockId: row.stock_id,
    stockQuantity: integerOrDefault(row.stock_quantity, 0),
    updatedAt: isoDateTime(row.updated_at),
    wholesalePriceAmount: numberOrNull(row.wholesale_price_amount),
  };
}

export async function buildRetailProductCatalogueJson(
  input: Readonly<{ organisationId?: string | null }>,
): Promise<RetailProductCatalogueJson> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const organisationId = cleanText(input.organisationId, 80);

  if (!organisationId || !isUuidValue(organisationId)) {
    throw new Error("Retail organisation is required for product catalogue export");
  }

  const organisationRows = await sql<Array<{
    country_code: string | null;
    currency: string | null;
    id: string;
    name: string;
  }>>`
    select id::text, name, currency, country_code
    from public.organisations
    where id = ${organisationId}::uuid
      and organisation_type = 'tenant'
      and status = 'active'
    limit 1
  `;
  const organisation = organisationRows[0];

  if (!organisation) {
    throw new Error("Retail organisation not found");
  }

  const rows = await sql<RetailProductCatalogueJsonRow[]>`
    with retail_products as (
      select product_id
      from public.retail_product_stock
      where organisation_id = ${organisationId}::uuid
        and status <> 'deleted'
      union
      select product_id
      from public.retail_sellable_products
      where organisation_id = ${organisationId}::uuid
        and status <> 'deleted'
    )
    select
      products.id::text as product_id,
      retail_product_stock.id::text as stock_id,
      retail_sellable_products.id::text as retail_sellable_product_id,
      products.title as name,
      products.brand_name as manufacturer,
      identifiers.manufacturer_sku,
      identifiers.barcode,
      coalesce(retail_sellable_products.status, retail_product_stock.status, 'active') as status,
      coalesce(retail_product_stock.stock_quantity, 0) as stock_quantity,
      coalesce(
        retail_sellable_products.currency,
        retail_product_stock.currency,
        ${organisation.currency ?? "THB"},
        products.currency,
        'THB'
      ) as currency,
      coalesce(
        retail_sellable_products.rrp_price_amount,
        retail_product_stock.retail_price_amount
      ) as retail_price_amount,
      coalesce(
        retail_sellable_products.wholesale_price_amount,
        retail_product_stock.wholesale_price_amount
      ) as wholesale_price_amount,
      coalesce(
        retail_sellable_products.lead_time_days,
        retail_product_stock.lead_time_days,
        0
      ) as lead_time_days,
      coalesce(retail_sellable_products.backorder_policy, 'allow') as backorder_policy,
      greatest(
        coalesce(retail_sellable_products.updated_at, 'epoch'::timestamptz),
        coalesce(retail_product_stock.updated_at, 'epoch'::timestamptz),
        products.updated_at
      ) as updated_at
    from retail_products
    join public.products
      on products.id = retail_products.product_id
    left join public.retail_product_stock
      on retail_product_stock.organisation_id = ${organisationId}::uuid
      and retail_product_stock.product_id = products.id
      and retail_product_stock.status <> 'deleted'
    left join public.retail_sellable_products
      on retail_sellable_products.organisation_id = ${organisationId}::uuid
      and retail_sellable_products.product_id = products.id
      and retail_sellable_products.status <> 'deleted'
    left join lateral (
      select
        max(product_identifiers.identifier_value) filter (
          where product_identifiers.identifier_type = 'manufacturer_sku'
        ) as manufacturer_sku,
        max(product_identifiers.identifier_value) filter (
          where product_identifiers.identifier_type = 'ean13'
        ) as barcode
      from public.product_identifiers
      where product_identifiers.product_id = products.id
        and product_identifiers.status = 'active'
        and product_identifiers.identifier_type in ('ean13', 'manufacturer_sku')
    ) identifiers on true
    where products.status <> 'ignored'
    order by lower(coalesce(products.brand_name, '')), lower(products.title)
  `;

  return {
    generatedAt: new Date().toISOString(),
    organisation: {
      countryCode: organisation.country_code,
      currency: normalizeCurrencyCode(organisation.currency, "THB"),
      id: organisation.id,
      name: organisation.name,
    },
    productCount: rows.length,
    products: rows.map(retailProductCatalogueJsonProductFromRow),
    schemaVersion: 1,
    scope: "retail",
  };
}

export async function buildProductCatalogueCsv(
  input: Readonly<{
    organisationId?: string | null;
    scope: ProductCatalogueCsvScope;
  }>,
) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const organisationId = cleanText(input.organisationId, 80);
  const scopedOrganisationId =
    input.scope === "retail" && isUuidValue(organisationId)
      ? organisationId
      : null;

  if (input.scope === "retail" && !scopedOrganisationId) {
    throw new Error(
      "Retail organisation is required for product catalogue export",
    );
  }

  const rows = await sql<
    Array<{
      approval_number: string | null;
      backorder_demand: string | number | null;
      backorder_policy: string | null;
      brand_name: string | null;
      country_code: string | null;
      currency: string | null;
      ean13: string | null;
      image_url: string | null;
      lead_time_days: string | number | null;
      manufacturer_sku: string | null;
      organisation_name: string | null;
      product_id: string;
      product_kind: string;
      product_url: string | null;
      regulatory_approvals: string | null;
      retail_price_amount: string | number | null;
      rrp_price_amount: string | number | null;
      status: string;
      stock_quantity: string | number | null;
      title: string;
      title_en: string | null;
      title_th: string | null;
      upc: string | null;
      wholesale_price_amount: string | number | null;
    }>
  >`
    select
      products.id::text as product_id,
      products.brand_name,
      products.title,
      product_translation_en.title as title_en,
      product_translation_th.title as title_th,
      products.product_url,
      products.image_url,
      products.product_kind,
      products.status,
      coalesce(organisation_rows.country_code, 'TH') as country_code,
      product_country.rrp_price_amount,
      coalesce(product_country.currency, products.currency, organisation_rows.currency, 'THB') as currency,
      organisation_rows.name as organisation_name,
      coalesce(stock_rows.stock_quantity, 0) as stock_quantity,
      stock_rows.wholesale_price_amount,
      stock_rows.retail_price_amount,
      stock_rows.backorder_policy,
      stock_rows.lead_time_days,
      coalesce(backorder_rows.backorder_demand, 0) as backorder_demand,
      max(product_identifiers.identifier_value) filter (
        where product_identifiers.identifier_type = 'ean13'
      ) as ean13,
      max(product_identifiers.identifier_value) filter (
        where product_identifiers.identifier_type = 'manufacturer_sku'
      ) as manufacturer_sku,
      max(product_identifiers.identifier_value) filter (
        where product_identifiers.identifier_type = 'upc'
      ) as upc,
      max(product_regulatory_approvals.approval_number) filter (
        where product_regulatory_approvals.agency_code = 'TH_FDA'
          and product_regulatory_approvals.status in ('sourced', 'verified')
      ) as approval_number,
      string_agg(
        distinct concat_ws(
          '',
          product_regulatory_approvals.agency_name,
          ': ',
          product_regulatory_approvals.approval_number,
          ' (',
          product_regulatory_approvals.scope_code,
          ')'
        ),
        '; '
      ) filter (
        where product_regulatory_approvals.approval_number is not null
          and product_regulatory_approvals.status in ('sourced', 'verified')
      ) as regulatory_approvals
    from public.products
    left join lateral (
      select organisations.id, organisations.name, organisations.currency, organisations.country_code
      from public.organisations
      where organisations.id = ${scopedOrganisationId}::uuid
      limit 1
    ) organisation_rows on true
    left join public.product_countries product_country
      on product_country.product_id = products.id
      and product_country.country_code = coalesce(organisation_rows.country_code, 'TH')
    left join lateral (
      select
        coalesce(sum(retail_product_stock.stock_quantity), 0)::int as stock_quantity,
        max(coalesce(retail_sellable_products.wholesale_price_amount, retail_product_stock.wholesale_price_amount)) as wholesale_price_amount,
        max(coalesce(retail_sellable_products.rrp_price_amount, retail_product_stock.retail_price_amount)) as retail_price_amount,
        max(coalesce(retail_sellable_products.backorder_policy, 'allow')) as backorder_policy,
        max(coalesce(retail_sellable_products.lead_time_days, retail_product_stock.lead_time_days, 0)) as lead_time_days
      from public.retail_product_stock
      left join public.retail_sellable_products
        on retail_sellable_products.organisation_id = retail_product_stock.organisation_id
        and retail_sellable_products.product_id = retail_product_stock.product_id
        and retail_sellable_products.status <> 'deleted'
      where retail_product_stock.product_id = products.id
        and retail_product_stock.status <> 'deleted'
        and (
          ${scopedOrganisationId}::uuid is null
          or retail_product_stock.organisation_id = ${scopedOrganisationId}::uuid
        )
    ) stock_rows on true
    left join lateral (
      select
        coalesce(sum(greatest(
          retail_customer_order_lines.quantity_ordered
            - retail_customer_order_lines.quantity_allocated
            - retail_customer_order_lines.quantity_shipped,
          0
        )), 0)::int as backorder_demand
      from public.retail_customer_order_lines
      join public.retail_customer_orders
        on retail_customer_orders.id = retail_customer_order_lines.customer_order_id
      where retail_customer_order_lines.product_id = products.id
        and retail_customer_orders.status = 'awaiting_stock'
        and (
          ${scopedOrganisationId}::uuid is null
          or retail_customer_order_lines.organisation_id = ${scopedOrganisationId}::uuid
        )
    ) backorder_rows on true
    left join public.product_identifiers
      on product_identifiers.product_id = products.id
      and product_identifiers.status = 'active'
      and product_identifiers.identifier_type in ('ean13', 'upc', 'manufacturer_sku')
    left join public.product_translations product_translation_en
      on product_translation_en.product_id = products.id
      and product_translation_en.locale = 'en'
      and product_translation_en.status <> 'missing'
    left join public.product_translations product_translation_th
      on product_translation_th.product_id = products.id
      and product_translation_th.locale = 'th'
      and product_translation_th.status <> 'missing'
    left join public.product_regulatory_approvals
      on product_regulatory_approvals.product_id = products.id
    where products.status <> 'ignored'
      and (
        ${input.scope} <> 'retail'
        or exists (
          select 1
          from public.retail_product_stock scoped_stock
          where scoped_stock.product_id = products.id
            and scoped_stock.organisation_id = ${scopedOrganisationId}::uuid
            and scoped_stock.status <> 'deleted'
        )
        or exists (
          select 1
          from public.retail_sellable_products scoped_sellable
          where scoped_sellable.product_id = products.id
            and scoped_sellable.organisation_id = ${scopedOrganisationId}::uuid
            and scoped_sellable.status <> 'deleted'
        )
      )
    group by
      products.id,
      products.brand_name,
      products.title,
      product_translation_en.title,
      product_translation_th.title,
      products.product_url,
      products.image_url,
      products.product_kind,
      products.status,
      organisation_rows.country_code,
      product_country.rrp_price_amount,
      product_country.currency,
      organisation_rows.name,
      organisation_rows.currency,
      stock_rows.stock_quantity,
      stock_rows.wholesale_price_amount,
      stock_rows.retail_price_amount,
      stock_rows.backorder_policy,
      stock_rows.lead_time_days,
      backorder_rows.backorder_demand
    order by products.brand_name nulls last, products.title asc
  `;
  const lines = [
    csvLine(PRODUCT_CATALOGUE_CSV_HEADERS),
    ...rows.map((row) =>
      csvLine([
        row.product_id,
        row.brand_name,
        row.title,
        row.title_en,
        row.title_th,
        row.product_url,
        row.image_url,
        row.product_kind,
        row.status,
        row.country_code,
        row.rrp_price_amount,
        row.currency,
        row.approval_number,
        row.regulatory_approvals,
        row.manufacturer_sku,
        row.ean13,
        row.upc,
        row.stock_quantity,
        row.backorder_demand,
        row.backorder_policy,
        row.wholesale_price_amount,
        row.retail_price_amount,
        row.lead_time_days,
        row.status,
        row.organisation_name,
      ]),
    ),
  ];

  return lines.join("\n") + "\n";
}

export async function applyProductCatalogueCsvImport(
  input: Readonly<{
    csvText: string;
    organisationId?: string | null;
    scope: ProductCatalogueCsvScope;
  }>,
) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const organisationId = cleanText(input.organisationId, 80);
  const scopedOrganisationId =
    input.scope === "retail" && isUuidValue(organisationId)
      ? organisationId
      : null;

  if (input.scope === "retail" && !scopedOrganisationId) {
    throw new Error(
      "Retail organisation is required for product catalogue import",
    );
  }

  const rows = parseProductCatalogueCsv(input.csvText);
  const matches = await productMatches();
  const result: ProductCatalogueImportResult = {
    createdProducts: 0,
    invalidRows: [],
    movementsCreated: 0,
    retailRowsUpdated: 0,
    rowCount: rows.length,
    updatedProducts: 0,
  };

  for (const row of rows) {
    try {
      const retailOnlyColumns =
        input.scope === "platform" ? platformImportRetailOnlyColumns(row) : [];

      if (retailOnlyColumns.length > 0) {
        result.invalidRows.push({
          reason: `Platform catalogue import cannot include retail-only columns: ${retailOnlyColumns.join(", ")}`,
          rowNumber: row.rowNumber,
        });
        continue;
      }

      const matched = matchRowProduct(row, matches);
      const countryCode: NonNullable<
        ReturnType<typeof normalizeProductCountryCode>
      > = normalizeProductCountryCode(column(row, ["country"])) ?? "TH";
      const title = cleanText(
        column(row, ["name", "product name", "canonical product title"]),
        500,
      );
      const brandName = cleanText(
        column(row, ["brand", "manufacturer", "manufacturer name"]),
        200,
      );
      const productUrl = cleanText(column(row, ["product url", "url"]), 2000);
      const imageUrl = cleanText(column(row, ["image url", "image"]), 2000);
      const englishTitle = cleanText(column(row, ["english name", "title en"]), 500);
      const thaiTitle = cleanText(column(row, ["thai name", "title th"]), 500);
      const translationRequest = normalizeLegacyProductTranslationFields({
        ...(englishTitle !== null ? { englishTitle } : {}),
        ...(thaiTitle !== null ? { thaiTitle } : {}),
      });
      const currency = normalizeCurrencyCode(
        column(row, ["currency", "ccy"]),
        "THB",
      );
      const identifiers = (existing: AdminProductRow | null) =>
        mergedIdentifiers(existing, {
          ean13: matched.ean13,
          manufacturerSku: matched.manufacturerSku,
          upc: matched.upc,
        });
      const approvals = (existing: AdminProductRow | null) =>
        mergedApprovals(existing, approvalInputFromRow(row, countryCode));
      let productId = matched.productId;

      if (matched.skuInvalid) {
        result.invalidRows.push({
          reason:
            "Internal SKU must be a valid existing product UUID or be blank for a new product",
          rowNumber: row.rowNumber,
        });
        continue;
      }

      if (!productId) {
        if (!title || !brandName) {
          result.invalidRows.push({
            reason: "New products require Brand/Manufacturer and Name",
            rowNumber: row.rowNumber,
          });
          continue;
        }

        const created = await createAdminProduct({
          actor: "product_catalogue_csv",
          availableCountryCodes: [countryCode],
          brandName,
          countryPricing: countrySettingsFromRow(row, countryCode),
          currency,
          imageUrl,
          identifiers: mergedIdentifiers(null, {
            ean13: matched.ean13,
            manufacturerSku: matched.manufacturerSku,
            upc: matched.upc,
          }),
          platform: "manual",
          productAudience: productAudienceFromColumn(column(row, ["audience"])),
          productKind: productKindFromColumn(
            column(row, ["product category", "product kind", "category"]),
          ),
          productUrl: productUrl ?? generatedManualProductUrl(row),
          regulatoryApprovals: mergedApprovals(
            null,
            approvalInputFromRow(row, countryCode),
          ),
          region: countryCode,
          source: "product_catalogue_csv",
          status:
            productStatusFromColumn(column(row, ["status"])) ??
            "pending_review",
          title,
          translations: translationRequest.translations,
        });

        productId = created.id;
        registerProductMatch(matches, {
          brandName,
          ean13: matched.ean13,
          manufacturerSku: matched.manufacturerSku,
          productId,
          title,
          upc: matched.upc,
        });
        result.createdProducts += 1;
      } else {
        const existing = await loadAdminProductRow(productId);

        if (!existing) {
          result.invalidRows.push({
            reason: "Matched product could not be loaded",
            rowNumber: row.rowNumber,
          });
          continue;
        }

        await updateAdminProduct({
          actor: "product_catalogue_csv",
          brandName: brandName === null ? undefined : brandName,
          changeNote: "product_catalogue_csv_import",
          countryPricing: countrySettingsFromRow(row, countryCode),
          id: productId,
          imageUrl: imageUrl === null ? undefined : imageUrl,
          identifiers: identifiers(existing),
          productKind: column(row, [
            "product category",
            "product kind",
            "category",
          ])
            ? productKindFromColumn(
                column(row, ["product category", "product kind", "category"]),
              )
            : undefined,
          productUrl: productUrl === null ? undefined : productUrl,
          regulatoryApprovals: approvals(existing),
          status: productStatusFromColumn(column(row, ["status"])),
          title: title === null ? undefined : title,
          translations: translationRequest.translations
            ? {
                ...existing.translations,
                ...translationRequest.translations,
              }
            : undefined,
        });
        registerProductMatch(matches, {
          brandName: brandName ?? existing.brandName,
          ean13: matched.ean13,
          manufacturerSku: matched.manufacturerSku,
          productId,
          title: title ?? existing.title,
          upc: matched.upc,
        });
        result.updatedProducts += 1;
      }

      if (input.scope === "retail" && scopedOrganisationId && productId) {
        const stockQuantity = integerFromColumn(row, [
          "quantity in stock",
          "stock quantity",
          "stock",
          "quantity",
        ]);
        const wholesalePriceAmount = numberFromColumn(row, [
          "wholesale price",
          "wholesale",
          "unit cost",
        ]);
        const retailPriceAmount = numberFromColumn(row, [
          "retail price",
          "retail",
        ]);
        const leadTimeDays = integerFromColumn(row, [
          "lead time days",
          "lead time",
        ]);
        const existing = await sql<
          Array<{
            id: string | null;
            stock_quantity: string | number | null;
          }>
        >`
        select id::text, stock_quantity
        from public.retail_product_stock
        where organisation_id = ${scopedOrganisationId}::uuid
          and product_id = ${productId}::uuid
        limit 1
      `;
        const previousQuantity = Math.max(
          0,
          Math.round(Number(existing[0]?.stock_quantity ?? 0)),
        );
        const nextQuantity = stockQuantity ?? previousQuantity;
        const delta = nextQuantity - previousQuantity;
        const stockRows = await sql<Array<{ id: string }>>`
        insert into public.retail_product_stock (
          organisation_id,
          product_id,
          status,
          stock_quantity,
          lead_time_days,
          wholesale_price_amount,
          retail_price_amount,
          currency,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${scopedOrganisationId}::uuid,
          ${productId}::uuid,
          ${retailStatusFromColumn(column(row, ["retail status", "status"]))},
          ${nextQuantity},
          ${leadTimeDays ?? 0},
          ${wholesalePriceAmount},
          ${retailPriceAmount},
          ${currency},
          ${sql.json(toJsonValue({ source: "product_catalogue_csv" }))}::jsonb,
          now(),
          now()
        )
        on conflict (organisation_id, product_id)
        do update set
          status = excluded.status,
          stock_quantity = excluded.stock_quantity,
          lead_time_days = coalesce(excluded.lead_time_days, public.retail_product_stock.lead_time_days),
          wholesale_price_amount = coalesce(excluded.wholesale_price_amount, public.retail_product_stock.wholesale_price_amount),
          retail_price_amount = coalesce(excluded.retail_price_amount, public.retail_product_stock.retail_price_amount),
          currency = excluded.currency,
          metadata = public.retail_product_stock.metadata || excluded.metadata,
          updated_at = now()
        returning id::text
      `;
        const stockId = stockRows[0]?.id;

        await sql`
        insert into public.retail_sellable_products (
          organisation_id,
          product_id,
          status,
          rrp_price_amount,
          wholesale_price_amount,
          currency,
          lead_time_days,
          backorder_policy,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${scopedOrganisationId}::uuid,
          ${productId}::uuid,
          ${retailStatusFromColumn(column(row, ["retail status", "status"]))},
          ${retailPriceAmount},
          ${wholesalePriceAmount},
          ${currency},
          ${leadTimeDays ?? 0},
          ${backorderPolicyFromColumn(column(row, ["backorder policy", "backorder"]))},
          ${sql.json(toJsonValue({ source: "product_catalogue_csv" }))}::jsonb,
          now(),
          now()
        )
        on conflict (organisation_id, product_id)
        do update set
          status = excluded.status,
          rrp_price_amount = coalesce(excluded.rrp_price_amount, public.retail_sellable_products.rrp_price_amount),
          wholesale_price_amount = coalesce(excluded.wholesale_price_amount, public.retail_sellable_products.wholesale_price_amount),
          currency = excluded.currency,
          lead_time_days = coalesce(excluded.lead_time_days, public.retail_sellable_products.lead_time_days),
          backorder_policy = excluded.backorder_policy,
          metadata = public.retail_sellable_products.metadata || excluded.metadata,
          updated_at = now()
      `;
        result.retailRowsUpdated += 1;

        if (stockId && delta !== 0) {
          await sql`
          insert into public.retail_stock_movements (
            retail_product_stock_id,
            organisation_id,
            product_id,
            movement_type,
            quantity_delta,
            unit_cost_amount,
            retail_price_amount,
            currency,
            reason,
            source,
            metadata,
            occurred_at,
            created_at
          )
          values (
            ${stockId}::uuid,
            ${scopedOrganisationId}::uuid,
            ${productId}::uuid,
            ${delta > 0 ? "receive" : "adjustment"},
            ${delta},
            ${wholesalePriceAmount},
            ${retailPriceAmount},
            ${currency},
            'Product catalogue CSV import',
            'product_catalogue_csv',
            ${sql.json(
              toJsonValue({
                previousQuantity,
                rowNumber: row.rowNumber,
                stockQuantity: nextQuantity,
              }),
            )}::jsonb,
            now(),
            now()
          )
        `;
          result.movementsCreated += 1;
        }
      }
    } catch (error) {
      result.invalidRows.push({
        reason:
          error instanceof Error
            ? error.message.slice(0, 240)
            : "Row import failed",
        rowNumber: row.rowNumber,
      });
    }
  }

  return result;
}
