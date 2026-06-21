import type { AdminSessionContext } from "@/lib/admin-access";
import {
  canAccessRetailOrganisation,
  canReadAllRetailStock,
  canRouteRegionalCheckout
} from "@/lib/admin-retail-stock-access";
import { normalizeCurrency } from "@/lib/admin-retail-stock-codecs";
import type {
  AdminRetailStockOrganisation,
  Db,
  StockDb
} from "@/lib/admin-retail-stock-types";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";

export async function loadRetailOrganisations(
  sql: Db,
  context: AdminSessionContext
): Promise<AdminRetailStockOrganisation[]> {
  const rows = canReadAllRetailStock(context)
    ? await sql<Array<{
        country_code: string | null;
        currency: string | null;
        id: string;
        name: string;
        organisation_type: string;
        status: string;
      }>>`
        select id::text, name, organisation_type, status, currency, country_code
        from public.organisations
        where organisation_type = 'tenant'
          and status = 'active'
        order by lower(name)
      `
    : await sql<Array<{
        country_code: string | null;
        currency: string | null;
        id: string;
        name: string;
        organisation_type: string;
        status: string;
      }>>`
        select id::text, name, organisation_type, status, currency, country_code
        from public.organisations
        where id = ${context.effectiveOrganisation.id}::uuid
          and organisation_type = 'tenant'
          and status = 'active'
        limit 1
      `;

  return rows.map((row) => ({
    countryCode:
      normalizeProductCountryCode(row.country_code) ?? defaultProductCountryCode,
    currency: normalizeCurrency(row.currency, row.organisation_type),
    id: row.id,
    name: row.name,
    status:
      row.status === "active" || row.status === "archived" || row.status === "disabled"
        ? row.status
        : "disabled"
  }));
}

export async function productApproved(sql: StockDb, productId: string) {
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

export async function organisationForStockWrite(
  sql: StockDb,
  context: AdminSessionContext,
  organisationId: string | null | undefined,
  options: Readonly<{ allowPlatformActorAll?: boolean }> = {}
) {
  const canUseAnyOrganisation =
    canReadAllRetailStock(context) ||
    (options.allowPlatformActorAll && canRouteRegionalCheckout(context));
  const id = canUseAnyOrganisation
    ? organisationId
    : context.effectiveOrganisation.id;

  if (!id) {
    throw new Error("Retail organisation is required");
  }

  const rows = await sql<Array<{
    country_code: string | null;
    currency: string | null;
    id: string;
    name: string;
    organisation_type: string;
    status: string;
  }>>`
    select id::text, name, organisation_type, status, currency, country_code
    from public.organisations
    where id = ${id}::uuid
      and organisation_type = 'tenant'
    limit 1
  `;
  const row = rows[0];

  if (
    !row ||
    row.status !== "active" ||
    (!canUseAnyOrganisation && !canAccessRetailOrganisation(context, row.id))
  ) {
    throw new Error("Retail organisation is not available");
  }

  return {
    countryCode:
      normalizeProductCountryCode(row.country_code) ?? defaultProductCountryCode,
    currency: normalizeCurrency(row.currency, row.organisation_type),
    id: row.id,
    name: row.name
  };
}
