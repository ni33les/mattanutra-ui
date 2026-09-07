import type postgres from "postgres";
import { catalogueRecordFingerprint } from "@/lib/catalogue-corrections";
import {
  appendSupplementSafetyLimitVersion, lockSupplementSafetyReference, withSafetyReferenceTransaction,
  type SafetyReferenceDb, type SupplementSafetyLimitInput
} from "@/lib/supplement-safety-limit-versions";
import { SAFETY_LIMIT_LIFE_STAGES, SAFETY_SOURCE_SCOPES } from "@/lib/matcher/types";

export type SupplementSafetyHead = Readonly<{
  id: string; supplementId: string; version: number; lifeStage: string; sourceScope: string;
  maxAmount: number | null; maxUnit: string; confidence: string; safetyFlags: string[];
  safetyNotes: string | null; sourceUrl: string | null; basisRationale: string | null;
}>;
export type SupplementSafetyCorrection = Readonly<{
  environment: "dev" | "uat";
  manifestId: string;
  correctionId: string;
  supplementId: string;
  expectedHeadsFingerprint: string;
  changes: readonly Omit<SupplementSafetyLimitInput, "supplementId" | "skipIfUnchanged" | "onlyIfMissing">[];
  /** Original authority units, population, form, scope and review rationale remain verbatim. */
  evidence: Readonly<Record<string, unknown>>;
}>;
export type SupplementSafetyCorrectionReceipt = Readonly<{
  environment: "dev" | "uat"; correctionId: string; manifestId: string; supplementId: string;
  manifestSha256: string; beforeHeadsFingerprint: string; afterHeadsFingerprint: string;
  beforeHeads: readonly SupplementSafetyHead[]; afterHeads: readonly SupplementSafetyHead[];
  manifest: SupplementSafetyCorrection;
}>;

/** Select the head before interpreting null: retired bands still participate in integrity. */
export async function readSupplementSafetyHeads(db: SafetyReferenceDb, supplementId: string): Promise<SupplementSafetyHead[]> {
  const rows = await db`select distinct on (life_stage,source_scope)
      id::text,supplement_id::text,version,life_stage,source_scope,max_amount,max_unit,confidence,safety_flags,safety_notes,source_url,basis_rationale
    from public.supplement_safety_limits where supplement_id=${supplementId}::uuid
    order by life_stage,source_scope,version desc`;
  return rows.map(row => ({ id: String(row.id), supplementId: String(row.supplement_id), version: Number(row.version),
    lifeStage: String(row.life_stage), sourceScope: String(row.source_scope), maxAmount: row.max_amount == null ? null : Number(row.max_amount),
    maxUnit: String(row.max_unit), confidence: String(row.confidence), safetyFlags: [...row.safety_flags].sort(),
    safetyNotes: row.safety_notes, sourceUrl: row.source_url, basisRationale: row.basis_rationale }));
}

export function supplementSafetyHeadsFingerprint(heads: readonly SupplementSafetyHead[]) {
  return catalogueRecordFingerprint([...heads].sort((a, b) => `${a.lifeStage}:${a.sourceScope}`.localeCompare(`${b.lifeStage}:${b.sourceScope}`)));
}

