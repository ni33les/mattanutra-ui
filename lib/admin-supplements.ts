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

export type AdminSupplementRow = Readonly<{
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

function rowFromDb(row: SupplementDbRow): AdminSupplementRow {
  return {
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
        limits.safety_notes
      from public.supplements supplements
      left join lateral (
        select *
        from public.supplement_safety_limits limits
        where limits.supplement_id = supplements.id
        order by limits.version desc
        limit 1
      ) limits on true
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
      limits.safety_notes
    from public.supplements supplements
    left join lateral (
      select *
      from public.supplement_safety_limits limits
      where limits.supplement_id = supplements.id
      order by limits.version desc
      limit 1
    ) limits on true
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
