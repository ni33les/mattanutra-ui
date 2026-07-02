import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { getSql } from "@/lib/db";
import {
  appendSupplementAliasVersion,
  appendSupplementVersion
} from "@/lib/domain-versions";
import {
  normalizeSupplementSafetyFlags,
  type SupplementSafetyFlag
} from "@/lib/supplement-safety-flags";
import { appendSupplementSafetyLimitVersion } from "@/lib/supplement-safety-limit-versions";
import type { AdminDashboardRange } from "@/lib/admin-dashboard-data";
import {
  getSupplementSelectionStatsBySupplement,
  type AdminSupplementSelectionStats
} from "@/lib/admin-recommendation-insights";
import { normalizeLocaleCode, type LocaleCode } from "@/lib/i18n";
import {
  isSupplementCountryAvailabilityStatus,
  normalizeSupplementAvailabilityCountryCode,
  type SupplementCountryAvailability,
  type SupplementCountryAvailabilityStatus
} from "@/lib/supplement-country-availability";
export type { SupplementSafetyFlag } from "@/lib/supplement-safety-flags";

export type SupplementListStatus =
  | "active"
  | "blocked";

export type SupplementConfidence = "high" | "low" | "moderate";

export type AdminSupplementAlias = Readonly<{
  id: string;
  name: string;
}>;

export type AdminSupplementCountryAvailability =
  SupplementCountryAvailability;

export type AdminSupplementCountryAvailabilityInput = Readonly<{
  countryCode: string;
  reason?: string | null;
  status: SupplementCountryAvailabilityStatus;
}>;

export type AdminSupplementTranslation = Readonly<{
  aliases: string[];
  categoryLabel: string | null;
  locale: LocaleCode;
  name: string | null;
  primaryUseCase: string | null;
  safetyNotes: string | null;
  status: "complete" | "draft" | "missing";
  updatedAt: string | null;
}>;

export type AdminSupplementRow = Readonly<{
  aliases: AdminSupplementAlias[];
  category: string;
  confidence: SupplementConfidence;
  countryAvailability: AdminSupplementCountryAvailability[];
  id: string;
  ingredientType: string | null;
  listStatus: SupplementListStatus;
  maxAmount: number | null;
  maxUnit: string;
  name: string;
  primaryUseCase: string | null;
  safetyFlags: SupplementSafetyFlag[];
  safetyNotes: string | null;
  selectionStats?: AdminSupplementSelectionStats;
  sourceStatus: "core" | "recommended_add";
  translations: Partial<Record<LocaleCode, AdminSupplementTranslation>>;
  updatedAt: string;
}>;

export type AdminSupplementsData = Readonly<{
  categories: string[];
  databaseAvailable: boolean;
  generatedAt: string;
  rows: AdminSupplementRow[];
  summary: {
    active: number;
    blocked: number;
    total: number;
  };
}>;

type SupplementDbRow = Readonly<{
  aliases: unknown;
  category: string;
  confidence: SupplementConfidence;
  country_availability: unknown;
  id: string;
  ingredient_type: string | null;
  is_active: boolean;
  list_status: SupplementListStatus;
  max_amount: number | string | null;
  max_unit: string;
  name: string;
  normalized_name: string;
  primary_use_case: string | null;
  safety_flags: string[] | null;
  safety_notes: string | null;
  source_status: "core" | "recommended_add";
  translations: unknown;
  updated_at: Date | string;
}>;

export type AdminSupplementTranslationInput = Readonly<{
  aliases?: string[] | null;
  categoryLabel?: string | null;
  locale: LocaleCode;
  name?: string | null;
  primaryUseCase?: string | null;
  safetyNotes?: string | null;
  status?: "complete" | "draft" | "missing" | null;
}>;

export type UpdateAdminSupplementInput = Readonly<{
  actor?: string | null;
  category?: string | null;
  confidence: SupplementConfidence;
  countryAvailability?: ReadonlyArray<AdminSupplementCountryAvailabilityInput> | null;
  id: string;
  listStatus: SupplementListStatus;
  maxAmount: number | null;
  maxUnit: string;
  name?: string | null;
  primaryUseCase?: string | null;
  safetyFlags: SupplementSafetyFlag[];
  safetyNotes: string | null;
  translations?: ReadonlyArray<AdminSupplementTranslationInput> | null;
}>;

export type CreateAdminSupplementInput = Readonly<{
  actor?: string | null;
  category?: string | null;
  confidence?: SupplementConfidence | null;
  countryAvailability?: ReadonlyArray<AdminSupplementCountryAvailabilityInput> | null;
  listStatus?: SupplementListStatus | null;
  maxAmount?: number | null;
  maxUnit?: string | null;
  name: string;
  primaryUseCase?: string | null;
  safetyFlags?: SupplementSafetyFlag[] | null;
  safetyNotes?: string | null;
  translations?: ReadonlyArray<AdminSupplementTranslationInput> | null;
}>;

