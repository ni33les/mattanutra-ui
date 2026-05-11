import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import {
  normalizeSupplementSafetyFlags,
  type SupplementSafetyFlag
} from "@/lib/supplement-safety-flags";
export type { SupplementSafetyFlag } from "@/lib/supplement-safety-flags";

export type SupplementListStatus =
  | "blacklisted"
  | "inactive"
  | "review_required"
  | "whitelisted";

export type SupplementConfidence = "high" | "low" | "moderate";

export type AdminSupplementAlias = Readonly<{
  id: string;
  name: string;
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
  sourceStatus: "core" | "recommended_add";
  updatedAt: string;
}>;

export type AdminSupplementsData = Readonly<{
  categories: string[];
  databaseAvailable: boolean;
  generatedAt: string;
  rows: AdminSupplementRow[];
  summary: {
    blacklisted: number;
    inactive: number;
    reviewRequired: number;
    total: number;
    whitelisted: number;
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
  updated_at: Date | string;
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
  "blacklisted",
  "inactive",
  "review_required",
  "whitelisted"
]);

const confidences = new Set<SupplementConfidence>(["high", "low", "moderate"]);

function emptyAdminSupplementsData(): AdminSupplementsData {
  return {
    categories: [],
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    rows: [],
    summary: {
      blacklisted: 0,
      inactive: 0,
      reviewRequired: 0,
      total: 0,
      whitelisted: 0
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

function normalizeAlias(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function rowFromDb(row: SupplementDbRow): AdminSupplementRow {
  return {
    aliases: aliasesFromDb(row.aliases),
    category: row.category,
    confidence: row.confidence,
    id: row.id,
    ingredientType: row.ingredient_type,
    listStatus: row.is_active ? row.list_status : "inactive",
    maxAmount: numberOrNull(row.max_amount),
    maxUnit: row.max_unit,
    name: row.name,
    primaryUseCase: row.primary_use_case,
    safetyFlags: normalizeSupplementSafetyFlags(row.safety_flags),
    safetyNotes: row.safety_notes,
    sourceStatus: row.source_status,
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function buildSummary(rows: AdminSupplementRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.listStatus === "whitelisted") {
        summary.whitelisted += 1;
      } else if (row.listStatus === "blacklisted") {
        summary.blacklisted += 1;
      } else if (row.listStatus === "inactive") {
        summary.inactive += 1;
      } else {
        summary.reviewRequired += 1;
      }

      return summary;
    },
    {
      blacklisted: 0,
      inactive: 0,
      reviewRequired: 0,
      total: 0,
      whitelisted: 0
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

export async function getAdminSupplementsData(): Promise<AdminSupplementsData> {
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
        coalesce(alias_rows.aliases, '[]'::jsonb) as aliases
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
      order by supplements.category asc, supplements.name asc
      limit 1000
    `;
    const mappedRows = rows.map(rowFromDb);

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
      coalesce(alias_rows.aliases, '[]'::jsonb) as aliases
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
    where supplements.id = ${input.id}::uuid
    limit 1
  `;
  const before = beforeRows[0];

  if (!before) {
    throw new Error("Supplement not found");
  }

  await sql.begin(async (transaction) => {
    await transaction`
      update public.supplements
      set
        is_active = ${input.listStatus !== "inactive"},
        list_status = case
          when ${input.listStatus} = 'inactive' then list_status
          else ${input.listStatus}
        end,
        updated_at = now()
      where id = ${input.id}::uuid
    `;

    await transaction`
      update public.supplement_safety_limits
      set
        max_amount = ${input.maxAmount},
        max_unit = ${input.maxUnit},
        confidence = ${input.confidence},
        safety_flags = ${input.safetyFlags},
        safety_notes = ${input.safetyNotes},
        updated_at = now()
      where supplement_id = ${input.id}::uuid
        and version = (
          select max(version)
          from public.supplement_safety_limits
          where supplement_id = ${input.id}::uuid
        )
    `;

    await transaction`
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
        ${transaction.json(rowFromDb(before))},
        ${transaction.json(input)}
      )
    `;
  });

  const data = await getAdminSupplementsData();
  const row = data.rows.find((item) => item.id === input.id);

  if (!row) {
    throw new Error("Supplement update could not be reloaded");
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

  const deletedRows = await sql.begin(async (transaction) => {
    const aliasRows = await transaction<
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

    await transaction`
      delete from public.supplement_aliases
      where id = ${input.aliasId}::uuid
        and supplement_id = ${input.supplementId}::uuid
    `;

    await transaction`
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
        ${transaction.json(alias)},
        ${transaction.json({ aliasId: input.aliasId })}
      )
    `;

    return aliasRows;
  });

  if (deletedRows.length === 0) {
    throw new Error("Supplement association not found");
  }

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

  await sql.begin(async (transaction) => {
    const supplementRows = await transaction<{ id: string; name: string }[]>`
      select id::text, name
      from public.supplements
      where id = ${input.supplementId}::uuid
      limit 1
    `;
    const supplement = supplementRows[0];

    if (!supplement) {
      throw new Error("Supplement not found");
    }

    const beforeRows = await transaction<
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

    await transaction`
      insert into public.supplement_aliases (
        id,
        supplement_id,
        alias,
        normalized_alias,
        created_at
      )
      values (
        ${randomUUID()}::uuid,
        ${input.supplementId}::uuid,
        ${alias},
        ${normalizedAlias},
        now()
      )
      on conflict (normalized_alias) do update set
        supplement_id = excluded.supplement_id,
        alias = excluded.alias
    `;

    await transaction`
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
        ${before ? "alias_reassigned" : "alias_added"},
        ${input.actor ?? "admin_dashboard"},
        ${transaction.json(before ?? {})},
        ${transaction.json({ alias, normalizedAlias, supplementId: input.supplementId })}
      )
    `;
  });

  const data = await getAdminSupplementsData();
  const row = data.rows.find((item) => item.id === input.supplementId);

  if (!row) {
    throw new Error("Supplement update could not be reloaded");
  }

  return row;
}
