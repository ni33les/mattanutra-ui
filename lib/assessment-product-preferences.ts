import type postgres from "postgres";
import { FunnelError } from "@/lib/funnel-errors";

type Db = postgres.Sql | postgres.TransactionSql;
export type AssessmentProductPreferences = Readonly<{ revision: number; excludedProductIds: readonly string[] }>;

export function normalizedProductExclusions(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some(id => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new FunnelError("excludeProductIds must contain at most 100 product UUIDs", 400, "invalid_product_exclusions");
  }
  return [...new Set(value.map(id => id.toLowerCase()))].sort();
}

export async function getAssessmentProductPreferences(sql: Db, planId: string, lock = false): Promise<AssessmentProductPreferences> {
  if (lock) await sql`insert into public.assessment_product_preferences (plan_id) values (${planId}::uuid) on conflict do nothing`;
  const [row] = lock
    ? await sql`select revision, excluded_product_ids from public.assessment_product_preferences where plan_id = ${planId}::uuid for update`
    : await sql`select revision, excluded_product_ids from public.assessment_product_preferences where plan_id = ${planId}::uuid`;
  return { revision: Number(row?.revision ?? 0), excludedProductIds: row?.excluded_product_ids ?? [] };
}

export function requireCurrentProductSelection(input: Readonly<{ expectedAssessmentRevision?: number | null; assessmentRevision: number; expectedSelectionRevision?: number | null; selectionRevision: number; runSelectionRevision: number; expectedRunId?: string | null; runId: string; optionId?: string | null; availableOptionIds: readonly string[]; selectedIds: readonly string[]; allowedIds: readonly string[]; excludedIds: readonly string[] }>) {
  if ((input.expectedAssessmentRevision != null && input.expectedAssessmentRevision !== input.assessmentRevision) ||
      (input.expectedSelectionRevision != null && input.expectedSelectionRevision !== input.selectionRevision) ||
      input.runSelectionRevision !== input.selectionRevision || (input.expectedRunId && input.expectedRunId !== input.runId) ||
      (input.optionId && !input.availableOptionIds.includes(input.optionId))) {
    throw new FunnelError("Product options changed. Reload and confirm the current basket.", 409, "stale_product_selection");
  }
  if (!input.selectedIds.length || new Set(input.selectedIds).size !== new Set(input.allowedIds).size || input.selectedIds.some(id => !input.allowedIds.includes(id) || input.excludedIds.includes(id))) {
    throw new FunnelError("Selected products do not belong to the current option. Replan after excluding a product.", 409, "invalid_product_selection");
  }
}