export type DeleteAdminSupplementInput = Readonly<{
  actor?: string | null;
  id: string;
}>;

export type DeleteAdminSupplementResult = Readonly<{
  deleted: true;
  orphanedProductIds: string[];
  supplementId: string;
}>;

export type DeleteAdminSupplementAliasInput = Readonly<{
  actor?: string | null;
  aliasId: string;
  supplementId: string;
}>;

export type AddAdminSupplementAliasInput = Readonly<{
  actor?: string | null;
  alias: string;
  supplementId: string;
}>;

const listStatuses = new Set<SupplementListStatus>([
  "active",
  "blocked"
]);

const confidences = new Set<SupplementConfidence>(["high", "low", "moderate"]);

export function emptyAdminSupplementsData(): AdminSupplementsData {
  return {
    categories: [],
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    rows: [],
    summary: {
      active: 0,
      blocked: 0,
      total: 0
    }
  };
}

function numberOrNull(value: number | string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function aliasesFromDb(value: unknown): AdminSupplementAlias[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as { id?: unknown; name?: unknown };
      const id = typeof candidate.id === "string" ? candidate.id : null;
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";

      return id && name ? { id, name } : null;
    })
    .filter((item): item is AdminSupplementAlias => Boolean(item));
}

function countryAvailabilityFromDb(
  value: unknown
): AdminSupplementCountryAvailability[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): AdminSupplementCountryAvailability[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const countryCode = normalizeSupplementAvailabilityCountryCode(
      typeof record.countryCode === "string"
        ? record.countryCode
        : typeof record.country_code === "string"
          ? record.country_code
          : null
    );
    const status = record.status;

    if (!isSupplementCountryAvailabilityStatus(status)) {
      return [];
    }

    return [{
      countryCode,
      reason:
        typeof record.reason === "string" && record.reason.trim()
          ? record.reason.trim()
          : null,
      source:
        typeof record.source === "string" && record.source.trim()
          ? record.source.trim()
          : null,
      status,
      updatedAt:
        typeof record.updatedAt === "string"
          ? record.updatedAt
          : typeof record.updated_at === "string"
            ? record.updated_at
            : null
    }];
  }).sort((first, second) => first.countryCode.localeCompare(second.countryCode));
}

function normalizeCountryAvailabilityInputs(
  value: ReadonlyArray<AdminSupplementCountryAvailabilityInput> | null | undefined
) {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return [] as AdminSupplementCountryAvailabilityInput[];
  }

  const byCountry = new Map<string, AdminSupplementCountryAvailabilityInput>();

  for (const item of value) {
    const countryCode = normalizeSupplementAvailabilityCountryCode(
      item.countryCode
    );

    if (!isSupplementCountryAvailabilityStatus(item.status)) {
      continue;
    }

    byCountry.set(countryCode, {
      countryCode,
      reason: item.reason?.trim().slice(0, 1000) || null,
      status: item.status
    });
  }

  return [...byCountry.values()].sort((first, second) =>
    first.countryCode.localeCompare(second.countryCode)
  );
}

