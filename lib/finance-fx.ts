import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { getSql } from "@/lib/db";

type FinanceDb = postgres.Sql | postgres.TransactionSql;

export type FinanceFxRate = Readonly<{
  ask: number | null;
  baseCurrency: string;
  bid: number | null;
  expiresAt: string;
  fetchedAt: string;
  id: string;
  mid: number;
  provider: string;
  quoteCurrency: string;
  source: string;
  validAt: string;
}>;

export type ResolvedUsdRate = Readonly<{
  currency: string;
  fallbackUsed: boolean;
  fxRateId: string | null;
  provider: string | null;
  source: string | null;
  usdRate: number;
}>;

type ResolveUsdRateOptions = Readonly<{
  fetcher?: typeof fetch;
  forceFetch?: boolean;
  freshnessMs?: number;
  now?: Date;
  sql?: FinanceDb;
}>;

type FxRateRow = Readonly<{
  ask: string | number | null;
  base_currency: string;
  bid: string | number | null;
  expires_at: Date | string;
  fetched_at: Date | string;
  id: string;
  mid: string | number;
  provider: string;
  quote_currency: string;
  source: string;
  valid_at: Date | string;
}>;

const DEFAULT_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PROVIDER = "exchangerate_host";
const DEFAULT_SOURCE = "exchangerate.host";
const DEFAULT_BASE_URL = "https://api.exchangerate.host";
const USD = "USD";

function configured(value: string | undefined) {
  return value?.trim() ?? "";
}

export function normalizeCurrencyCode(value: string) {
  const currency = value.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Currency must be a three-letter ISO-4217 code");
  }

  return currency;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dateIso(value: Date | string) {
  return new Date(value).toISOString();
}

function rowToRate(row: FxRateRow): FinanceFxRate {
  return {
    ask: positiveNumber(row.ask),
    baseCurrency: row.base_currency,
    bid: positiveNumber(row.bid),
    expiresAt: dateIso(row.expires_at),
    fetchedAt: dateIso(row.fetched_at),
    id: row.id,
    mid: Number(row.mid),
    provider: row.provider,
    quoteCurrency: row.quote_currency,
    source: row.source,
    validAt: dateIso(row.valid_at)
  };
}

function toJsonValue(value: unknown): postgres.JSONValue {
  const serialized = JSON.stringify(value ?? {});

  return serialized ? JSON.parse(serialized) as postgres.JSONValue : {};
}

function freshnessMs(value: number | undefined) {
  if (Number.isFinite(value) && value && value > 0) {
    return Math.min(7 * DEFAULT_FRESHNESS_MS, Math.max(60_000, Math.round(value)));
  }

  const hours = Number(process.env.FINANCE_FX_FRESHNESS_HOURS);

  return Number.isFinite(hours) && hours > 0
    ? Math.min(7 * DEFAULT_FRESHNESS_MS, Math.max(60_000, Math.round(hours * 60 * 60 * 1000)))
    : DEFAULT_FRESHNESS_MS;
}

async function latestFreshRate(
  sql: FinanceDb,
  currency: string,
  now: Date
): Promise<FinanceFxRate | null> {
  const rows = await sql<FxRateRow[]>`
    select
      id::text,
      base_currency,
      quote_currency,
      provider,
      source,
      bid,
      ask,
      mid,
      fetched_at,
      valid_at,
      expires_at
    from public.finance_fx_rates
    where base_currency = ${currency}
      and quote_currency = ${USD}
      and expires_at > ${now}
    order by valid_at desc, fetched_at desc
    limit 1
  `;

  return rows[0] ? rowToRate(rows[0]) : null;
}

function exchangerateHostConfig() {
  return {
    apiKey: configured(process.env.FINANCE_FX_API_KEY) ||
      configured(process.env.EXCHANGERATE_HOST_API_KEY),
    baseUrl: configured(process.env.FINANCE_FX_BASE_URL) || DEFAULT_BASE_URL,
    provider: configured(process.env.FINANCE_FX_PROVIDER) || DEFAULT_PROVIDER,
    source: configured(process.env.FINANCE_FX_SOURCE) || DEFAULT_SOURCE
  };
}

function quoteFromRecord(
  record: Record<string, unknown>,
  key: string
) {
  const value = record[key];

  return positiveNumber(value);
}

