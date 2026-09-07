import type postgres from "postgres";
import { loadProductRows } from "./admin-product-read-model.ts";
import { rowFromDb } from "./admin-product-mappers.ts";
import { refreshAndPersistProductValidation } from "./admin-product-writes.ts";
import { catalogueRecordFingerprint } from "./catalogue-corrections.ts";

type Db = postgres.Sql | postgres.TransactionSql;
type ExpectedValidation = Readonly<{ status: "pass"; matchableFactCount: number; reasons: readonly string[]; summary: string }>;
export type AdvisoryCacheManifest = Readonly<{ version: 1; policy: "health-advisory-v5"; entries: readonly Readonly<{
  correctionId: string; productId: string; title: string; beforeFingerprint: string; expectedValidation: ExpectedValidation;
}>[] }>;

async function readState(sql: Db, productId: string) {
  const [product] = await sql`select * from public.products where id=${productId}::uuid`;
  const [row] = await loadProductRows(productId, { sql }) ?? [];
  if (!product || !row) throw new Error(`Product missing during advisory cache review: ${productId}`);
  const validation = rowFromDb(row).validation;
  const currentValidation = { status: validation.status, matchableFactCount: validation.matchableFactCount,
    reasons: validation.reasons, summary: validation.summary };
  // JSON conversion preserves PostgreSQL dates as ISO values before canonical hashing.
  const record = JSON.parse(JSON.stringify({ product, validationInput: {
    facts: [...(Array.isArray(row.facts) ? row.facts : [])].sort((a, b) => String(a.id).localeCompare(String(b.id))),
    imageUrl: row.image_url, labelStatus: row.label_status, productUrl: row.product_url, sourceUrl: row.source_url, title: row.title
  } }));
  return { product, validation: currentValidation, record, fingerprint: catalogueRecordFingerprint(record) };
}

export async function inspectApprovedAdvisoryCacheRefresh(sql: Db, productId?: string): Promise<AdvisoryCacheManifest> {
  const rows = productId
    ? await sql`select id from public.products where id=${productId}::uuid and status='approved' and 'unsafe_dose'=any(coalesce(validation_reasons,ARRAY[]::text[])) order by id`
    : await sql`select id from public.products where status='approved' and 'unsafe_dose'=any(coalesce(validation_reasons,ARRAY[]::text[])) order by id`;
  const entries: AdvisoryCacheManifest["entries"][number][] = [];
  for (const row of rows) {
    const state = await readState(sql, row.id);
    if (state.validation.status !== "pass") continue;
    entries.push({ correctionId: `health-advisory-v5:${row.id}:${state.fingerprint.slice(0, 16)}`, productId: row.id,
      title: state.product.title, beforeFingerprint: state.fingerprint, expectedValidation: { ...state.validation, status: "pass" } });
  }
  return { version: 1, policy: "health-advisory-v5", entries };
}

/** Caller supplies a serializable transaction. Only reviewed caches change; catalogue approvals never do. */
export async function refreshApprovedAdvisoryCaches(tx: postgres.TransactionSql, manifest: AdvisoryCacheManifest, apply: boolean) {
  if (manifest.version !== 1 || manifest.policy !== "health-advisory-v5" || !Array.isArray(manifest.entries) ||
      new Set(manifest.entries.map(row => row.productId)).size !== manifest.entries.length) throw new Error("Invalid advisory cache manifest");
  const manifestSha = catalogueRecordFingerprint(manifest);
  if (apply) {
    const [isolation] = await tx`show transaction_isolation`;
    if (isolation.transaction_isolation !== "serializable") throw new Error("Advisory cache refresh requires a serializable transaction");
  }
  if (apply && manifest.entries.length) await tx`select revision from public.catalogue_runtime_revision where singleton=true for update`;
  const results: { productId: string; status: "pending" | "applied" | "already_applied" }[] = [];
  for (const entry of manifest.entries) {
    if (!/^[a-f0-9]{64}$/.test(entry.beforeFingerprint) || entry.expectedValidation.status !== "pass" ||
        entry.correctionId !== `health-advisory-v5:${entry.productId}:${entry.beforeFingerprint.slice(0, 16)}`) throw new Error("Invalid advisory cache entry");
    if (apply) await tx`select id from public.products where id=${entry.productId}::uuid for update`;
    const state = await readState(tx, entry.productId);
    const [existing] = await tx`select manifest_sha256,after_fingerprint from public.catalogue_correction_audit where correction_id=${entry.correctionId}`;
    if (existing) {
      if (existing.manifest_sha256 !== manifestSha || existing.after_fingerprint !== state.fingerprint) throw new Error(`Previously refreshed product changed since review: ${entry.productId}`);
      results.push({ productId: entry.productId, status: "already_applied" });
      continue;
    }
    if (state.fingerprint !== entry.beforeFingerprint) throw new Error(`Product changed since review: ${entry.productId}`);
    if (state.product.status !== "approved" || !state.product.validation_reasons?.includes("unsafe_dose") ||
        catalogueRecordFingerprint(state.validation) !== catalogueRecordFingerprint(entry.expectedValidation)) throw new Error(`Product is not eligible for advisory cache refresh: ${entry.productId}`);
    if (apply) {
      const refreshed = await refreshAndPersistProductValidation(tx, entry.productId);
      if (refreshed.status !== "approved" || refreshed.validation.status !== "pass") throw new Error(`Advisory cache refresh changed approval: ${entry.productId}`);
      const after = await readState(tx, entry.productId);
      if (catalogueRecordFingerprint(after.record.validationInput) !== catalogueRecordFingerprint(state.record.validationInput)) throw new Error(`Validation inputs changed during advisory cache refresh: ${entry.productId}`);
      await tx`insert into public.catalogue_correction_audit (correction_id,manifest_sha256,entity_table,entity_id,before_fingerprint,after_fingerprint,before_record,after_record,evidence)
        values (${entry.correctionId},${manifestSha},'products',${entry.productId},${entry.beforeFingerprint},${after.fingerprint},${tx.json(state.record)},${tx.json(after.record)},
        ${tx.json({ policy: manifest.policy, summary: "Refresh an already approved product's stale health-veto cache using current validated facts; preserve approval and all label facts." })})`;
    }
    results.push({ productId: entry.productId, status: apply ? "applied" : "pending" });
  }
  return results;
}
