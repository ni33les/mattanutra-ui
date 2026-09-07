import { publicSupplementId } from "@/lib/agentic/contract/ids";
import { getSql } from "@/lib/db";
import { getCatalogueRuntimeRevision } from "@/lib/catalogue-runtime-revision";
import { catalogueRecordFingerprint } from "@/lib/catalogue-corrections";
import {
  matcherSafetyCeilings, matcherSafetyCeilingsCachedAt, matcherSafetyReferenceIdentity,
  parseAdminLimitDose, setMatcherSafetyCeilings, setMatcherSafetyCeilingsUnavailable
} from "@/lib/matcher/safety-ceilings";
import type { SafetyReferenceDb } from "@/lib/supplement-safety-limit-versions";
import type { SafetyCeiling, SafetyLimitLifeStage, SafetySourceScope } from "@/lib/matcher/types";
import { SAFETY_LIMIT_LIFE_STAGES, SAFETY_SOURCE_SCOPES } from "@/lib/matcher/types";

const LIMITS_TTL_MS = 10 * 60_000;
const inflight = new Map<number, Promise<SafetyCeiling[]>>();
export type SafetyReferenceSnapshot = Readonly<{ runtimeRevision: number; fingerprint: string; ceilings: SafetyCeiling[] }>;

/** Heads and epoch come from one MVCC snapshot, including retired/null heads. */
export async function loadAdminSafetyReferenceSnapshot(sql: SafetyReferenceDb): Promise<SafetyReferenceSnapshot> {
  const [snapshot] = await sql<Array<{ revision: number | string; heads: Array<{
    band_id: string; band_version: number; supplement_id: string; name: string;
    life_stage: string; source_scope: string; max_amount: number | null; max_unit: string;
    confidence: string; safety_flags: string[]; safety_notes: string | null; source_url: string | null; basis_rationale: string | null;
  }> }>>`select runtime.revision, coalesce((
      select jsonb_agg(to_jsonb(heads) order by heads.supplement_id,heads.life_stage,heads.source_scope)
      from (
        select distinct on (limits.supplement_id,limits.life_stage,limits.source_scope)
          limits.id::text as band_id,limits.version as band_version,limits.supplement_id::text,supplements.name,
          limits.life_stage,limits.source_scope,limits.max_amount,limits.max_unit,limits.confidence,
          limits.safety_flags,limits.safety_notes,limits.source_url,limits.basis_rationale
        from public.supplement_safety_limits limits join public.supplements supplements on supplements.id=limits.supplement_id
        order by limits.supplement_id,limits.life_stage,limits.source_scope,limits.version desc
      ) heads
    ),'[]'::jsonb) as heads from public.catalogue_runtime_revision runtime where singleton=true`;
  if (!snapshot) throw new Error("Safety reference catalogue epoch is unavailable");
  const ceilings: SafetyCeiling[] = [];
  for (const row of snapshot.heads) {
    if (row.max_amount == null) continue;
    const dose = parseAdminLimitDose(Number(row.max_amount), row.max_unit);
    if (!dose ||
      !(SAFETY_LIMIT_LIFE_STAGES as readonly string[]).includes(row.life_stage) ||
      !(SAFETY_SOURCE_SCOPES as readonly string[]).includes(row.source_scope)) continue;
    const ceiling: SafetyCeiling = {
      bandId: row.band_id, bandVersion: Number(row.band_version),
      referenceConfidence: row.confidence === "high" || row.confidence === "moderate" ? row.confidence : "low",
      basisRationale: row.basis_rationale,
      ...(row.source_url?.trim() ? { authorityUrl: row.source_url.trim() } : {}),
      lifeStage: row.life_stage as SafetyLimitLifeStage, sourceScope: row.source_scope as SafetySourceScope,
      maxAmount: dose.amount, maxUnit: dose.unit, name: row.name, subjectId: row.supplement_id
    };
    ceilings.push(ceiling, { ...ceiling, subjectId: publicSupplementId(row.supplement_id) });
  }
  return { runtimeRevision: Number(snapshot.revision), fingerprint: catalogueRecordFingerprint(snapshot.heads), ceilings };
}

export async function refreshAdminSafetyCeilings(options: { runtimeRevision?: number; sql?: SafetyReferenceDb; force?: boolean } = {}): Promise<SafetyCeiling[]> {
  const sql = options.sql ?? getSql();
  if (!sql) return matcherSafetyCeilings();
  const revision = options.runtimeRevision ?? await getCatalogueRuntimeRevision(sql);
  if (!options.force && matcherSafetyReferenceIdentity()?.runtimeRevision === revision &&
    Date.now() - matcherSafetyCeilingsCachedAt() < LIMITS_TTL_MS) return matcherSafetyCeilings();
  const existing = inflight.get(revision);
  if (existing && !options.sql) return existing;
  const pending = loadAdminSafetyReferenceSnapshot(sql).then(snapshot => {
    if (snapshot.runtimeRevision !== revision) throw new Error("Safety reference epoch changed during catalogue load; retry matching");
    setMatcherSafetyCeilings(snapshot.ceilings, { runtimeRevision: snapshot.runtimeRevision, fingerprint: snapshot.fingerprint });
    return snapshot.ceilings;
  }).catch(error => {
    // An earlier epoch is never a fallback for newly changed or retired references.
    if (matcherSafetyReferenceIdentity()?.runtimeRevision !== revision) setMatcherSafetyCeilings([]);
    setMatcherSafetyCeilingsUnavailable();
    throw error;
  }).finally(() => { if (inflight.get(revision) === pending) inflight.delete(revision); });
  if (!options.sql) inflight.set(revision, pending);
  return pending;
}
