import type postgres from "postgres";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import {
  productFactAliasKeys,
  productKeysMatch,
  type ProductCandidate,
  type ProductRecommendationNeed
} from "@/lib/product-recommendations";

export type SupplementCountryAvailabilityStatus = "allowed" | "blocked";

export type SupplementCountryAvailability = Readonly<{
  countryCode: string;
  reason: string | null;
  source: string | null;
  status: SupplementCountryAvailabilityStatus;
  updatedAt: string | null;
}>;

export type SupplementEffectiveAvailability = Readonly<{
  aliases: readonly string[];
  countryCode: string;
  explicit: boolean;
  globalListStatus: string | null;
  globalActive: boolean;
  name: string;
  normalizedName: string;
  reason: string | null;
  source: string | null;
  status: SupplementCountryAvailabilityStatus;
  supplementId: string;
  updatedAt: string | null;
}>;

export type SupplementAvailabilityLookup = Readonly<{
  byKey: ReadonlyMap<string, SupplementEffectiveAvailability>;
  bySupplementId: ReadonlyMap<string, SupplementEffectiveAvailability>;
  countryCode: string;
}>;

type Db = postgres.Sql | postgres.TransactionSql;

const AVAILABILITY_TTL_MS = 10 * 60_000;

const globalAvailability = globalThis as typeof globalThis & {
  mattanutraSupplementAvailabilityCache?: Map<
    string,
    { at: number; lookup: SupplementAvailabilityLookup }
  >;
  mattanutraSupplementAvailabilityInflight?: Map<
    string,
    Promise<SupplementAvailabilityLookup>
  >;
};

function availabilityCache() {
  globalAvailability.mattanutraSupplementAvailabilityCache ??= new Map();

  return globalAvailability.mattanutraSupplementAvailabilityCache;
}

function availabilityInflight() {
  globalAvailability.mattanutraSupplementAvailabilityInflight ??= new Map();

  return globalAvailability.mattanutraSupplementAvailabilityInflight;
}

function emptyAvailabilityLookup(
  countryCode: string
): SupplementAvailabilityLookup {
  return {
    byKey: new Map(),
    bySupplementId: new Map(),
    countryCode
  };
}

type AvailabilityRow = Readonly<{
  aliases: string[] | null;
  country_code: string | null;
  explicit_status: string | null;
  global_active: boolean;
  global_list_status: string | null;
  name: string;
  normalized_name: string;
  reason: string | null;
  source: string | null;
  status: string | null;
  supplement_id: string;
  updated_at: Date | string | null;
}>;

export function normalizeSupplementAvailabilityCountryCode(
  value: string | null | undefined
) {
  return normalizeProductCountryCode(value ?? defaultProductCountryCode) ??
    defaultProductCountryCode;
}

export function isSupplementCountryAvailabilityStatus(
  value: unknown
): value is SupplementCountryAvailabilityStatus {
  return value === "allowed" || value === "blocked";
}

function normalizedKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function mappedStatus(value: unknown): SupplementCountryAvailabilityStatus {
  return value === "blocked" ? "blocked" : "allowed";
}