function textOrNull(value: unknown, maxLength = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeAlias(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function translationStatus(value: unknown): AdminSupplementTranslation["status"] {
  return value === "complete" || value === "missing" ? value : "draft";
}

function translationAliases(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function translationsFromDb(value: unknown): Partial<Record<LocaleCode, AdminSupplementTranslation>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const translations: Partial<Record<LocaleCode, AdminSupplementTranslation>> = {};

  for (const [rawLocale, rawTranslation] of Object.entries(value)) {
    const locale = normalizeLocaleCode(rawLocale);

    if (!locale || !rawTranslation || typeof rawTranslation !== "object" || Array.isArray(rawTranslation)) {
      continue;
    }

    const translation = rawTranslation as Record<string, unknown>;
    translations[locale] = {
      aliases: translationAliases(translation.aliases),
      categoryLabel: textOrNull(translation.categoryLabel, 120),
      locale,
      name: textOrNull(translation.name, 200),
      primaryUseCase: textOrNull(translation.primaryUseCase, 500),
      safetyNotes: textOrNull(translation.safetyNotes, 2000),
      status: translationStatus(translation.status),
      updatedAt:
        typeof translation.updatedAt === "string" && translation.updatedAt
          ? new Date(translation.updatedAt).toISOString()
          : null
    };
  }

  return translations;
}

function normalizeTranslationInput(
  translation: AdminSupplementTranslationInput
): AdminSupplementTranslationInput | null {
  const locale = normalizeLocaleCode(translation.locale);

  if (!locale) {
    return null;
  }

  return {
    aliases: translationAliases(translation.aliases),
    categoryLabel: textOrNull(translation.categoryLabel, 120),
    locale,
    name: textOrNull(translation.name, 200),
    primaryUseCase: textOrNull(translation.primaryUseCase, 500),
    safetyNotes: textOrNull(translation.safetyNotes, 2000),
    status: translation.status === "complete" || translation.status === "missing"
      ? translation.status
      : "draft"
  };
}

async function upsertSupplementTranslations(
  sql: postgres.Sql | postgres.TransactionSql,
  supplementId: string,
  translations: ReadonlyArray<AdminSupplementTranslationInput> | null | undefined,
  actor: string | null | undefined
) {
  if (!translations?.length) {
    return;
  }

  for (const translation of translations) {
    const normalized = normalizeTranslationInput(translation);

    if (!normalized) {
      continue;
    }

    await sql`
      insert into public.supplement_translations (
        supplement_id,
        locale,
        name,
        primary_use_case,
        category_label,
        safety_notes,
        aliases,
        status,
        source,
        metadata,
        updated_at
      )
      values (
        ${supplementId}::uuid,
        ${normalized.locale},
        ${normalized.name ?? null},
        ${normalized.primaryUseCase ?? null},
        ${normalized.categoryLabel ?? null},
        ${normalized.safetyNotes ?? null},
        ${normalized.aliases ?? []},
        ${normalized.status ?? "draft"},
        'admin',
        ${sql.json({
          actor: actor ?? "admin_dashboard",
          updatedVia: "supplements_admin"
        })}::jsonb,
        now()
      )
      on conflict (supplement_id, locale) do update set
        name = excluded.name,
        primary_use_case = excluded.primary_use_case,
        category_label = excluded.category_label,
        safety_notes = excluded.safety_notes,
        aliases = excluded.aliases,
        status = excluded.status,
        source = excluded.source,
        metadata = public.supplement_translations.metadata || excluded.metadata,
        updated_at = now()
    `;
  }
}

async function syncEnglishSupplementTranslationName(
  sql: postgres.Sql | postgres.TransactionSql,
  supplementId: string,
  name: string,
  actor: string | null | undefined
) {
  await sql`
    update public.supplement_translations
    set
      name = ${name},
      source = 'admin',
      metadata = coalesce(metadata, '{}'::jsonb) || ${sql.json({
        actor: actor ?? "admin_dashboard",
        updatedVia: "supplement_canonical_name_update"
      })}::jsonb,
      updated_at = now()
    where supplement_id = ${supplementId}::uuid
      and locale = 'en'
      and coalesce(name, '') <> ${name}
  `;
}

async function replaceSupplementCountryAvailability(
  sql: postgres.Sql | postgres.TransactionSql,
  supplementId: string,
  countryAvailability:
    | ReadonlyArray<AdminSupplementCountryAvailabilityInput>
    | null
    | undefined,
  actor: string | null | undefined
) {
  const rows = normalizeCountryAvailabilityInputs(countryAvailability);

  if (rows === undefined) {
    return;
  }

  if (rows.length < 1) {
    await sql`
      update public.supplements
      set
        source_payload = coalesce(source_payload, '{}'::jsonb) - 'countryAvailability',
        updated_at = now()
      where id = ${supplementId}::uuid
    `;
    return;
  }

  await sql`
    update public.supplements
    set
      source_payload = jsonb_set(
        coalesce(source_payload, '{}'::jsonb),
        '{countryAvailability}',
        ${sql.json(rows.map((row) => ({
          countryCode: row.countryCode,
          reason: row.reason ?? null,
          source: actor ?? "admin_dashboard",
          status: row.status,
          updatedAt: new Date().toISOString()
        })))}::jsonb,
        true
      ),
      updated_at = now()
    where id = ${supplementId}::uuid
  `;
}

function rowFromDb(
  row: SupplementDbRow,
  selectionStats?: AdminSupplementSelectionStats
): AdminSupplementRow {
  return {
    aliases: aliasesFromDb(row.aliases),
    category: row.category,
    confidence: row.confidence,
    countryAvailability: countryAvailabilityFromDb(row.country_availability),
    id: row.id,
    ingredientType: row.ingredient_type,
    listStatus: row.is_active ? row.list_status : "blocked",
    maxAmount: numberOrNull(row.max_amount),
    maxUnit: row.max_unit,
    name: row.name,
    primaryUseCase: row.primary_use_case,
    safetyFlags: normalizeSupplementSafetyFlags(row.safety_flags),
    safetyNotes: row.safety_notes,
    ...(selectionStats ? { selectionStats } : {}),
    sourceStatus: row.source_status,
    translations: translationsFromDb(row.translations),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function buildSummary(rows: AdminSupplementRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.listStatus === "active") {
        summary.active += 1;
      } else {
        summary.blocked += 1;
      }

      return summary;
    },
    {
      active: 0,
      blocked: 0,
      total: 0
    }
  );
}

export function isSupplementListStatus(
  value: unknown
): value is SupplementListStatus {
  return typeof value === "string" && listStatuses.has(value as SupplementListStatus);
}

export function isSupplementConfidence(
  value: unknown
): value is SupplementConfidence {
  return typeof value === "string" && confidences.has(value as SupplementConfidence);
}

export async function getAdminSupplementsData(
  range: AdminDashboardRange = "all"
): Promise<AdminSupplementsData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminSupplementsData();
  }

  try {
    const rows = await sql<SupplementDbRow[]>`
      select
        supplements.id::text,
        supplements.name,
        supplements.normalized_name,
        supplements.category,
        supplements.source_status,
        supplements.ingredient_type,
        supplements.primary_use_case,
        supplements.list_status,
        supplements.is_active,
        supplements.updated_at,
        limits.max_amount,
        limits.max_unit,
        limits.confidence,
        limits.safety_flags,
        limits.safety_notes,
        coalesce(alias_rows.aliases, '[]'::jsonb) as aliases,
        case
          when jsonb_typeof(supplements.source_payload -> 'countryAvailability') = 'array'
            then supplements.source_payload -> 'countryAvailability'
          else '[]'::jsonb
        end as country_availability,
        coalesce(translation_rows.translations, '{}'::jsonb) as translations
      from public.supplements supplements
      left join lateral (
        select *
        from public.supplement_safety_limits limits
        where limits.supplement_id = supplements.id
        order by limits.version desc
        limit 1
      ) limits on true
      left join lateral (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', supplement_aliases.id::text,
              'name', supplement_aliases.alias
            )
            order by supplement_aliases.alias
          ),
          '[]'::jsonb
        ) as aliases
        from public.supplement_aliases supplement_aliases
        where supplement_aliases.supplement_id = supplements.id
          and supplement_aliases.normalized_alias <> supplements.normalized_name
      ) alias_rows on true
      left join lateral (
        select coalesce(
          jsonb_object_agg(
            supplement_translations.locale,
            jsonb_build_object(
              'aliases', supplement_translations.aliases,
              'categoryLabel', supplement_translations.category_label,
              'locale', supplement_translations.locale,
              'name', supplement_translations.name,
              'primaryUseCase', supplement_translations.primary_use_case,
              'safetyNotes', supplement_translations.safety_notes,
              'status', supplement_translations.status,
              'updatedAt', supplement_translations.updated_at
            )
          ),
          '{}'::jsonb
        ) as translations
        from public.supplement_translations supplement_translations
        where supplement_translations.supplement_id = supplements.id
      ) translation_rows on true
      where coalesce(supplements.source_payload ->> 'deleted', 'false') <> 'true'
      order by supplements.category asc, supplements.name asc
      limit 1000
    `;
    const selectionStats = await getSupplementSelectionStatsBySupplement(range);
    const mappedRows = rows.map((row) =>
      rowFromDb(row, selectionStats.get(row.id))
    );

    return {
      categories: [...new Set(mappedRows.map((row) => row.category))].sort(),
      databaseAvailable: true,
      generatedAt: new Date().toISOString(),
      rows: mappedRows,
      summary: buildSummary(mappedRows)
    };
  } catch (error) {
    console.error("Unable to load admin supplements", error);
    return emptyAdminSupplementsData();
  }
}

