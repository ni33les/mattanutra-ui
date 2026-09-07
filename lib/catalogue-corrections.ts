import { createHash } from "node:crypto";

export type CatalogueCorrection = Readonly<{
  correctionId: string;
  entityTable: "products" | "product_facts";
  entityId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  beforeFingerprint: string;
  afterFingerprint: string;
  evidence: Readonly<{ sourceUrl: string; checkedAt: string; summary: string }>;
}>;
export type CatalogueCorrectionManifest = Readonly<{ version: 1; environment?: "dev" | "uat"; corrections: readonly CatalogueCorrection[] }>;

/** A reviewed UAT manifest must never be mistaken for the DEV before-state. */
export function validateCatalogueCorrectionTarget(manifest: CatalogueCorrectionManifest, environment: string | undefined, databaseUrl: string) {
  const url = new URL(databaseUrl);
  const isolated = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && /^\/mattanutra_lock_review(?:[_-][a-zA-Z0-9_-]+)?$/.test(url.pathname);
  if (isolated) return;
  if (!manifest.environment || manifest.environment !== environment || !["dev", "uat"].includes(environment ?? "")) throw new Error("Catalogue writes require the matching reviewed DEV or UAT manifest");
  if (!new RegExp(`(?:^|[-_])${environment}$`, "i").test(url.pathname.slice(1))) throw new Error("Catalogue correction database does not match its reviewed environment");
}

export function catalogueRecordFingerprint(record: unknown): string {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    return value;
  }
  return createHash("sha256").update(JSON.stringify(canonical(record))).digest("hex");
}

export function verifyCatalogueCorrection(correction: CatalogueCorrection) {
  if (catalogueRecordFingerprint(correction.before) !== correction.beforeFingerprint || catalogueRecordFingerprint(correction.after) !== correction.afterFingerprint) throw new Error(`Invalid correction manifest fingerprint: ${correction.correctionId}`);
  if (correction.before.id !== correction.entityId || correction.after.id !== correction.entityId) throw new Error(`Correction cannot change identity: ${correction.correctionId}`);
  if (!correction.evidence.sourceUrl || !correction.evidence.summary) throw new Error(`Missing correction evidence: ${correction.correctionId}`);
  const allowed = new Set(correction.entityTable === "products" ? ["administration"] : ["amount", "unit", "name", "normalized_name", "serving_label", "supplement_id", "confidence", "source", "source_url", "source_text"]);
  for (const key of new Set([...Object.keys(correction.before), ...Object.keys(correction.after)])) {
    if (JSON.stringify(correction.before[key]) !== JSON.stringify(correction.after[key]) && !allowed.has(key)) throw new Error(`Unsupported correction field ${key}: ${correction.correctionId}`);
  }
}

/** Compare only the reviewed fields; unrelated product edits are never overwritten. */
export function catalogueCorrectionState(correction: CatalogueCorrection, current: Record<string, unknown>) {
  verifyCatalogueCorrection(correction);
  const selected = Object.fromEntries(Object.keys(correction.before).map(key => {
    const value = current[key] ?? null;
    // PostgreSQL numeric columns may be returned as strings; compare their typed reviewed value.
    return [key, typeof correction.before[key] === "number" && value != null ? Number(value) : value];
  }));
  const fingerprint = catalogueRecordFingerprint(selected);
  if (fingerprint === correction.afterFingerprint) return "already_applied" as const;
  if (fingerprint === correction.beforeFingerprint) return "pending" as const;
  throw new Error(`Catalogue changed since review: ${correction.correctionId}`);
}
