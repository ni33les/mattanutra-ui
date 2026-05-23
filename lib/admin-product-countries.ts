import { getSql } from "@/lib/db";
import { toJsonValue } from "@/lib/assessment-store";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode,
  normalizeProductCountryCodes,
  type ProductCountryCode
} from "@/lib/product-countries";
import {
  normalizeSubmittedProductCountryCodes,
  productCountryCodesFromDb,
  isUuidValue
} from "./admin-product-helpers";

// Admin-specific product/brand country management logic.
// Extracted as part of Sprint 2 god-module split.

export async function loadBrandCountryCodes(
  sql: NonNullable<ReturnType<typeof getSql>>,
  brandId: string | null | undefined,
  fallback: readonly string[] = [defaultProductCountryCode]
): Promise<ProductCountryCode[]> {
  if (!brandId) {
    return normalizeProductCountryCodes([], fallback);
  }

  const rows = await sql<Array<{ country_code: string }>>`
    select country_code
    from public.product_brand_countries
    where brand_id = ${brandId}::uuid
    order by country_code asc
  `;

  return normalizeProductCountryCodes(
    rows.map((row) => row.country_code),
    fallback
  );
}

export async function loadProductCountryCodes(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productId: string,
  fallback: readonly string[] = [defaultProductCountryCode]
): Promise<ProductCountryCode[]> {
  const rows = await sql<Array<{ country_code: string }>>`
    select country_code
    from public.product_countries
    where product_id = ${productId}::uuid
    order by country_code asc
  `;

  return normalizeProductCountryCodes(
    rows.map((row) => row.country_code),
    fallback
  );
}

export async function ensureBrandCountryCodes(
  sql: NonNullable<ReturnType<typeof getSql>>,
  brandId: string | null | undefined,
  countryCodes: readonly string[]
): Promise<ProductCountryCode[]> {
  if (!brandId) {
    return normalizeProductCountryCodes(countryCodes);
  }

  const codes = normalizeProductCountryCodes(countryCodes);

  await sql`
    insert into public.product_brand_countries (
      brand_id,
      country_code,
      created_at,
      updated_at
    )
    select
      ${brandId}::uuid,
      country_code,
      now(),
      now()
    from unnest(${codes}::text[]) as input(country_code)
    on conflict (brand_id, country_code) do update set
      updated_at = excluded.updated_at
  `;

  return loadBrandCountryCodes(sql, brandId, codes);
}

export async function replaceBrandCountryCodes(
  sql: NonNullable<ReturnType<typeof getSql>>,
  brandId: string,
  countryCodes: readonly string[]
): Promise<ProductCountryCode[]> {
  const codes = normalizeSubmittedProductCountryCodes(
    countryCodes,
    "Manufacturer countries"
  );

  await sql`
    delete from public.product_brand_countries
    where brand_id = ${brandId}::uuid
      and country_code <> all(${codes}::text[])
  `;

  await ensureBrandCountryCodes(sql, brandId, codes);

  return codes;
}

export async function replaceProductCountryCodes(
  sql: NonNullable<ReturnType<typeof getSql>>,
  productId: string,
  countryCodes: readonly string[]
): Promise<ProductCountryCode[]> {
  const codes = normalizeSubmittedProductCountryCodes(
    countryCodes,
    "Product countries"
  );

  await sql`
    delete from public.product_countries
    where product_id = ${productId}::uuid
      and country_code <> all(${codes}::text[])
  `;

  await sql`
    insert into public.product_countries (
      product_id,
      country_code,
      created_at,
      updated_at
    )
    select
      ${productId}::uuid,
      country_code,
      now(),
      now()
    from unnest(${codes}::text[]) as input(country_code)
    on conflict (product_id, country_code) do update set
      updated_at = excluded.updated_at
  `;

  return codes;
}

export async function reconcileProductsForBrandCountryCodes(
  sql: NonNullable<ReturnType<typeof getSql>>,
  brandId: string,
  countryCodes: readonly ProductCountryCode[]
) {
  const codes = normalizeSubmittedProductCountryCodes(
    countryCodes,
    "Manufacturer countries"
  );

  await sql`
    delete from public.product_countries
    using public.products
    where product_countries.product_id = products.id
      and products.brand_id = ${brandId}::uuid
      and product_countries.country_code <> all(${codes}::text[])
  `;

  await sql`
    insert into public.product_countries (
      product_id,
      country_code,
      created_at,
      updated_at
    )
    select
      products.id,
      input.country_code,
      now(),
      now()
    from public.products
    cross join unnest(${codes}::text[]) as input(country_code)
    where products.brand_id = ${brandId}::uuid
    on conflict (product_id, country_code) do update set
      updated_at = excluded.updated_at
  `;

  return codes;
}

export async function updateProductBrandCountries(
  input: Readonly<{
    actor?: string | null;
    brandId: string;
    countryCodes: readonly string[];
  }>
) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  if (!isUuidValue(input.brandId)) {
    throw new Error("Valid brandId is required");
  }

  await replaceBrandCountryCodes(sql, input.brandId, input.countryCodes);

  await sql`
    insert into public.product_admin_audit (
      action,
      actor,
      after_payload
    )
    values (
      'brand_countries_updated',
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(toJsonValue({ brandId: input.brandId, countryCodes: input.countryCodes }))}::jsonb
    )
  `;

  return true;
}