export async function updateAdminSupplement(input: UpdateAdminSupplementInput) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const beforeRows = await sql<SupplementDbRow[]>`
    select
      supplements.id::text,
      supplements.name,
      supplements.normalized_name,
      supplements.category,
      supplements.source_status,
      supplements.ingredient_type,
      supplements.primary_use_case,
      supplements.list_status,
      supplements.is_active,
      supplements.updated_at,
      limits.max_amount,
      limits.max_unit,
      limits.confidence,
      limits.safety_flags,
      limits.safety_notes,
      coalesce(alias_rows.aliases, '[]'::jsonb) as aliases,
      case
        when jsonb_typeof(supplements.source_payload -> 'countryAvailability') = 'array'
          then supplements.source_payload -> 'countryAvailability'
        else '[]'::jsonb
      end as country_availability,
      coalesce(translation_rows.translations, '{}'::jsonb) as translations
    from public.supplements supplements
    left join lateral (
      select *
      from public.supplement_safety_limits limits
      where limits.supplement_id = supplements.id
      order by limits.version desc
      limit 1
    ) limits on true
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', supplement_aliases.id::text,
            'name', supplement_aliases.alias
          )
          order by supplement_aliases.alias
        ),
        '[]'::jsonb
      ) as aliases
      from public.supplement_aliases supplement_aliases
      where supplement_aliases.supplement_id = supplements.id
        and supplement_aliases.normalized_alias <> supplements.normalized_name
    ) alias_rows on true
    left join lateral (
      select coalesce(
        jsonb_object_agg(
          supplement_translations.locale,
          jsonb_build_object(
            'aliases', supplement_translations.aliases,
            'categoryLabel', supplement_translations.category_label,
            'locale', supplement_translations.locale,
            'name', supplement_translations.name,
            'primaryUseCase', supplement_translations.primary_use_case,
            'safetyNotes', supplement_translations.safety_notes,
            'status', supplement_translations.status,
            'updatedAt', supplement_translations.updated_at
          )
        ),
        '{}'::jsonb
      ) as translations
      from public.supplement_translations supplement_translations
      where supplement_translations.supplement_id = supplements.id
    ) translation_rows on true
    where supplements.id = ${input.id}::uuid
    limit 1
  `;
  const before = beforeRows[0];

  if (!before) {
    throw new Error("Supplement not found");
  }

  const nextName = input.name === undefined
    ? before.name
    : input.name?.trim().slice(0, 200) ?? "";
  const nextNormalizedName = normalizeAlias(nextName);
  const nextCategory = input.category === undefined
    ? before.category
    : input.category?.trim().slice(0, 120) || "Manual";
  const nextPrimaryUseCase = input.primaryUseCase === undefined
    ? before.primary_use_case
    : textOrNull(input.primaryUseCase, 500);
  const nextCountryAvailability =
    normalizeCountryAvailabilityInputs(input.countryAvailability) ??
    countryAvailabilityFromDb(before.country_availability);

  if (!nextName || !nextNormalizedName) {
    throw new Error("Supplement name is required");
  }

  const duplicateNameRows = await sql<{ id: string }[]>`
    select duplicate_ids.id
    from (
      select supplements.id::text
      from public.supplements supplements
      where supplements.normalized_name = ${nextNormalizedName}
        and supplements.id <> ${input.id}::uuid
      union all
      select supplement_aliases.supplement_id::text as id
      from public.supplement_aliases supplement_aliases
      where supplement_aliases.normalized_alias = ${nextNormalizedName}
        and supplement_aliases.supplement_id <> ${input.id}::uuid
    ) duplicate_ids
    limit 1
  `;

  if (duplicateNameRows[0]) {
    throw new Error("Supplement name already exists");
  }

  await appendSupplementVersion(sql, {
    action: "updated",
    actor: input.actor,
    afterPayload: {
      ...rowFromDb(before),
      category: nextCategory,
      confidence: input.confidence,
      countryAvailability: nextCountryAvailability,
      listStatus: input.listStatus,
      maxAmount: input.maxAmount,
      maxUnit: input.maxUnit,
      name: nextName,
      primaryUseCase: nextPrimaryUseCase,
      safetyFlags: input.safetyFlags,
      safetyNotes: input.safetyNotes
    },
    beforePayload: rowFromDb(before),
    changeReason: "supplement_admin_update",
    source: "admin_dashboard",
    supplementId: input.id
  });

  await sql`
    update public.supplements
    set
      category = ${nextCategory},
      is_active = ${input.listStatus === "active"},
      list_status = ${input.listStatus},
      name = ${nextName},
      normalized_name = ${nextNormalizedName},
      primary_use_case = ${nextPrimaryUseCase},
      updated_at = now()
    where id = ${input.id}::uuid
  `;

  if (nextNormalizedName !== before.normalized_name) {
    const existingAliasRows = await sql<{
      alias: string;
      id: string;
      normalized_alias: string;
      supplement_id: string;
    }[]>`
      select
        supplement_aliases.id::text,
        supplement_aliases.supplement_id::text,
        supplement_aliases.alias,
        supplement_aliases.normalized_alias
      from public.supplement_aliases supplement_aliases
      where supplement_aliases.normalized_alias = ${nextNormalizedName}
      limit 1
    `;
    const existingAlias = existingAliasRows[0] ?? null;
    const aliasId = existingAlias?.id ?? randomUUID();

    await appendSupplementAliasVersion(sql, {
      action: existingAlias ? "alias_updated" : "alias_added",
      actor: input.actor,
      afterPayload: {
        alias: nextName,
        aliasId,
        normalizedAlias: nextNormalizedName,
        supplementId: input.id
      },
      aliasId,
      beforePayload: existingAlias ?? {},
      changeReason: "supplement_canonical_name_updated",
      normalizedAlias: nextNormalizedName,
      source: "admin_dashboard",
      supplementId: input.id
    });

    await sql`
      insert into public.supplement_aliases (
        id,
        supplement_id,
        alias,
        normalized_alias,
        created_at
      )
      values (
        ${aliasId}::uuid,
        ${input.id}::uuid,
        ${nextName},
        ${nextNormalizedName},
        now()
      )
      on conflict (normalized_alias) do update set
        supplement_id = excluded.supplement_id,
        alias = excluded.alias
    `;
  }

  await appendSupplementSafetyLimitVersion(sql, {
    confidence: input.confidence,
    maxAmount: input.maxAmount,
    maxUnit: input.maxUnit,
    safetyFlags: input.safetyFlags,
    safetyNotes: input.safetyNotes,
    supplementId: input.id
  });

  await upsertSupplementTranslations(
    sql,
    input.id,
    input.translations,
    input.actor
  );
  if (nextName !== before.name) {
    await syncEnglishSupplementTranslationName(
      sql,
      input.id,
      nextName,
      input.actor
    );
  }
  await replaceSupplementCountryAvailability(
    sql,
    input.id,
    input.countryAvailability,
    input.actor
  );

  await sql`
    insert into public.supplement_admin_audit (
      id,
      supplement_id,
      action,
      actor,
      before_payload,
      after_payload
    )
    values (
      ${randomUUID()}::uuid,
      ${input.id}::uuid,
	        ${"updated"},
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(rowFromDb(before))},
      ${sql.json({
        ...input,
        category: nextCategory,
        countryAvailability: nextCountryAvailability,
        name: nextName,
        primaryUseCase: nextPrimaryUseCase
      })}
    )
  `;

  const { revalidateProductsForSupplement } = await import("@/lib/admin-products");

  await revalidateProductsForSupplement({
    actor: input.actor,
    supplementId: input.id
  });

  const data = await getAdminSupplementsData();
  const row = data.rows.find((item) => item.id === input.id);

  if (!row) {
    throw new Error("Supplement update could not be reloaded");
  }

  return row;
}

