import type postgres from "postgres";
import { getSql } from "@/lib/db";

type Db = postgres.Sql | postgres.TransactionSql;

export const DEFAULT_CUSTOMER_PRICE_MARGIN_PERCENT = 10;

function finiteNumber(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeCustomerPriceMarginPercent(value: unknown) {
  const parsed = finiteNumber(value);

  if (parsed === null || parsed < 0 || parsed > 100) {
    return DEFAULT_CUSTOMER_PRICE_MARGIN_PERCENT;
  }

  return parsed;
}

export function customerPriceFromRpp(
  rrpPriceAmount: number | null | undefined,
  marginPercent: number
) {
  const rrp = finiteNumber(rrpPriceAmount);

  if (rrp === null || rrp < 0) {
    return null;
  }

  return Math.round(rrp * (1 + normalizeCustomerPriceMarginPercent(marginPercent) / 100));
}

export function customerPriceMarginPercentFromMetadata(metadata: unknown) {
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata as Record<string, unknown>
      : {};

  return normalizeCustomerPriceMarginPercent(
    record.customerPriceMarginPercent
  );
}

export async function getCustomerPriceMarginPercent(input: Readonly<{
  sql?: Db | null;
}> = {}) {
  const sql = input.sql ?? getSql();

  if (!sql) {
    return DEFAULT_CUSTOMER_PRICE_MARGIN_PERCENT;
  }

  const rows = await sql<Array<{ metadata: unknown }>>`
    select metadata
    from public.organisations
    where lower(slug) = 'mattanutra'
      and organisation_type = 'platform'
    limit 1
  `;

  return customerPriceMarginPercentFromMetadata(rows[0]?.metadata);
}
