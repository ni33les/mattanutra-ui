import type postgres from "postgres";
import { getSql } from "@/lib/db";
import {
  recordAdminAudit,
  type AdminOrganisation,
  type AdminSessionContext
} from "@/lib/admin-access";
import { hasAdminPermission } from "@/lib/admin-rbac";
import type { Locale } from "@/lib/i18n";

type Db = NonNullable<ReturnType<typeof getSql>>;
type StockDb = postgres.Sql | postgres.TransactionSql;

export type RetailStockStatus = "active" | "disabled" | "deleted";

export type AdminRetailStockOrganisation = Readonly<{
  currency: string;
  id: string;
  name: string;
  status: AdminOrganisation["status"];
}>;

export type AdminRetailStockProductOption = Readonly<{
  brandName: string | null;
  id: string;
  imageUrl: string | null;
  productKind: string;
  title: string;
}>;

export type AdminRetailStockRow = Readonly<{
  brandName: string | null;
  currency: string;
  expiresAt: string | null;
  id: string;
  imageUrl: string | null;
  leadTimeDays: number;
  notes: string | null;
  organisationId: string;
  organisationName: string;
  productId: string;
  productKind: string;
  productStatus: string;
  productTitle: string;
  retailPriceAmount: number | null;
  status: RetailStockStatus;
  stockQuantity: number;
  updatedAt: string;
  wholesalePriceAmount: number | null;
}>;

export type AdminRetailStockData = Readonly<{
  canFilterOrganisation: boolean;
  canWrite: boolean;
  databaseAvailable: boolean;
  generatedAt: string;
  organisations: AdminRetailStockOrganisation[];
  productOptions: AdminRetailStockProductOption[];
  rows: AdminRetailStockRow[];
}>;

export type UpsertRetailStockItemInput = Readonly<{
  expiresAt?: string | null;
  leadTimeDays?: number | null;
  notes?: string | null;
  organisationId?: string | null;
  productId: string;
  retailPriceAmount?: number | null;
  status?: RetailStockStatus;
  stockQuantity?: number | null;
  wholesalePriceAmount?: number | null;
}>;

function normalizeCurrency(value: string | null | undefined, type: string) {
  const currency = value?.trim().toUpperCase() ?? "";

  return /^[A-Z]{3}$/.test(currency)
    ? currency
    : type === "platform"
      ? "USD"
      : "THB";
}