export async function createAdminSupplement(input: CreateAdminSupplementInput) {
  const sql = getSql();
  const name = input.name.trim().slice(0, 200);
  const normalizedName = normalizeAlias(name);
  const category = input.category?.trim().slice(0, 120) || "Manual";
  const listStatus = input.listStatus ?? "active";
  const confidence = input.confidence ?? "low";
  const maxUnit = input.maxUnit?.trim().slice(0, 80) ?? "";
  const primaryUseCase = textOrNull(input.primaryUseCase, 500);
  const safetyFlags = normalizeSupplementSafetyFlags(input.safetyFlags);

  if (!sql) {
    throw new Error("Database is not configured");
  }

  if (!name || !normalizedName) {
    throw new Error("Supplement name is required");
  }

  if (!listStatuses.has(listStatus)) {
    throw new Error("Invalid supplement list status");
  }

  if (!confidences.has(confidence)) {
    throw new Error("Invalid supplement confidence");
  }

  const existingRows = await sql<{ id: string }[]>`
    select supplements.id::text
    from public.supplements supplements
    left join public.supplement_aliases aliases
      on aliases.supplement_id = supplements.id
    where supplements.normalized_name = ${normalizedName}
       or aliases.normalized_alias = ${normalizedName}
    order by
      (supplements.normalized_name = ${normalizedName}) desc,
      supplements.name asc
    limit 1
  `;
  const existingId = existingRows[0]?.id;

  if (existingId) {
    const data = await getAdminSupplementsData();
    const row = data.rows.find((item) => item.id === existingId);

    if (!row) {
      throw new Error("Supplement could not be reloaded");
    }

    return row;
  }

  const supplementId = randomUUID();
  const aliasId = randomUUID();
  const countryAvailability =
    normalizeCountryAvailabilityInputs(input.countryAvailability) ?? [];
  const afterPayload = {
    category,
    confidence,
    countryAvailability,
    listStatus,
    maxAmount: input.maxAmount ?? null,
    maxUnit,
    name,
    normalizedName,
    safetyFlags,
    safetyNotes: input.safetyNotes?.trim() || null,
    primaryUseCase,
    sourceStatus: "recommended_add",
    translations: input.translations ?? []
  };

  await appendSupplementVersion(sql, {
    action: "created",
    actor: input.actor,
    afterPayload,
    beforePayload: {},
    changeReason: "supplement_created",
    source: "admin_dashboard",
    supplementId
  });

  await appendSupplementAliasVersion(sql, {
    action: "alias_added",
    actor: input.actor,
    afterPayload: {
      alias: name,
      aliasId,
      normalizedAlias: normalizedName,
      supplementId
    },
    aliasId,
    beforePayload: {},
    changeReason: "supplement_created_primary_alias",
    normalizedAlias: normalizedName,
    source: "admin_dashboard",
    supplementId
  });

  await sql`
    insert into public.supplements (
      id,
      name,
      normalized_name,
      category,
      source_status,
      ingredient_type,
      primary_use_case,
      notes,
      list_status,
      is_active,
      source,
      source_payload,
      created_at,
      updated_at
    )
    values (
      ${supplementId}::uuid,
      ${name},
      ${normalizedName},
      ${category},
      'recommended_add',
      null,
      ${primaryUseCase},
      null,
      ${listStatus},
      ${listStatus === "active"},
      'admin_dashboard',
      ${sql.json({
        createdBy: input.actor ?? "admin_dashboard",
        createdVia: "supplements_plus"
      })}::jsonb,
      now(),
      now()
    )
  `;

  await sql`
    insert into public.supplement_aliases (
      id,
      supplement_id,
      alias,
      normalized_alias,
      created_at
    )
    values (
      ${aliasId}::uuid,
      ${supplementId}::uuid,
      ${name},
      ${normalizedName},
      now()
    )
    on conflict (normalized_alias) do nothing
  `;

  await appendSupplementSafetyLimitVersion(sql, {
    confidence,
    maxAmount: input.maxAmount ?? null,
    maxUnit,
    safetyFlags,
    safetyNotes: input.safetyNotes?.trim() || null,
    supplementId
  });

  await upsertSupplementTranslations(
    sql,
    supplementId,
    input.translations,
    input.actor
  );
  await replaceSupplementCountryAvailability(
    sql,
    supplementId,
    countryAvailability,
    input.actor
  );

  await sql`
    insert into public.supplement_admin_audit (
      id,
      supplement_id,
      action,
      actor,
      before_payload,
      after_payload
    )
    values (
      ${randomUUID()}::uuid,
      ${supplementId}::uuid,
      ${"created"},
      ${input.actor ?? "admin_dashboard"},
      '{}'::jsonb,
      ${sql.json(afterPayload)}::jsonb
    )
  `;

  const data = await getAdminSupplementsData();
  const row = data.rows.find((item) => item.id === supplementId);

  if (!row) {
    throw new Error("Supplement create could not be reloaded");
  }

  return row;
}