export function midpointUsdRateFromExchangerateHostPayload(
  currency: string,
  payload: unknown
) {
  const requested = normalizeCurrencyCode(currency);
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
  const quotes =
    record.quotes && typeof record.quotes === "object" && !Array.isArray(record.quotes)
      ? record.quotes as Record<string, unknown>
      : {};
  const rates =
    record.rates && typeof record.rates === "object" && !Array.isArray(record.rates)
      ? record.rates as Record<string, unknown>
      : {};
  const direct = quoteFromRecord(quotes, `${requested}${USD}`) ??
    quoteFromRecord(rates, USD);
  const inverse = quoteFromRecord(quotes, `${USD}${requested}`) ??
    quoteFromRecord(rates, requested);

  if (direct) {
    return direct;
  }

  if (inverse) {
    return 1 / inverse;
  }

  return null;
}

async function fetchExchangerateHostRate(input: Readonly<{
  currency: string;
  fetcher: typeof fetch;
  freshnessMs: number;
  now: Date;
  sql: FinanceDb;
}>) {
  const config = exchangerateHostConfig();

  if (!config.apiKey) {
    throw new Error("FINANCE_FX_API_KEY or EXCHANGERATE_HOST_API_KEY is required for non-USD FX");
  }

  const url = new URL("/live", config.baseUrl);

  url.searchParams.set("access_key", config.apiKey);
  url.searchParams.set("source", USD);
  url.searchParams.set("currencies", input.currency);

  const response = await input.fetcher(url);

  if (!response.ok) {
    throw new Error(`FX provider returned ${response.status}`);
  }

  const payload = await response.json();
  const mid = midpointUsdRateFromExchangerateHostPayload(input.currency, payload);

  if (!mid) {
    throw new Error("FX provider response did not include the requested rate");
  }

  const validAt =
    payload &&
    typeof payload === "object" &&
    "timestamp" in payload &&
    Number.isFinite(Number((payload as { timestamp?: unknown }).timestamp))
      ? new Date(Number((payload as { timestamp?: unknown }).timestamp) * 1000)
      : input.now;
  const expiresAt = new Date(input.now.getTime() + input.freshnessMs);
  const rows = await input.sql<FxRateRow[]>`
    insert into public.finance_fx_rates (
      id,
      base_currency,
      quote_currency,
      provider,
      source,
      bid,
      ask,
      mid,
      fetched_at,
      valid_at,
      expires_at,
      raw_payload,
      created_at,
      updated_at
    )
    values (
      ${randomUUID()}::uuid,
      ${input.currency},
      ${USD},
      ${config.provider},
      ${config.source},
      null,
      null,
      ${mid},
      ${input.now},
      ${validAt},
      ${expiresAt},
      ${input.sql.json(toJsonValue(payload))},
      now(),
      now()
    )
    returning
      id::text,
      base_currency,
      quote_currency,
      provider,
      source,
      bid,
      ask,
      mid,
      fetched_at,
      valid_at,
      expires_at
  `;

  if (!rows[0]) {
    throw new Error("FX rate was not recorded");
  }

  return rowToRate(rows[0]);
}

export async function resolveUsdRateForCurrency(
  value: string,
  options: ResolveUsdRateOptions = {}
): Promise<ResolvedUsdRate> {
  const currency = normalizeCurrencyCode(value);

  if (currency === USD) {
    return {
      currency,
      fallbackUsed: false,
      fxRateId: null,
      provider: null,
      source: null,
      usdRate: 1
    };
  }

  const sql = options.sql ?? getSql();

  if (!sql) {
    throw new Error("Database is required to resolve non-USD FX");
  }

  const now = options.now ?? new Date();
  const maxAge = freshnessMs(options.freshnessMs);
  const existing = options.forceFetch ? null : await latestFreshRate(sql, currency, now);

  if (existing) {
    return {
      currency,
      fallbackUsed: false,
      fxRateId: existing.id,
      provider: existing.provider,
      source: existing.source,
      usdRate: existing.mid
    };
  }

  try {
    const fetched = await fetchExchangerateHostRate({
      currency,
      fetcher: options.fetcher ?? fetch,
      freshnessMs: maxAge,
      now,
      sql
    });

    return {
      currency,
      fallbackUsed: false,
      fxRateId: fetched.id,
      provider: fetched.provider,
      source: fetched.source,
      usdRate: fetched.mid
    };
  } catch (error) {
    const fallback = await latestFreshRate(sql, currency, now);

    if (fallback) {
      return {
        currency,
        fallbackUsed: true,
        fxRateId: fallback.id,
        provider: fallback.provider,
        source: fallback.source,
        usdRate: fallback.mid
      };
    }

    throw error;
  }
}
