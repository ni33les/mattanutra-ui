import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { SupplementConfidence, SupplementSafetyFlag } from "@/lib/admin-supplements";
import type { SafetyLimitLifeStage, SafetySourceScope } from "@/lib/matcher/types";
import { MATCHER_SOURCE_SCOPE } from "@/lib/matcher/types";

export type SafetyReferenceDb = postgres.Sql | postgres.TransactionSql;
export type SupplementSafetyLimitInput = Readonly<{
  confidence: SupplementConfidence;
  maxAmount: number | null;
  maxUnit: string;
  safetyFlags: readonly SupplementSafetyFlag[];
  safetyNotes: string | null;
  supplementId: string;
  lifeStage?: SafetyLimitLifeStage;
  sourceScope?: SafetySourceScope;
  sourceUrl?: string | null;
  basisRationale?: string | null;
  skipIfUnchanged?: boolean;
  /** Bootstrap may populate an absent band, but can never replace its latest head. */
  onlyIfMissing?: boolean;
}>;

/** Every writer for a nutrient shares this transaction-scoped lock, including new bands. */
export async function lockSupplementSafetyReference(db: postgres.TransactionSql, supplementId: string) {
  const [lock] = await db`select pg_try_advisory_xact_lock(hashtextextended(${`supplement-safety-reference:${supplementId}`}, 0)) as acquired`;
  if (!lock?.acquired) throw Object.assign(new Error("Safety reference review is in progress; retry against the latest heads"), {
    code: "reference_review_in_progress"
  });
}

export async function withSafetyReferenceTransaction<T>(db: SafetyReferenceDb, work: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  if ("begin" in db) return db.begin(tx => work(tx)) as Promise<T>;
  return work(db);
}

/** Append a complete immutable head. Null is an explicit retirement, never a missing row. */
export async function appendSupplementSafetyLimitVersion(db: SafetyReferenceDb, input: SupplementSafetyLimitInput): Promise<number> {
  if (input.maxAmount !== null && (!Number.isFinite(input.maxAmount) || input.maxAmount <= 0)) throw new Error("Invalid safety reference amount");
  if (!input.maxUnit.trim()) throw new Error("Safety reference unit is required");
  return withSafetyReferenceTransaction(db, async tx => {
    await lockSupplementSafetyReference(tx, input.supplementId);
    const lifeStage = input.lifeStage ?? "adult";
    const sourceScope = input.sourceScope ?? MATCHER_SOURCE_SCOPE;
    const [previous] = await tx<Array<{
      version: number; max_amount: string | number | null; max_unit: string;
      confidence: string; safety_flags: string[]; safety_notes: string | null;
      source_url: string | null; basis_rationale: string | null;
    }>>`select version,max_amount,max_unit,confidence,safety_flags,safety_notes,source_url,basis_rationale
      from public.supplement_safety_limits where supplement_id=${input.supplementId}::uuid
        and life_stage=${lifeStage} and source_scope=${sourceScope} order by version desc limit 1`;
    if (previous && input.onlyIfMissing) return Number(previous.version);
    const sourceUrl = input.sourceUrl === undefined ? previous?.source_url ?? null : input.sourceUrl;
    const basisRationale = input.basisRationale === undefined ? previous?.basis_rationale ?? null : input.basisRationale;
    const flags = [...new Set(input.safetyFlags)].sort();
    if (previous && input.skipIfUnchanged &&
      (previous.max_amount == null ? null : Number(previous.max_amount)) === input.maxAmount &&
      previous.max_unit === input.maxUnit && previous.confidence === input.confidence &&
      JSON.stringify([...new Set(previous.safety_flags ?? [])].sort()) === JSON.stringify(flags) &&
      previous.safety_notes === input.safetyNotes && previous.source_url === sourceUrl && previous.basis_rationale === basisRationale) {
      return Number(previous.version);
    }
    const [inserted] = await tx`insert into public.supplement_safety_limits
      (id,supplement_id,version,life_stage,source_scope,max_amount,max_unit,confidence,safety_flags,safety_notes,source_url,basis_rationale)
      select ${randomUUID()}::uuid,${input.supplementId}::uuid,coalesce(max(version),0)+1,${lifeStage},${sourceScope},${input.maxAmount},
        ${input.maxUnit},${input.confidence},${flags},${input.safetyNotes},${sourceUrl},${basisRationale}
      from public.supplement_safety_limits where supplement_id=${input.supplementId}::uuid
        and life_stage=${lifeStage} and source_scope=${sourceScope}
      returning version`;
    return Number(inserted.version);
  });
}