export function verifySupplementSafetyCorrection(correction: SupplementSafetyCorrection) {
  if (!["dev", "uat"].includes(correction.environment)) throw new Error("Reference corrections require DEV or UAT");
  if (!correction.manifestId?.trim() || !correction.correctionId?.trim() || !/^[a-f0-9]{64}$/.test(correction.expectedHeadsFingerprint)) throw new Error("Invalid reference correction identity or fingerprint");
  if (!correction.changes?.length || !correction.evidence || !Object.keys(correction.evidence).length) throw new Error("Reference correction evidence and changes are required");
  const bands = new Set<string>();
  for (const change of correction.changes) {
    if (!SAFETY_LIMIT_LIFE_STAGES.includes(change.lifeStage!) || !SAFETY_SOURCE_SCOPES.includes(change.sourceScope!)) throw new Error("Reference correction requires an explicit population and source scope");
    const key = `${change.lifeStage}:${change.sourceScope}`;
    if (bands.has(key)) throw new Error("Reference correction repeats a band");
    bands.add(key);
    if (change.maxAmount !== null && (!Number.isFinite(change.maxAmount) || change.maxAmount <= 0)) throw new Error("Invalid reference correction amount");
    if (!change.maxUnit?.trim() || !change.basisRationale?.trim() || !/^https?:\/\//.test(change.sourceUrl ?? "")) throw new Error("Reference correction requires source URL, original unit and review rationale");
  }
}

async function readReceipt(db: SafetyReferenceDb, correction: SupplementSafetyCorrection): Promise<SupplementSafetyCorrectionReceipt | null> {
  const [row] = await db`select * from public.supplement_safety_reference_corrections
    where environment=${correction.environment} and correction_id=${correction.correctionId}`;
  return row ? { environment: row.environment, correctionId: row.correction_id, manifestId: row.manifest_id,
    supplementId: row.supplement_id, manifestSha256: row.manifest_sha256, beforeHeadsFingerprint: row.before_heads_fingerprint,
    afterHeadsFingerprint: row.after_heads_fingerprint, beforeHeads: row.before_heads, afterHeads: row.after_heads, manifest: row.manifest } : null;
}

/** Shared by dry-run and apply; a receipt never conceals subsequent reference drift. */
export function supplementSafetyCorrectionState(correction: SupplementSafetyCorrection, heads: readonly SupplementSafetyHead[], receipt: SupplementSafetyCorrectionReceipt | null) {
  verifySupplementSafetyCorrection(correction);
  const fingerprint = supplementSafetyHeadsFingerprint(heads);
  if (receipt) {
    if (receipt.manifestSha256 !== catalogueRecordFingerprint(correction)) throw new Error(`Reference correction manifest conflict: ${correction.correctionId}`);
    if (fingerprint !== receipt.afterHeadsFingerprint) throw new Error(`Reference correction replay drift: ${correction.correctionId}`);
    return "already_applied" as const;
  }
  if (fingerprint !== correction.expectedHeadsFingerprint) throw new Error(`Reference heads changed since review: ${correction.correctionId}`);
  return "pending" as const;
}

export async function inspectSupplementSafetyCorrection(db: SafetyReferenceDb, correction: SupplementSafetyCorrection) {
  const heads = await readSupplementSafetyHeads(db, correction.supplementId);
  const receipt = await readReceipt(db, correction);
  return { status: supplementSafetyCorrectionState(correction, heads, receipt), heads, receipt };
}

export async function applySupplementSafetyCorrection(db: SafetyReferenceDb, correction: SupplementSafetyCorrection) {
  verifySupplementSafetyCorrection(correction);
  return withSafetyReferenceTransaction(db, async (tx: postgres.TransactionSql) => {
    await lockSupplementSafetyReference(tx, correction.supplementId);
    const reviewed = await inspectSupplementSafetyCorrection(tx, correction);
    if (reviewed.status === "already_applied") return { status: reviewed.status, receipt: reviewed.receipt! };
    for (const change of correction.changes) await appendSupplementSafetyLimitVersion(tx, { ...change, supplementId: correction.supplementId });
    const afterHeads = await readSupplementSafetyHeads(tx, correction.supplementId);
    const receipt: SupplementSafetyCorrectionReceipt = {
      environment: correction.environment, manifestId: correction.manifestId, correctionId: correction.correctionId,
      supplementId: correction.supplementId, manifestSha256: catalogueRecordFingerprint(correction),
      beforeHeadsFingerprint: correction.expectedHeadsFingerprint, afterHeadsFingerprint: supplementSafetyHeadsFingerprint(afterHeads),
      beforeHeads: reviewed.heads, afterHeads, manifest: correction
    };
    await tx`insert into public.supplement_safety_reference_corrections
      (environment,correction_id,manifest_id,supplement_id,manifest_sha256,before_heads_fingerprint,after_heads_fingerprint,before_heads,after_heads,manifest)
      values (${receipt.environment},${receipt.correctionId},${receipt.manifestId},${receipt.supplementId}::uuid,${receipt.manifestSha256},
        ${receipt.beforeHeadsFingerprint},${receipt.afterHeadsFingerprint},${tx.json(JSON.parse(JSON.stringify(receipt.beforeHeads)))}::jsonb,
        ${tx.json(JSON.parse(JSON.stringify(receipt.afterHeads)))}::jsonb,${tx.json(JSON.parse(JSON.stringify(correction)))}::jsonb)`;
    return { status: "applied" as const, receipt };
  });
}