export async function deleteAdminSupplement(
  input: DeleteAdminSupplementInput
): Promise<DeleteAdminSupplementResult> {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const data = await getAdminSupplementsData();
  const before = data.rows.find((row) => row.id === input.id);

  if (!before) {
    throw new Error("Supplement not found");
  }

  const { productIdsUsingSupplement, refreshAndPersistProductValidations } =
    await import("@/lib/admin-product-writes");
  const orphanedProductIds = await productIdsUsingSupplement(sql, input.id);
  const deletedAt = new Date().toISOString();
  const deletedBy = input.actor ?? "admin_dashboard";

  await appendSupplementVersion(sql, {
    action: "deleted",
    actor: input.actor,
    afterPayload: {
      deleted: true,
      orphanedProductIds,
      supplementId: input.id
    },
    beforePayload: before,
    changeReason: "supplement_admin_delete",
    source: "admin_dashboard",
    supplementId: input.id
  });

  await sql`
    insert into public.supplement_admin_audit (
      id,
      supplement_id,
      action,
      actor,
      before_payload,
      after_payload
    )
    values (
      ${randomUUID()}::uuid,
      ${input.id}::uuid,
      ${"deleted"},
      ${deletedBy},
      ${sql.json(before)},
      ${sql.json({
        deleted: true,
        deletedAt,
        deletedBy,
        orphanedProductIds,
        supplementId: input.id
      })}
    )
  `;

  await sql`
    update public.product_facts
    set supplement_id = null
    where supplement_id = ${input.id}::uuid
  `;

  await sql`
    delete from public.supplement_aliases
    where supplement_id = ${input.id}::uuid
  `;

  await sql`
    delete from public.supplement_country_availability
    where supplement_id = ${input.id}::uuid
  `;

  const deletedRows = await sql<{ id: string }[]>`
    update public.supplements
    set
      is_active = false,
      list_status = 'blocked',
      normalized_name = concat(
        normalized_name,
        '__deleted__',
        replace(id::text, '-', '')
      ),
      source_payload = (
        coalesce(source_payload, '{}'::jsonb) - 'countryAvailability'
      ) || jsonb_build_object(
        'deleted', true,
        'deletedAt', ${deletedAt}::text,
        'deletedBy', ${deletedBy}::text,
        'deletedIsActive', is_active,
        'deletedListStatus', list_status,
        'deletedNormalizedName', normalized_name,
        'orphanedProductIds', ${sql.json(orphanedProductIds)}::jsonb
      ),
      updated_at = now()
    where id = ${input.id}::uuid
      and coalesce(source_payload ->> 'deleted', 'false') <> 'true'
    returning id::text
  `;

  if (deletedRows.length === 0) {
    throw new Error("Supplement not found");
  }

  await refreshAndPersistProductValidations(sql, orphanedProductIds);

  return {
    deleted: true,
    orphanedProductIds,
    supplementId: input.id
  };
}

