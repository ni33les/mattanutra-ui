import type postgres from "postgres";
import { publicSupplementId } from "@/lib/agentic/contract/ids";
import type {
  CatalogueSupplement,
  CatalogueUnit
} from "@/lib/agentic/catalogue/types";
import { parseAdminLimitUnit } from "@/lib/matcher/safety-ceilings";

export type LiveSupplementRow = Readonly<{
  aliases: readonly string[] | null;
  deleted: boolean;
  factUnits: readonly string[] | null;
  maxUnit: string | null;
  name: string;
  status: string;
  uuid: string;
}>;

const CATALOGUE_UNITS: readonly CatalogueUnit[] = [
  "CFU",
  "IU",
  "g",
  "mcg",
  "mg",
  "ml",
  "serving"
];

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function asCatalogueUnit(value: string | null | undefined): CatalogueUnit | null {
  if (!value) {
    return null;
  }

  const parsed = parseAdminLimitUnit(value);
  return parsed && (CATALOGUE_UNITS as readonly string[]).includes(parsed)
    ? parsed
    : null;
}

export function acceptedUnitsFor(
  maxUnit: string | null | undefined,
  factUnits: readonly string[] | null | undefined = []
): CatalogueUnit[] {
  const units = new Set<CatalogueUnit>();

  const add = (value: string | null | undefined) => {
    const unit = asCatalogueUnit(value);

    if (unit) {
      units.add(unit);
    }
  };

  add(maxUnit);

  for (const unit of factUnits ?? []) {
    add(unit);
  }

  if (units.has("mg")) {
    units.add("g");
  }

  if (units.has("g")) {
    units.add("mg");
  }

  if (units.has("IU")) {
    units.add("mcg");
  }

  if (units.has("mcg")) {
    units.add("mg");
    units.add("IU");
  }

  if (units.size < 1) {
    return ["mg", "mcg", "g", "IU"];
  }

  return CATALOGUE_UNITS.filter((unit) => units.has(unit));
}

export function isLiveSupplementAllowed(row: Pick<LiveSupplementRow, "deleted" | "status">) {
  return !row.deleted && row.status !== "blocked";
}

function uniqueNames(values: readonly string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeName(trimmed);

    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(trimmed);
  }

  return out;
}

export function catalogueSupplementFromLiveRow(
  row: LiveSupplementRow
): CatalogueSupplement | null {
  if (!isLiveSupplementAllowed(row) || !row.uuid || !row.name.trim()) {
    return null;
  }

  return {
    acceptedUnits: acceptedUnitsFor(row.maxUnit, row.factUnits),
    aliases: uniqueNames(row.aliases ?? []),
    name: row.name.trim(),
    supplementId: publicSupplementId(row.uuid),
    uuid: row.uuid
  };
}

export function buildContributionIndex(
  supplements: readonly CatalogueSupplement[]
) {
  const keys = new Map<string, string>();

  for (const item of supplements) {
    keys.set(item.uuid.toLowerCase(), item.supplementId);
    keys.set(item.supplementId, item.supplementId);
    keys.set(normalizeName(item.name), item.supplementId);

    for (const alias of item.aliases) {
      const key = normalizeName(alias);

      if (key) {
        keys.set(key, item.supplementId);
      }
    }
  }

  return keys;
}

export async function loadLiveSupplementsForCountry(
  sql: postgres.Sql | postgres.TransactionSql,
  countryCode: string
): Promise<CatalogueSupplement[]> {
  const code = countryCode.trim().toUpperCase();
  const rows = await sql<Array<{
    aliases: string[] | null;
    deleted: boolean;
    fact_units: string[] | null;
    max_unit: string | null;
    name: string;
    status: string;
    uuid: string;
  }>>`
    select
      supplements.id::text as uuid,
      supplements.name,
      coalesce(supplements.source_payload ->> 'deleted', 'false') = 'true' as deleted,
      case
        when table_rule.status in ('allowed', 'blocked') then table_rule.status
        when json_rule.status in ('allowed', 'blocked') then json_rule.status
        when supplements.is_active = false then 'blocked'
        when supplements.list_status = 'blocked' then 'blocked'
        else 'allowed'
      end as status,
      (
        select limits.max_unit
        from public.supplement_safety_limits limits
        where limits.supplement_id = supplements.id
          and limits.life_stage = 'adult'
          and limits.source_scope = 'supplemental'
          and limits.max_amount is not null
          and limits.max_amount > 0
        order by limits.version desc
        limit 1
      ) as max_unit,
      (
        select array_agg(distinct product_facts.unit)
        from public.product_facts
        where product_facts.supplement_id = supplements.id
          and product_facts.unit is not null
          and product_facts.unit <> ''
      ) as fact_units,
      coalesce(
        (
          select array_agg(distinct supplement_aliases.alias)
          from public.supplement_aliases
          where supplement_aliases.supplement_id = supplements.id
        ),
        '{}'::text[]
      ) as aliases
    from public.supplements supplements
    left join public.supplement_country_availability table_rule
      on table_rule.supplement_id = supplements.id
      and table_rule.country_code = ${code}
    left join lateral (
      select rule.status
      from jsonb_to_recordset(
        case
          when jsonb_typeof(supplements.source_payload -> 'countryAvailability') = 'array'
            then supplements.source_payload -> 'countryAvailability'
          else '[]'::jsonb
        end
      ) as rule(
        "countryCode" text,
        country_code text,
        status text
      )
      where coalesce(rule."countryCode", rule.country_code) = ${code}
        and rule.status in ('allowed', 'blocked')
      limit 1
    ) json_rule on true
  `;

  return rows
    .map((row) =>
      catalogueSupplementFromLiveRow({
        aliases: row.aliases,
        deleted: row.deleted,
        factUnits: row.fact_units,
        maxUnit: row.max_unit,
        name: row.name,
        status: row.status,
        uuid: row.uuid
      })
    )
    .filter((item): item is CatalogueSupplement => Boolean(item))
    .sort((left, right) => left.name.localeCompare(right.name));
}