function stockStatus(value: unknown): RetailStockStatus {
  return value === "disabled" || value === "deleted" ? value : "active";
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function isoDateOrNull(value: unknown) {
  if (!value) {
    return null;
  }

  const date = new Date(String(value));

  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function isoDateTime(value: Date | string) {
  return new Date(value).toISOString();
}

function canWriteRetailStock(context: AdminSessionContext) {
  return hasAdminPermission(context, "stock.write") && !context.isLegacy;
}

function canReadAllRetailStock(context: AdminSessionContext) {
  return context.effectiveOrganisation.type === "platform";
}

function canAccessRetailOrganisation(
  context: AdminSessionContext,
  organisationId: string
) {
  return canReadAllRetailStock(context) ||
    organisationId === context.effectiveOrganisation.id;
}

function localizedProductTitleExpression(
  sql: StockDb,
  locale: Locale
) {
  return sql`
    coalesce(
      nullif(product_translations.title, ''),
      case
        when ${locale} = 'th' then nullif(products.title_th, '')
        when ${locale} = 'en' then nullif(products.title_en, '')
        else null
      end,
      nullif(products.title, ''),
      'Untitled product'
    )
  `;
}

async function loadRetailOrganisations(
  sql: Db,
  context: AdminSessionContext
): Promise<AdminRetailStockOrganisation[]> {
  const rows = canReadAllRetailStock(context)
    ? await sql<Array<{
        currency: string | null;
        id: string;
        name: string;
        organisation_type: string;
        status: string;
      }>>`
        select id::text, name, organisation_type, status, currency
        from public.organisations
        where organisation_type = 'tenant'
          and status = 'active'
        order by lower(name)
      `
    : await sql<Array<{
        currency: string | null;
        id: string;
        name: string;
        organisation_type: string;
        status: string;
      }>>`
        select id::text, name, organisation_type, status, currency
        from public.organisations
        where id = ${context.effectiveOrganisation.id}::uuid
          and organisation_type = 'tenant'
          and status = 'active'
        limit 1
      `;

  return rows.map((row) => ({
    currency: normalizeCurrency(row.currency, row.organisation_type),
    id: row.id,
    name: row.name,
    status:
      row.status === "active" || row.status === "archived" || row.status === "disabled"
        ? row.status
        : "disabled"
  }));
}

async function productApproved(sql: Db, productId: string) {
  const rows = await sql<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from public.products
      where id = ${productId}::uuid
        and status = 'approved'
    ) as exists
  `;

  return Boolean(rows[0]?.exists);
}

async function organisationForStockWrite(
  sql: Db,
  context: AdminSessionContext,
  organisationId: string | null | undefined
) {
  const id = canReadAllRetailStock(context)
    ? organisationId
    : context.effectiveOrganisation.id;

  if (!id) {
    throw new Error("Retail organisation is required");
  }

  const rows = await sql<Array<{
    currency: string | null;
    id: string;
    name: string;
    organisation_type: string;
    status: string;
  }>>`
    select id::text, name, organisation_type, status, currency
    from public.organisations
    where id = ${id}::uuid
      and organisation_type = 'tenant'
    limit 1
  `;
  const row = rows[0];

  if (!row || row.status !== "active" || !canAccessRetailOrganisation(context, row.id)) {
    throw new Error("Retail organisation is not available");
  }

  return {
    currency: normalizeCurrency(row.currency, row.organisation_type),
    id: row.id,
    name: row.name
  };
}

export function emptyAdminRetailStockData(): AdminRetailStockData {
  return {
    canFilterOrganisation: false,
    canWrite: false,
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    organisations: [],
    productOptions: [],
    rows: []
  };
}

export async function getAdminRetailStockData(
  context: AdminSessionContext,
  locale: Locale
): Promise<AdminRetailStockData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminRetailStockData();
  }

  const organisations = await loadRetailOrganisations(sql, context);
  const organisationIds = organisations.map((organisation) => organisation.id);
  const productTitle = localizedProductTitleExpression(sql, locale);
  const [stockRows, productRows] = organisationIds.length === 0
    ? [[], await sql<Array<{
        brand_name: string | null;
        id: string;
        image_url: string | null;
        product_kind: string;
        title: string;
      }>>`
        select
          products.id::text,
          ${productTitle} as title,
          products.brand_name,
          products.image_url,
          products.product_kind
        from public.products
        left join public.product_translations
          on product_translations.product_id = products.id
          and product_translations.locale = ${locale}
          and product_translations.status <> 'missing'
        where products.status = 'approved'
        order by lower(${productTitle}), lower(coalesce(products.brand_name, ''))
        limit 1000
      `]
    : await Promise.all([
        sql<Array<{
          brand_name: string | null;
          currency: string;
          expires_at: Date | string | null;
          id: string;
          image_url: string | null;
          lead_time_days: number | string;
          notes: string | null;
          organisation_id: string;
          organisation_name: string;
          product_id: string;
          product_kind: string;
          product_status: string;
          product_title: string;
          retail_price_amount: string | number | null;
          status: string;
          stock_quantity: number | string;
          updated_at: Date | string;
          wholesale_price_amount: string | number | null;
        }>>`
          select
            retail_product_stock.id::text,
            retail_product_stock.organisation_id::text,
            organisations.name as organisation_name,
            retail_product_stock.product_id::text,
            ${productTitle} as product_title,
            products.brand_name,
            products.image_url,
            products.product_kind,
            products.status as product_status,
            retail_product_stock.status,
            retail_product_stock.stock_quantity,
            retail_product_stock.lead_time_days,
            retail_product_stock.wholesale_price_amount,
            retail_product_stock.retail_price_amount,
            retail_product_stock.currency,
            retail_product_stock.expires_at,
            retail_product_stock.notes,
            retail_product_stock.updated_at
          from public.retail_product_stock
          join public.organisations
            on organisations.id = retail_product_stock.organisation_id
          join public.products
            on products.id = retail_product_stock.product_id
          left join public.product_translations
            on product_translations.product_id = products.id
            and product_translations.locale = ${locale}
            and product_translations.status <> 'missing'
          where retail_product_stock.organisation_id = any(${organisationIds}::uuid[])
            and retail_product_stock.status <> 'deleted'
          order by lower(organisations.name), lower(${productTitle})
        `,
        sql<Array<{
          brand_name: string | null;
          id: string;
          image_url: string | null;
          product_kind: string;
          title: string;
        }>>`
          select
            products.id::text,
            ${productTitle} as title,
            products.brand_name,
            products.image_url,
            products.product_kind
          from public.products
          left join public.product_translations
            on product_translations.product_id = products.id
            and product_translations.locale = ${locale}
            and product_translations.status <> 'missing'
          where products.status = 'approved'
          order by lower(${productTitle}), lower(coalesce(products.brand_name, ''))
          limit 1000
        `
      ]);

  return {
    canFilterOrganisation: canReadAllRetailStock(context),
    canWrite: canWriteRetailStock(context),
    databaseAvailable: true,
    generatedAt: new Date().toISOString(),
    organisations,
    productOptions: productRows.map((row) => ({
      brandName: row.brand_name,
      id: row.id,
      imageUrl: row.image_url,
      productKind: row.product_kind,
      title: row.title
    })),
    rows: stockRows.map((row) => ({
      brandName: row.brand_name,
      currency: row.currency,
      expiresAt: isoDateOrNull(row.expires_at),
      id: row.id,
      imageUrl: row.image_url,
      leadTimeDays: integerOrDefault(row.lead_time_days, 0),
      notes: row.notes,
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      productId: row.product_id,
      productKind: row.product_kind,
      productStatus: row.product_status,
      productTitle: row.product_title,
      retailPriceAmount: numberOrNull(row.retail_price_amount),
      status: stockStatus(row.status),
      stockQuantity: integerOrDefault(row.stock_quantity, 0),
      updatedAt: isoDateTime(row.updated_at),
      wholesalePriceAmount: numberOrNull(row.wholesale_price_amount)
    }))
  };
}

export async function upsertRetailStockItem(
  context: AdminSessionContext,
  input: UpsertRetailStockItemInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const organisation = await organisationForStockWrite(
    sql,
    context,
    input.organisationId
  );
  const productId = input.productId.trim();

  if (!(await productApproved(sql, productId))) {
    throw new Error("Only approved master products can be stocked");
  }

  const existingRows = await sql<Array<{ id: string; status: string }>>`
    select id::text, status
    from public.retail_product_stock
    where organisation_id = ${organisation.id}::uuid
      and product_id = ${productId}::uuid
    limit 1
  `;
  const status = stockStatus(input.status);
  const retailPriceAmount = numberOrNull(input.retailPriceAmount);
  const wholesalePriceAmount = numberOrNull(input.wholesalePriceAmount);

  if (status === "active" && retailPriceAmount === null) {
    throw new Error("Retail price is required for active stock");
  }

  const rows = await sql<Array<{ id: string }>>`
    insert into public.retail_product_stock (
      organisation_id,
      product_id,
      status,
      stock_quantity,
      lead_time_days,
      wholesale_price_amount,
      retail_price_amount,
      currency,
      expires_at,
      notes,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${organisation.id}::uuid,
      ${productId}::uuid,
      ${status},
      ${integerOrDefault(input.stockQuantity, 0)},
      ${integerOrDefault(input.leadTimeDays, 0)},
      ${wholesalePriceAmount},
      ${retailPriceAmount},
      ${organisation.currency},
      ${isoDateOrNull(input.expiresAt)},
      ${input.notes?.trim() || null},
      ${sql.json({
        updatedByPersonId: context.actorPerson.id,
        updatedVia: "admin_stock"
      })},
      now(),
      now()
    )
    on conflict (organisation_id, product_id)
    do update set
      status = excluded.status,
      stock_quantity = excluded.stock_quantity,
      lead_time_days = excluded.lead_time_days,
      wholesale_price_amount = excluded.wholesale_price_amount,
      retail_price_amount = excluded.retail_price_amount,
      currency = excluded.currency,
      expires_at = excluded.expires_at,
      notes = excluded.notes,
      metadata = retail_product_stock.metadata || excluded.metadata,
      updated_at = now()
    returning id::text
  `;

  const id = rows[0]?.id ?? null;

  if (id) {
    await recordAdminAudit({
      action: existingRows[0] ? "admin.stock_updated" : "admin.stock_created",
      actorPersonId: context.actorPerson.id,
      assumedPersonId: context.assumedPerson?.id ?? null,
      organisationId: organisation.id,
      resourceId: id,
      resourceType: "retail_product_stock",
      metadata: {
        currency: organisation.currency,
        expiresAt: isoDateOrNull(input.expiresAt),
        leadTimeDays: integerOrDefault(input.leadTimeDays, 0),
        previousStatus: existingRows[0]?.status ?? null,
        productId,
        retailPriceAmount,
        status,
        stockQuantity: integerOrDefault(input.stockQuantity, 0),
        wholesalePriceAmount
      }
    });
  }

  return id;
}

export async function setRetailStockStatus(
  context: AdminSessionContext,
  input: Readonly<{
    id: string;
    status: RetailStockStatus;
  }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const rows = await sql<Array<{ id: string; organisation_id: string }>>`
    update public.retail_product_stock
    set
      status = ${stockStatus(input.status)},
      metadata = metadata || ${sql.json({
        statusUpdatedByPersonId: context.actorPerson.id,
        statusUpdatedVia: "admin_stock"
      })},
      updated_at = now()
    where id = ${input.id.trim()}::uuid
      and organisation_id in (
        select id
        from public.organisations
        where organisation_type = 'tenant'
          and status = 'active'
          and (
            ${canReadAllRetailStock(context)}::boolean
            or id = ${context.effectiveOrganisation.id}::uuid
          )
      )
    returning id::text, organisation_id::text
  `;

  if (!rows[0]) {
    throw new Error("Stock row not found");
  }

  await recordAdminAudit({
    action: "admin.stock_status_updated",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: rows[0].organisation_id,
    resourceId: rows[0].id,
    resourceType: "retail_product_stock",
    metadata: {
      status: stockStatus(input.status)
    }
  });

  return rows[0].id;
}