export async function deleteAdminSupplementAlias(
  input: DeleteAdminSupplementAliasInput
) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const aliasRows = await sql<
    {
      alias: string;
      id: string;
      normalized_alias: string;
      supplement_id: string;
    }[]
  >`
    select
      id::text,
      supplement_id::text,
      alias,
      normalized_alias
    from public.supplement_aliases
    where id = ${input.aliasId}::uuid
      and supplement_id = ${input.supplementId}::uuid
    limit 1
  `;
  const alias = aliasRows[0];

  if (!alias) {
    throw new Error("Supplement association not found");
  }

  await appendSupplementAliasVersion(sql, {
    action: "alias_deleted",
    actor: input.actor,
    afterPayload: { aliasId: input.aliasId },
    aliasId: input.aliasId,
    beforePayload: alias,
    changeReason: "supplement_alias_deleted",
    normalizedAlias: alias.normalized_alias,
    source: "admin_dashboard",
    supplementId: input.supplementId
  });

  const deletedRows = await sql<{ id: string }[]>`
    delete from public.supplement_aliases
    where id = ${input.aliasId}::uuid
      and supplement_id = ${input.supplementId}::uuid
    returning id::text
  `;

  if (deletedRows.length === 0) {
    throw new Error("Supplement association not found");
  }

  await sql`
    insert into public.supplement_admin_audit (
      id,
      supplement_id,
      action,
      actor,
      before_payload,
      after_payload
    )
    values (
      ${randomUUID()}::uuid,
      ${input.supplementId}::uuid,
      ${"alias_deleted"},
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(alias)},
      ${sql.json({ aliasId: input.aliasId })}
    )
  `;

  const data = await getAdminSupplementsData();
  const row = data.rows.find((item) => item.id === input.supplementId);

  if (!row) {
    throw new Error("Supplement update could not be reloaded");
  }

  return row;
}

