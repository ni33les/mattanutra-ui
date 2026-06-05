import { getSql } from "@/lib/db";
import { toJsonValue } from "@/lib/assessment-store";
import {
  normalizeIdentifierValue,
  replaceApprovedProductIdentifiers,
  type ProductIdentifierInput
} from "@/lib/product-identifiers";
import { normalizeCurrencyCode } from "@/lib/product-countries";

export type HygeiaImportType = "identity" | "stock" | "cost";

export type HygeiaMatchedRow = Readonly<{
  brandName: string | null;
  currency: string;
  ean13: string | null;
  internalSku: string | null;
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
      and product_identifiers.identifier_type in ('ean13', 'internal_sku')
    where products.status <> 'ignored'
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
  const productId = cleanText(column(row, [
    "product_id",
    "matta_nutra_product_id",
    "mattanutra_product_id",
    "mattaNutraProductId",
    "id"
  ]), 80);
  const ean13 = normalizeIdentifierValue("ean13", column(row, [
    "ean13",
    "ean_13",
    "ean",
    "barcode",
    "barcode_ean13",
    "gtin",
    "gtin13"
  ]));
  const internalSku = normalizeIdentifierValue("internal_sku", column(row, [
    "internal_sku",
    "matta_nutra_sku",
    "mattanutra_sku",
    "sku"
  ]));

  if (productId && matches.byProductId.has(productId)) {
    return {
      ean13,
      internalSku,
      match: matches.byProductId.get(productId) ?? null
    };
  }

  if (ean13 && matches.byIdentifier.has(`ean13:${ean13}`)) {
    return {
      ean13,
      internalSku,
      match: matches.byIdentifier.get(`ean13:${ean13}`) ?? null
    };
  }

  if (internalSku && matches.byIdentifier.has(`internal_sku:${internalSku}`)) {
    return {
      ean13,
      internalSku,
      match: matches.byIdentifier.get(`internal_sku:${internalSku}`) ?? null
    };
  }

  return {
    ean13,
    internalSku,
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
    const { ean13, internalSku, match } = rowProductMatch(row, matches);

    if (!match) {
      unmatchedCount += 1;
      continue;
    }

    if (input.importType === "identity" && !ean13 && !internalSku) {
      invalidCount += 1;
      continue;
    }

    matchedRows.push({
      brandName: match.brand_name,
      currency: normalizedHygeiaCurrency(row),
      ean13,
      internalSku,
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

      if (row.internalSku) {
        identifiers.push({
          confidence: "trusted",
          evidenceUrl: null,
          source: "hygeia_import",
          type: "internal_sku",
          value: row.internalSku
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
    internal_sku: string | null;
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
        where product_identifiers.identifier_type = 'internal_sku'
      ) as internal_sku
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
      and product_identifiers.identifier_type in ('ean13', 'internal_sku')
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
    "MattaNutra Product ID",
    "MattaNutra SKU",
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
      row.internal_sku,
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
