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
export type { SupplementSafetyFlag } from "@/lib/supplement-safety-flags";

export type SupplementListStatus =
  | "active"
  | "blocked";

export type SupplementConfidence = "high" | "low" | "moderate";

export type AdminSupplementAlias = Readonly<{
  id: string;
  name: string;
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
  id: string;
  ingredient_type: string | null;
  is_active: boolean;
  list_status: SupplementListStatus;
  max_amount: number | string | null;
  max_unit: string;
  name: string;
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
  confidence: SupplementConfidence;
  id: string;
  listStatus: SupplementListStatus;
  maxAmount: number | null;
  maxUnit: string;
  safetyFlags: SupplementSafetyFlag[];
  safetyNotes: string | null;
  translations?: ReadonlyArray<AdminSupplementTranslationInput> | null;
}>;

export type CreateAdminSupplementInput = Readonly<{
  actor?: string | null;
  category?: string | null;
  confidence?: SupplementConfidence | null;
  listStatus?: SupplementListStatus | null;
  maxAmount?: number | null;
  maxUnit?: string | null;
  name: string;
  safetyFlags?: SupplementSafetyFlag[] | null;
  safetyNotes?: string | null;
  translations?: ReadonlyArray<AdminSupplementTranslationInput> | null;
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

function rowFromDb(
  row: SupplementDbRow,
  selectionStats?: AdminSupplementSelectionStats
): AdminSupplementRow {
  return {
    aliases: aliasesFromDb(row.aliases),
    category: row.category,
    confidence: row.confidence,
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

  await appendSupplementVersion(sql, {
    action: "updated",
    actor: input.actor,
    afterPayload: {
      ...rowFromDb(before),
      confidence: input.confidence,
      listStatus: input.listStatus,
      maxAmount: input.maxAmount,
      maxUnit: input.maxUnit,
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
      is_active = ${input.listStatus === "active"},
      list_status = ${input.listStatus},
      updated_at = now()
    where id = ${input.id}::uuid
  `;

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
      ${sql.json(input)}
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
  const afterPayload = {
    category,
    confidence,
    listStatus,
    maxAmount: input.maxAmount ?? null,
    maxUnit,
    name,
    normalizedName,
    safetyFlags,
    safetyNotes: input.safetyNotes?.trim() || null,
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
      null,
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