function isoString(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

export function resetSupplementAvailabilityCache() {
  availabilityCache().clear();
  availabilityInflight().clear();
}

export function emptySupplementAvailabilityLookup(
  countryCode = defaultProductCountryCode
): SupplementAvailabilityLookup {
  return {
    byKey: new Map(),
    bySupplementId: new Map(),
    countryCode: normalizeSupplementAvailabilityCountryCode(countryCode)
  };
}

export function supplementAvailabilityLookupFromRows(
  rows: readonly AvailabilityRow[],
  countryCode: string
): SupplementAvailabilityLookup {
  const bySupplementId = new Map<string, SupplementEffectiveAvailability>();
  const byKey = new Map<string, SupplementEffectiveAvailability>();
  const normalizedCountryCode =
    normalizeSupplementAvailabilityCountryCode(countryCode);

  for (const row of rows) {
    const status = mappedStatus(row.status);
    const item: SupplementEffectiveAvailability = {
      aliases: row.aliases ?? [],
      countryCode: row.country_code ?? normalizedCountryCode,
      explicit: isSupplementCountryAvailabilityStatus(row.explicit_status),
      globalActive: row.global_active,
      globalListStatus: row.global_list_status,
      name: row.name,
      normalizedName: row.normalized_name,
      reason: row.reason,
      source: row.source,
      status,
      supplementId: row.supplement_id,
      updatedAt: isoString(row.updated_at)
    };
    const keys = [
      row.supplement_id,
      row.normalized_name,
      normalizedKey(row.name),
      ...(row.aliases ?? [])
    ].filter(Boolean);

    bySupplementId.set(row.supplement_id, item);

    for (const key of keys) {
      byKey.set(key, item);
      byKey.set(normalizedKey(key), item);
    }
  }

  return {
    byKey,
    bySupplementId,
    countryCode: normalizedCountryCode
  };
}

export async function getSupplementEffectiveAvailability(
  sql: Db,
  countryCodeInput?: string | null
): Promise<SupplementAvailabilityLookup> {
  const countryCode = normalizeSupplementAvailabilityCountryCode(countryCodeInput);
  const rows = await sql<AvailabilityRow[]>`
    select
      supplements.id::text as supplement_id,
      supplements.name,
      supplements.normalized_name,
      supplements.list_status as global_list_status,
      supplements.is_active as global_active,
      coalesce(table_rule.country_code, json_rule.country_code) as country_code,
      coalesce(table_rule.status, json_rule.status) as explicit_status,
      case
        when table_rule.status in ('allowed', 'blocked') then table_rule.status
        when json_rule.status in ('allowed', 'blocked') then json_rule.status
        when supplements.is_active = false then 'blocked'
        when supplements.list_status = 'blocked' then 'blocked'
        else 'allowed'
      end as status,
      coalesce(table_rule.reason, json_rule.reason) as reason,
      coalesce(table_rule.source, json_rule.source) as source,
      greatest(
        supplements.updated_at,
        supplements.updated_at
      ) as updated_at,
      coalesce(
        array_remove(array_agg(distinct supplement_aliases.normalized_alias), null),
        '{}'::text[]
      ) as aliases
    from public.supplements supplements
    left join public.supplement_country_availability table_rule
      on table_rule.supplement_id = supplements.id
      and table_rule.country_code = ${countryCode}
    left join lateral (
      select
        coalesce(rule."countryCode", rule.country_code) as country_code,
        rule.status,
        rule.reason,
        coalesce(rule.source, 'supplement_source_payload') as source
      from jsonb_to_recordset(
        case
          when jsonb_typeof(supplements.source_payload -> 'countryAvailability') = 'array'
            then supplements.source_payload -> 'countryAvailability'
          else '[]'::jsonb
        end
      ) as rule(
        "countryCode" text,
        country_code text,
        status text,
        reason text,
        source text
      )
      where coalesce(rule."countryCode", rule.country_code) = ${countryCode}
        and rule.status in ('allowed', 'blocked')
      limit 1
    ) json_rule on true
    left join public.supplement_aliases
      on supplement_aliases.supplement_id = supplements.id
    where coalesce(supplements.source_payload ->> 'deleted', 'false') <> 'true'
    group by
      supplements.id,
      supplements.name,
      supplements.normalized_name,
      supplements.list_status,
      supplements.is_active,
      supplements.updated_at,
      table_rule.country_code,
      table_rule.status,
      table_rule.reason,
      table_rule.source,
      json_rule.country_code,
      json_rule.status,
      json_rule.reason,
      json_rule.source
  `;

  return supplementAvailabilityLookupFromRows(rows, countryCode);
}

export async function warmSupplementEffectiveAvailability(
  countryCodeInput?: string | null
) {
  if (process.env.NODE_TEST_CONTEXT) {
    return emptyAvailabilityLookup(
      normalizeSupplementAvailabilityCountryCode(countryCodeInput)
    );
  }

  const { getSql } = await import("@/lib/db");
  const sql = getSql();

  if (!sql) {
    return emptyAvailabilityLookup(
      normalizeSupplementAvailabilityCountryCode(countryCodeInput)
    );
  }

  return cachedSupplementEffectiveAvailability(sql, countryCodeInput);
}

export async function cachedSupplementEffectiveAvailability(
  sql: Db,
  countryCodeInput?: string | null
): Promise<SupplementAvailabilityLookup> {
  const countryCode = normalizeSupplementAvailabilityCountryCode(countryCodeInput);

  if (process.env.NODE_TEST_CONTEXT) {
    return emptyAvailabilityLookup(countryCode);
  }

  const hit = availabilityCache().get(countryCode);

  if (hit && Date.now() - hit.at < AVAILABILITY_TTL_MS) {
    return hit.lookup;
  }

  const inflight = availabilityInflight().get(countryCode);

  if (inflight) {
    return inflight;
  }

  const pending = getSupplementEffectiveAvailability(sql, countryCode)
    .then((lookup) => {
      availabilityCache().set(countryCode, { at: Date.now(), lookup });

      return lookup;
    })
    .finally(() => {
      if (availabilityInflight().get(countryCode) === pending) {
        availabilityInflight().delete(countryCode);
      }
    });

  availabilityInflight().set(countryCode, pending);

  return pending;
}

export function requireCachedSupplementEffectiveAvailability(
  countryCodeInput?: string | null
): SupplementAvailabilityLookup {
  const countryCode = normalizeSupplementAvailabilityCountryCode(countryCodeInput);

  if (process.env.NODE_TEST_CONTEXT) {
    return emptyAvailabilityLookup(countryCode);
  }

  const hit = availabilityCache().get(countryCode);

  if (hit && Date.now() - hit.at < AVAILABILITY_TTL_MS) {
    return hit.lookup;
  }

  throw new Error("Product matching supplement availability is not ready");
}

export function enrichProductNeedsWithAvailabilityLookup(
  needs: readonly ProductRecommendationNeed[],
  lookup: SupplementAvailabilityLookup
): ProductRecommendationNeed[] {
  return needs.map((need) => {
    if (need.itemType !== "supplement") {
      return need;
    }

    const matched = availabilityForNeed(lookup, need);
    const extra = matched
      ? [matched.normalizedName, matched.name, ...matched.aliases]
      : [];
    const aliasKeys = [
      ...productFactAliasKeys(need.displayName, need.aliasKeys),
      ...extra.flatMap((alias) => productFactAliasKeys(alias))
    ];

    return {
      ...need,
      aliasKeys: [...new Set(aliasKeys)]
    };
  });
}

function availabilityForNeed(
  lookup: SupplementAvailabilityLookup,
  need: ProductRecommendationNeed
) {
  const direct =
    lookup.bySupplementId.get(need.sourceId) ??
    lookup.bySupplementId.get(need.id);

  if (direct) {
    return direct;
  }

  const needAliases = productFactAliasKeys(need.displayName, need.aliasKeys);
  const keys = [
    need.sourceId,
    need.id,
    need.normalizedName,
    normalizedKey(need.displayName),
    ...needAliases
  ].filter(Boolean);

  for (const key of keys) {
    const match = lookup.byKey.get(key) ?? lookup.byKey.get(normalizedKey(key));

    if (match) {
      return match;
    }
  }

  for (const item of lookup.bySupplementId.values()) {
    if (
      productKeysMatch(
        need.displayName,
        item.normalizedName,
        needAliases,
        item.aliases
      )
    ) {
      return item;
    }
  }

  return null;
}

export function filterProductNeedsBySupplementAvailability(
  needs: readonly ProductRecommendationNeed[],
  lookup: SupplementAvailabilityLookup
) {
  return needs.filter((need) => {
    if (need.itemType !== "supplement") {
      return true;
    }

    return availabilityForNeed(lookup, need)?.status !== "blocked";
  });
}

export async function filterProductNeedsBySupplementAvailabilityForCountry(
  sql: Db,
  needs: readonly ProductRecommendationNeed[],
  countryCode?: string | null
) {
  if (needs.length < 1) {
    return [...needs];
  }

  const lookup = await getSupplementEffectiveAvailability(sql, countryCode);

  return filterProductNeedsBySupplementAvailability(needs, lookup);
}

export function productHasCountryBlockedSupplement(
  product: ProductCandidate,
  lookup: SupplementAvailabilityLookup
) {
  return product.facts.some((fact) => {
    if (fact.itemType !== "supplement" || !fact.supplementId) {
      return false;
    }

    return lookup.bySupplementId.get(fact.supplementId)?.status === "blocked";
  });
}

export function sanitizeDemandProfilesForSupplementAvailability<T extends {
  needs: ProductRecommendationNeed[];
  supplementNames: readonly string[];
}>(
  profiles: readonly T[],
  lookup: SupplementAvailabilityLookup
) {
  return profiles.flatMap((profile): T[] => {
    const needs = filterProductNeedsBySupplementAvailability(
      profile.needs,
      lookup
    );

    if (needs.length < 1) {
      return [];
    }

    return [{
      ...profile,
      needs,
      supplementNames: needs.map((need) => need.displayName)
    }];
  });
}
