import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type {
  SupplementConfidence,
  SupplementSafetyFlag
} from "@/lib/admin-supplements";
import { convertAmount } from "@/lib/matcher/dose";
import { parseAdminLimitUnit } from "@/lib/matcher/safety-ceilings";
import type {
  SafetyLimitLifeStage,
  SafetySourceScope
} from "@/lib/matcher/types";
import { MATCHER_SOURCE_SCOPE } from "@/lib/matcher/types";

type Db = postgres.Sql | postgres.TransactionSql;

function isLooserThanExisting(input: Readonly<{
  existingAmount: number;
  existingUnit: string;
  nextAmount: number | null;
  nextUnit: string;
  supplementId: string;
}>) {
  if (input.nextAmount == null) {
    return true;
  }

  const existingUnit = parseAdminLimitUnit(input.existingUnit);
  const nextUnit = parseAdminLimitUnit(input.nextUnit);

  if (!existingUnit || !nextUnit) {
    return true;
  }

  const converted = convertAmount({
    amount: input.nextAmount,
    fromUnit: nextUnit,
    subjectId: input.supplementId,
    subjectName: input.supplementId,
    toUnit: existingUnit
  });

  if (converted == null || !Number.isFinite(converted)) {
    return true;
  }

  return converted > input.existingAmount + 1e-9;
}

export async function appendSupplementSafetyLimitBandVersion(
  db: Db,
  input: Readonly<{
    maxAmount: number;
    maxUnit: string;
    supplementId: string;
    basisRationale?: string | null;
    effectiveOn?: string | null;
    lifeStage?: SafetyLimitLifeStage;
    sourceScope?: SafetySourceScope;
    sourceUrl?: string | null;
  }>
) {
  const lifeStage = input.lifeStage ?? "adult";
  const sourceScope = input.sourceScope ?? MATCHER_SOURCE_SCOPE;
  const existing = await db<
    Array<{
      max_amount: string | number | null;
      max_unit: string;
    }>
  >`
    select max_amount, max_unit
    from public.supplement_safety_limit_bands
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

  if (
    previous &&
    previousAmount != null &&
    Number.isFinite(previousAmount) &&
    previousAmount > 0 &&
    isLooserThanExisting({
      existingAmount: previousAmount,
      existingUnit: previous.max_unit,
      nextAmount: input.maxAmount,
      nextUnit: input.maxUnit,
      supplementId: input.supplementId
    })
  ) {
    return Number(
      (
        await db<{ version: number | string }[]>`
          select version
          from public.supplement_safety_limit_bands
          where supplement_id = ${input.supplementId}::uuid
            and life_stage = ${lifeStage}
            and source_scope = ${sourceScope}
          order by version desc
          limit 1
        `
      )[0]?.version ?? 1
    );
  }

  const rows = await db<{ version: number | string }[]>`
    insert into public.supplement_safety_limit_bands (
      id,
      supplement_id,
      version,
      life_stage,
      source_scope,
      max_amount,
      max_unit,
      source_url,
      basis_rationale,
      effective_on,
      created_at
    )
    select
      ${randomUUID()}::uuid,
      ${input.supplementId}::uuid,
      coalesce(max(version), 0) + 1,
      ${lifeStage},
      ${sourceScope},
      ${input.maxAmount},
      ${input.maxUnit},
      ${input.sourceUrl ?? null},
      ${input.basisRationale ?? null},
      ${input.effectiveOn ?? null},
      now()
    from public.supplement_safety_limit_bands
    where supplement_id = ${input.supplementId}::uuid
      and life_stage = ${lifeStage}
      and source_scope = ${sourceScope}
    returning version
  `;

  return Number(rows[0]?.version ?? 1);
}

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
  if (input.maxAmount != null && input.maxAmount > 0 && input.maxUnit) {
    await appendSupplementSafetyLimitBandVersion(db, {
      lifeStage: "adult",
      maxAmount: input.maxAmount,
      maxUnit: input.maxUnit,
      sourceScope: MATCHER_SOURCE_SCOPE,
      supplementId: input.supplementId
    });
  }

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
