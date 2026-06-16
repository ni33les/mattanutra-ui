import type postgres from "postgres";
import { getSql } from "@/lib/db";

type Db = postgres.Sql | postgres.TransactionSql;

export const DEFAULT_FLAT_RATE_SHIPPING_AMOUNT = 50;
export const FLAT_RATE_SHIPPING_METADATA_KEY = "flatRateShippingAmount";

export type FlatRateShippingSource =
  | "platform_default"
  | "retail_override"
  | "system_default";

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeFlatRateShippingAmount(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

export function flatRateShippingAmountFromMetadata(metadata: unknown) {
  return normalizeFlatRateShippingAmount(
    recordValue(metadata)[FLAT_RATE_SHIPPING_METADATA_KEY]
  );
}

export async function getPlatformFlatRateShippingAmount(input: Readonly<{
  sql?: Db | null;
}> = {}) {
  const sql = input.sql ?? getSql();

  if (!sql) {
    return DEFAULT_FLAT_RATE_SHIPPING_AMOUNT;
  }

  const rows = await sql<Array<{ metadata: unknown }>>`
    select metadata
    from public.organisations
    where lower(slug) = 'mattanutra'
      and organisation_type = 'platform'
    limit 1
  `;

  return flatRateShippingAmountFromMetadata(rows[0]?.metadata) ??
    DEFAULT_FLAT_RATE_SHIPPING_AMOUNT;
}

export async function resolveFlatRateShippingCharge(input: Readonly<{
  organisationId?: string | null;
  sql?: Db | null;
}> = {}) {
  const sql = input.sql ?? getSql();

  if (!sql) {
    return {
      amount: DEFAULT_FLAT_RATE_SHIPPING_AMOUNT,
      platformAmount: null,
      retailOverrideAmount: null,
      source: "system_default" as FlatRateShippingSource
    };
  }

  const organisationId = input.organisationId?.trim() || null;
  const rows = await sql<Array<{
    platform_metadata: unknown;
    retail_metadata: unknown;
  }>>`
    select
      (
        select metadata
        from public.organisations
        where id = ${organisationId}::uuid
        limit 1
      ) as retail_metadata,
      (
        select metadata
        from public.organisations
        where lower(slug) = 'mattanutra'
          and organisation_type = 'platform'
        limit 1
      ) as platform_metadata
  `;
  const retailOverrideAmount =
    organisationId
      ? flatRateShippingAmountFromMetadata(rows[0]?.retail_metadata)
      : null;
  const platformAmount =
    flatRateShippingAmountFromMetadata(rows[0]?.platform_metadata);

  if (retailOverrideAmount !== null) {
    return {
      amount: retailOverrideAmount,
      platformAmount,
      retailOverrideAmount,
      source: "retail_override" as FlatRateShippingSource
    };
  }

  if (platformAmount !== null) {
    return {
      amount: platformAmount,
      platformAmount,
      retailOverrideAmount,
      source: "platform_default" as FlatRateShippingSource
    };
  }

  return {
    amount: DEFAULT_FLAT_RATE_SHIPPING_AMOUNT,
    platformAmount,
    retailOverrideAmount,
    source: "system_default" as FlatRateShippingSource
  };
}