export async function addAdminSupplementAlias(input: AddAdminSupplementAliasInput) {
  const sql = getSql();
  const alias = input.alias.trim().slice(0, 200);
  const normalizedAlias = normalizeAlias(alias);

  if (!sql) {
    throw new Error("Database is not configured");
  }

  if (!alias || !normalizedAlias) {
    throw new Error("Supplement association requires a name");
  }

  const supplementRows = await sql<{ id: string; name: string }[]>`
    select id::text, name
    from public.supplements
    where id = ${input.supplementId}::uuid
    limit 1
  `;
  const supplement = supplementRows[0];

  if (!supplement) {
    throw new Error("Supplement not found");
  }

  const beforeRows = await sql<
    {
      alias: string;
      id: string;
      normalized_alias: string;
      supplement_id: string;
    }[]
  >`
    select id::text, supplement_id::text, alias, normalized_alias
    from public.supplement_aliases
    where normalized_alias = ${normalizedAlias}
    limit 1
  `;
  const before = beforeRows[0] ?? null;
  const aliasId = before?.id ?? randomUUID();
  const action = before ? "alias_reassigned" : "alias_added";

  await appendSupplementAliasVersion(sql, {
    action,
    actor: input.actor,
    afterPayload: {
      alias,
      aliasId,
      normalizedAlias,
      supplementId: input.supplementId
    },
    aliasId,
    beforePayload: before ?? {},
    changeReason: before
      ? "supplement_alias_reassigned"
      : "supplement_alias_added",
    normalizedAlias,
    source: "admin_dashboard",
    supplementId: input.supplementId
  });

  await sql`
    insert into public.supplement_aliases (
      id,
      supplement_id,
      alias,
      normalized_alias,
      created_at
    )
    values (
      ${aliasId}::uuid,
      ${input.supplementId}::uuid,
      ${alias},
      ${normalizedAlias},
      now()
    )
    on conflict (normalized_alias) do update set
      supplement_id = excluded.supplement_id,
      alias = excluded.alias
  `;

  await sql`
    insert into public.supplement_admin_audit (
      id,
      supplement_id,
      action,
      actor,
      before_payload,
      after_payload
    )
    values (
      ${randomUUID()}::uuid,
      ${input.supplementId}::uuid,
      ${action},
      ${input.actor ?? "admin_dashboard"},
      ${sql.json(before ?? {})},
      ${sql.json({ alias, aliasId, normalizedAlias, supplementId: input.supplementId })}
    )
  `;

  const data = await getAdminSupplementsData();
  const row = data.rows.find((item) => item.id === input.supplementId);

  if (!row) {
    throw new Error("Supplement update could not be reloaded");
  }

  return row;
}
