import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type {
  SupplementConfidence,
  SupplementSafetyFlag
} from "@/lib/admin-supplements";
import type {
  SafetyLimitLifeStage,
  SafetySourceScope
} from "@/lib/matcher/types";
import { MATCHER_SOURCE_SCOPE } from "@/lib/matcher/types";

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
    lifeStage?: SafetyLimitLifeStage;
    skipIfUnchanged?: boolean;
    sourceScope?: SafetySourceScope;
  }>
) {
  const lifeStage = input.lifeStage ?? "adult";
  const sourceScope = input.sourceScope ?? MATCHER_SOURCE_SCOPE;

  if (input.skipIfUnchanged) {
    const existing = await db<
      Array<{
        max_amount: string | number | null;
        max_unit: string;
      }>
    >`
      select max_amount, max_unit
      from public.supplement_safety_limits
      where supplement_id = ${input.supplementId}::uuid
        and life_stage = ${lifeStage}
        and source_scope = ${sourceScope}
      order by version desc
      limit 1
    `;
    const previous = existing[0];
    const previousAmount = previous?.max_amount == null
      ? null
      : Number(previous.max_amount);
    const nextAmount = input.maxAmount;

    if (
      previous &&
      ((nextAmount == null && previousAmount == null) ||
        (nextAmount != null &&
          previousAmount != null &&
          Number.isFinite(previousAmount) &&
          previousAmount === nextAmount &&
          previous.max_unit === input.maxUnit))
    ) {
      return Number(
        (
          await db<{ version: number | string }[]>`
            select version
            from public.supplement_safety_limits
            where supplement_id = ${input.supplementId}::uuid
              and life_stage = ${lifeStage}
              and source_scope = ${sourceScope}
            order by version desc
            limit 1
          `
        )[0]?.version ?? 1
      );
    }
  }

  const rows = await db<{ version: number | string }[]>`
    insert into public.supplement_safety_limits (
      id,
      supplement_id,
      version,
      life_stage,
      source_scope,
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
      ${lifeStage},
      ${sourceScope},
      ${input.maxAmount},
      ${input.maxUnit},
      ${input.confidence},
      ${[...input.safetyFlags]},
      ${input.safetyNotes},
      now(),
      now()
    from public.supplement_safety_limits
    where supplement_id = ${input.supplementId}::uuid
      and life_stage = ${lifeStage}
      and source_scope = ${sourceScope}
    returning version
  `;

  return Number(rows[0]?.version ?? 1);
}
