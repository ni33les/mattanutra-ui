import { getSql } from "@/lib/db";
import { toJsonValue } from "@/lib/assessment-store";
import {
  normalizeIdentifierValue,
  replaceApprovedProductIdentifiers,
  type ProductIdentifierInput
} from "@/lib/product-identifiers";
import { normalizeCurrencyCode } from "@/lib/product-countries";
import { isUuidValue } from "@/lib/admin-product-helpers";

export type HygeiaImportType = "identity" | "stock" | "cost";

export type HygeiaMatchedRow = Readonly<{
  brandName: string | null;
  currency: string;
  ean13: string | null;
  manufacturerSku: string | null;
  productId: string;
  productTitle: string;
  retailPriceAmount: number | null;
  rowNumber: number;
  stockQuantity: number | null;
  wholesalePriceAmount: number | null;
}>;

export type HygeiaImportPreview = Readonly<{
  invalidCount: number;
  matchedRows: HygeiaMatchedRow[];
  rowCount: number;
  unmatchedCount: number;
}>;

type CsvRow = Readonly<{
  columns: Record<string, string>;
  rowNumber: number;
}>;

function cleanText(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizeColumnName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
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

export function parseHygeiaCsv(text: string): CsvRow[] {
  const normalizedText = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText.split("\n").filter((line) => line.trim());

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0] ?? "").map(normalizeColumnName);

  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const columns = Object.fromEntries(
      headers.map((header, cellIndex) => [header, cells[cellIndex]?.trim() ?? ""])
    );

    return {
      columns,
      rowNumber: index + 2
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

function numberFromColumn(row: CsvRow, names: readonly string[]) {
  const value = column(row, names);

  if (!value) {
    return null;
  }

  const parsed = Number(value.replace(/,/g, ""));

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function integerFromColumn(row: CsvRow, names: readonly string[]) {
  const parsed = numberFromColumn(row, names);

  return parsed === null ? null : Math.max(0, Math.round(parsed));
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);

  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvLine(values: readonly unknown[]) {
  return values.map(csvEscape).join(",");
}

async function approvedIdentifierMatches(sql: NonNullable<ReturnType<typeof getSql>>) {
  const rows = await sql<Array<{
    brand_name: string | null;
    id: string;
    identifier_type: string | null;
    identifier_value: string | null;
    normalized_value: string | null;
    title: string;
  }>>`
    select
      products.id::text,
      products.title,
      products.brand_name,
      product_identifiers.identifier_type,
      product_identifiers.identifier_value,
      product_identifiers.normalized_value
    from public.products
    left join public.product_identifiers
      on product_identifiers.product_id = products.id
      and product_identifiers.status = 'active'
      and product_identifiers.identifier_type in ('ean13', 'manufacturer_sku')
    where products.status not in ('ignored', 'deleted')
  `;
  const byProductId = new Map<string, typeof rows[number]>();
  const byIdentifier = new Map<string, typeof rows[number]>();

  for (const row of rows) {
    byProductId.set(row.id, row);

    if (row.identifier_type && row.normalized_value) {
      byIdentifier.set(`${row.identifier_type}:${row.normalized_value}`, row);
    }
  }

  return {
    byIdentifier,
    byProductId
  };
}

function rowProductMatch(
  row: CsvRow,
  matches: Awaited<ReturnType<typeof approvedIdentifierMatches>>
) {
  const productIdCandidate = cleanText(column(row, [
    "product_id",
    "matta_nutra_product_id",
    "mattanutra_product_id",
    "matta_nutra_sku",
    "mattanutra_sku",
    "mattaNutraProductId",
    "internal_sku",
    "sku",
    "id"
  ]), 80);
  const productId = isUuidValue(productIdCandidate) ? productIdCandidate : null;
  const ean13 = normalizeIdentifierValue("ean13", column(row, [
    "ean13",
    "ean_13",
    "ean",
    "barcode",
    "barcode_ean13",
    "gtin",
    "gtin13"
  ]));
  const manufacturerSku = normalizeIdentifierValue("manufacturer_sku", column(row, [
    "manufacturer_sku",
    "manufacturer sku",
    "manufacturer_code",
    "manufacturer code",
    "mpn",
    "manufacturer_part_number"
  ]));

  if (productId && matches.byProductId.has(productId)) {
    return {
      ean13,
      manufacturerSku,
      match: matches.byProductId.get(productId) ?? null
    };
  }

  if (ean13 && matches.byIdentifier.has(`ean13:${ean13}`)) {
    return {
      ean13,
      manufacturerSku,
      match: matches.byIdentifier.get(`ean13:${ean13}`) ?? null
    };
  }

  if (manufacturerSku && matches.byIdentifier.has(`manufacturer_sku:${manufacturerSku}`)) {
    return {
      ean13,
      manufacturerSku,
      match: matches.byIdentifier.get(`manufacturer_sku:${manufacturerSku}`) ?? null
    };
  }

  return {
    ean13,
    manufacturerSku,
    match: null
  };
}

function normalizedHygeiaCurrency(row: CsvRow) {
  return normalizeCurrencyCode(column(row, ["currency", "ccy"]), "THB");
}

export async function previewHygeiaImport(input: Readonly<{
  csvText: string;
  importType: HygeiaImportType;
}>): Promise<HygeiaImportPreview> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const rows = parseHygeiaCsv(input.csvText);
  const matches = await approvedIdentifierMatches(sql);
  let unmatchedCount = 0;
  let invalidCount = 0;
  const matchedRows: HygeiaMatchedRow[] = [];

  for (const row of rows) {
    const { ean13, manufacturerSku, match } = rowProductMatch(row, matches);

    if (!match) {
      unmatchedCount += 1;
      continue;
    }

    if (input.importType === "identity" && !ean13 && !manufacturerSku) {
      invalidCount += 1;
      continue;
    }

    matchedRows.push({
      brandName: match.brand_name,
      currency: normalizedHygeiaCurrency(row),
      ean13,
      manufacturerSku,
      productId: match.id,
      productTitle: match.title,
      retailPriceAmount: numberFromColumn(row, [
        "retail_price",
        "retail",
        "rrp",
        "rrp_price",
        "price"
      ]),
      rowNumber: row.rowNumber,
      stockQuantity: integerFromColumn(row, [
        "stock_quantity",
        "stock",
        "quantity",
        "qty",
        "on_hand"
      ]),
      wholesalePriceAmount: numberFromColumn(row, [
        "wholesale_price",
        "wholesale",
        "cost",
        "unit_cost"
      ])
    });
  }

  return {
    invalidCount,
    matchedRows,
    rowCount: rows.length,
    unmatchedCount
  };
}

export async function applyHygeiaImport(input: Readonly<{
  actor?: string | null;
  csvText: string;
  importType: HygeiaImportType;
  organisationId?: string | null;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const preview = await previewHygeiaImport({
    csvText: input.csvText,
    importType: input.importType
  });
  let identifiersApplied = 0;
  let stockRowsUpdated = 0;
  let movementsCreated = 0;
  let costObservationsCreated = 0;

  for (const row of preview.matchedRows) {
    if (input.importType === "identity") {
      const identifiers: ProductIdentifierInput[] = [];

      if (row.ean13) {
        identifiers.push({
          confidence: "trusted",
          evidenceUrl: null,
          source: "hygeia_import",
          type: "ean13",
          value: row.ean13
        });
      }

      if (row.manufacturerSku) {
        identifiers.push({
          confidence: "trusted",
          evidenceUrl: null,
          source: "hygeia_import",
          type: "manufacturer_sku",
          value: row.manufacturerSku
        });
      }

      if (identifiers.length > 0) {
        await replaceApprovedProductIdentifiers(sql, {
          actor: input.actor ?? "hygeia_import",
          identifiers,
          productId: row.productId
        });
        identifiersApplied += identifiers.length;
      }
    }

    if (input.importType === "cost") {
      await sql`
        insert into public.retail_product_cost_observations (
          organisation_id,
          product_id,
          source,
          ean13,
          wholesale_price_amount,
          retail_price_amount,
          currency,
          metadata,
          created_at
        )
        values (
          ${input.organisationId ?? null}::uuid,
          ${row.productId}::uuid,
          'hygeia_import',
          ${row.ean13},
          ${row.wholesalePriceAmount},
          ${row.retailPriceAmount},
          ${row.currency},
          ${sql.json(toJsonValue({
            actor: input.actor ?? "hygeia_import",
            rowNumber: row.rowNumber
          }))}::jsonb,
          now()
        )
      `;
      costObservationsCreated += 1;
    }

    if (input.importType === "stock") {
      if (!input.organisationId) {
        throw new Error("organisationId is required for Hygeia stock imports");
      }

      if (row.stockQuantity === null) {
        continue;
      }

      const approved = await sql<Array<{ approved: boolean }>>`
        select exists (
          select 1
          from public.products
          where id = ${row.productId}::uuid
            and status = 'approved'
        ) as approved
      `;

      if (!approved[0]?.approved) {
        continue;
      }

      const existing = await sql<Array<{
        id: string | null;
        stock_quantity: number | string | null;
      }>>`
        select id::text, stock_quantity
        from public.retail_product_stock
        where organisation_id = ${input.organisationId}::uuid
          and product_id = ${row.productId}::uuid
        limit 1
      `;
      const previousQuantity = Math.max(0, Math.round(Number(existing[0]?.stock_quantity ?? 0)));
      const delta = row.stockQuantity - previousQuantity;
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
          ${input.organisationId}::uuid,
          ${row.productId}::uuid,
          'active',
          ${row.stockQuantity},
          0,
          ${row.wholesalePriceAmount},
          ${row.retailPriceAmount},
          ${row.currency},
          ${sql.json(toJsonValue({ source: "hygeia_import" }))}::jsonb,
          now(),
          now()
        )
        on conflict (organisation_id, product_id)
        do update set
          status = 'active',
          stock_quantity = excluded.stock_quantity,
          wholesale_price_amount = coalesce(excluded.wholesale_price_amount, public.retail_product_stock.wholesale_price_amount),
          retail_price_amount = coalesce(excluded.retail_price_amount, public.retail_product_stock.retail_price_amount),
          currency = excluded.currency,
          metadata = public.retail_product_stock.metadata || excluded.metadata,
          updated_at = now()
        returning id::text
      `;
      const stockId = stockRows[0]?.id;

      stockRowsUpdated += 1;

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
          ${input.organisationId}::uuid,
          ${row.productId}::uuid,
          'active',
          ${row.retailPriceAmount},
          ${row.wholesalePriceAmount},
          ${row.currency},
          0,
          'allow',
          ${sql.json(toJsonValue({
            actor: input.actor ?? "hygeia_import",
            source: "hygeia_import"
          }))}::jsonb,
          now(),
          now()
        )
        on conflict (organisation_id, product_id)
        do update set
          status = 'active',
          rrp_price_amount = coalesce(
            excluded.rrp_price_amount,
            public.retail_sellable_products.rrp_price_amount
          ),
          wholesale_price_amount = coalesce(
            excluded.wholesale_price_amount,
            public.retail_sellable_products.wholesale_price_amount
          ),
          currency = excluded.currency,
          metadata = public.retail_sellable_products.metadata || excluded.metadata,
          updated_at = now()
      `;

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
            ${input.organisationId}::uuid,
            ${row.productId}::uuid,
            ${delta > 0 ? "receive" : "adjustment"},
            ${delta},
            ${row.wholesalePriceAmount},
            ${row.retailPriceAmount},
            ${row.currency},
            'Hygeia stock import',
            'hygeia_import',
            ${sql.json(toJsonValue({
              actor: input.actor ?? "hygeia_import",
              previousQuantity,
              rowNumber: row.rowNumber,
              stockQuantity: row.stockQuantity
            }))}::jsonb,
            now(),
            now()
          )
        `;
        movementsCreated += 1;
      }
    }
  }

  return {
    costObservationsCreated,
    identifiersApplied,
    movementsCreated,
    preview,
    stockRowsUpdated
  };
}

export async function buildHygeiaProductExportCsv(input: Readonly<{
  countryCode?: string | null;
}> = {}) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const countryCode = cleanText(input.countryCode, 8)?.toUpperCase() ?? "TH";
  const rows = await sql<Array<{
    brand_name: string | null;
    currency: string | null;
    ean13: string | null;
    manufacturer_sku: string | null;
    product_id: string;
    product_kind: string;
    rrp_price_amount: string | number | null;
    status: string;
    title: string;
    title_en: string | null;
    title_th: string | null;
  }>>`
    select
      products.id::text as product_id,
      products.brand_name,
      products.title,
      products.product_kind,
      products.status,
      title_en_translation.title as title_en,
      title_th_translation.title as title_th,
      product_countries.rrp_price_amount,
      coalesce(product_countries.currency, products.currency, 'THB') as currency,
      max(product_identifiers.identifier_value) filter (
        where product_identifiers.identifier_type = 'ean13'
      ) as ean13,
      max(product_identifiers.identifier_value) filter (
        where product_identifiers.identifier_type = 'manufacturer_sku'
      ) as manufacturer_sku
    from public.products
    left join public.product_countries
      on product_countries.product_id = products.id
      and product_countries.country_code = ${countryCode}
    left join public.product_translations title_en_translation
      on title_en_translation.product_id = products.id
      and title_en_translation.locale = 'en'
    left join public.product_translations title_th_translation
      on title_th_translation.product_id = products.id
      and title_th_translation.locale = 'th'
    left join public.product_identifiers
      on product_identifiers.product_id = products.id
      and product_identifiers.status = 'active'
      and product_identifiers.identifier_type in ('ean13', 'manufacturer_sku')
    where products.status = 'approved'
    group by
      products.id,
      products.brand_name,
      products.title,
      products.product_kind,
      products.status,
      title_en_translation.title,
      title_th_translation.title,
      product_countries.rrp_price_amount,
      product_countries.currency
    order by products.brand_name nulls last, products.title asc
  `;
  const header = [
    "Internal SKU",
    "Manufacturer SKU",
    "EAN13 Barcode",
    "Thai Product Title",
    "English Product Title",
    "Canonical Product Title",
    "Brand",
    "Product Category",
    "RRP",
    "Currency",
    "Status"
  ];
  const lines = [
    csvLine(header),
    ...rows.map((row) => csvLine([
      row.product_id,
      row.manufacturer_sku,
      row.ean13,
      row.title_th,
      row.title_en,
      row.title,
      row.brand_name,
      row.product_kind,
      row.rrp_price_amount,
      row.currency,
      row.status
    ]))
  ];

  return lines.join("\n") + "\n";
}

export async function buildRetailHygeiaStockExportCsv(input: Readonly<{
  organisationId: string;
}>) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const organisationId = cleanText(input.organisationId, 80);

  if (!isUuidValue(organisationId)) {
    throw new Error("Retail organisation is required for Hygeia stock export");
  }

  const rows = await sql<Array<{
    brand_name: string | null;
    currency: string | null;
    ean13: string | null;
    manufacturer_sku: string | null;
    product_id: string;
    product_kind: string;
    retail_price_amount: string | number | null;
    status: string;
    stock_quantity: string | number;
    title: string;
    title_en: string | null;
    title_th: string | null;
    wholesale_price_amount: string | number | null;
  }>>`
    select
      products.id::text as product_id,
      products.brand_name,
      products.title,
      products.product_kind,
      coalesce(retail_sellable_products.status, retail_product_stock.status) as status,
      retail_product_stock.stock_quantity,
      title_en_translation.title as title_en,
      title_th_translation.title as title_th,
      coalesce(
        retail_sellable_products.wholesale_price_amount,
        retail_product_stock.wholesale_price_amount
      ) as wholesale_price_amount,
      coalesce(
        retail_sellable_products.rrp_price_amount,
        retail_product_stock.retail_price_amount
      ) as retail_price_amount,
      coalesce(
        retail_sellable_products.currency,
        retail_product_stock.currency,
        organisations.currency,
        'THB'
      ) as currency,
      max(product_identifiers.identifier_value) filter (
        where product_identifiers.identifier_type = 'ean13'
      ) as ean13,
      max(product_identifiers.identifier_value) filter (
        where product_identifiers.identifier_type = 'manufacturer_sku'
      ) as manufacturer_sku
    from public.retail_product_stock
    join public.organisations
      on organisations.id = retail_product_stock.organisation_id
      and organisations.organisation_type = 'tenant'
      and organisations.status = 'active'
    join public.products
      on products.id = retail_product_stock.product_id
      and products.status = 'approved'
    left join public.retail_sellable_products
      on retail_sellable_products.organisation_id = retail_product_stock.organisation_id
      and retail_sellable_products.product_id = retail_product_stock.product_id
      and retail_sellable_products.status <> 'deleted'
    left join public.product_translations title_en_translation
      on title_en_translation.product_id = products.id
      and title_en_translation.locale = 'en'
    left join public.product_translations title_th_translation
      on title_th_translation.product_id = products.id
      and title_th_translation.locale = 'th'
    left join public.product_identifiers
      on product_identifiers.product_id = products.id
      and product_identifiers.status = 'active'
      and product_identifiers.identifier_type in ('ean13', 'manufacturer_sku')
    where retail_product_stock.organisation_id = ${organisationId}::uuid
      and retail_product_stock.status <> 'deleted'
    group by
      products.id,
      products.brand_name,
      products.title,
      products.product_kind,
      retail_product_stock.stock_quantity,
      retail_product_stock.status,
      retail_product_stock.wholesale_price_amount,
      retail_product_stock.retail_price_amount,
      retail_product_stock.currency,
      retail_sellable_products.status,
      retail_sellable_products.wholesale_price_amount,
      retail_sellable_products.rrp_price_amount,
      retail_sellable_products.currency,
      organisations.currency,
      title_en_translation.title,
      title_th_translation.title
    order by products.brand_name nulls last, products.title asc
  `;
  const header = [
    "Internal SKU",
    "Manufacturer SKU",
    "EAN13 Barcode",
    "Thai Product Title",
    "English Product Title",
    "Canonical Product Title",
    "Brand",
    "Product Category",
    "Stock Quantity",
    "Wholesale Price",
    "Retail Price",
    "Currency",
    "Status"
  ];
  const lines = [
    csvLine(header),
    ...rows.map((row) => csvLine([
      row.product_id,
      row.manufacturer_sku,
      row.ean13,
      row.title_th,
      row.title_en,
      row.title,
      row.brand_name,
      row.product_kind,
      row.stock_quantity,
      row.wholesale_price_amount,
      row.retail_price_amount,
      row.currency,
      row.status
    ]))
  ];

  return lines.join("\n") + "\n";
}
