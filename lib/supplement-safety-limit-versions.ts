import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type {
  SupplementConfidence,
  SupplementSafetyFlag
} from "@/lib/admin-supplements";

type Db = postgres.Sql | postgres.TransactionSql;

export async function appendSupplementSafetyLimitVersion(
  db: Db,
  input: Readonly<{
    confidence: SupplementConfidence;
    maxAmount: number | null;
    maxUnit: string;
    safetyFlags: readonly SupplementSafetyFlag[];
    safetyNotes: string | null;
    supplementId: string;
  }>
) {
  const rows = await db<{ version: number | string }[]>`
    insert into public.supplement_safety_limits (
      id,
      supplement_id,
      version,
      max_amount,
      max_unit,
      confidence,
      safety_flags,
      safety_notes,
      created_at,
      updated_at
    )
    select
      ${randomUUID()}::uuid,
      ${input.supplementId}::uuid,
      coalesce(max(version), 0) + 1,
      ${input.maxAmount},
      ${input.maxUnit},
      ${input.confidence},
      ${[...input.safetyFlags]},
      ${input.safetyNotes},
      now(),
      now()
    from public.supplement_safety_limits
    where supplement_id = ${input.supplementId}::uuid
    returning version
  `;

  return Number(rows[0]?.version ?? 1);
}
