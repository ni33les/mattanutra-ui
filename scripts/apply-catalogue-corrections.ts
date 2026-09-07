import { readFile } from "node:fs/promises";
import { closeSqlPool, getSql } from "@/lib/db";
import { catalogueCorrectionState, catalogueRecordFingerprint, validateCatalogueCorrectionTarget, type CatalogueCorrectionManifest } from "@/lib/catalogue-corrections";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const manifestPath = args.find(arg => !arg.startsWith("--"));
if (!manifestPath) throw new Error("Pass a reviewed manifest path; read-only by default. --apply permits the matching DEV/UAT environment or an isolated database.");
const environment = process.env.MATTANUTRA_ENV;
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CatalogueCorrectionManifest;
if (manifest.version !== 1 || !Array.isArray(manifest.corrections) || !manifest.corrections.length) throw new Error("Invalid or empty catalogue correction manifest");
if (apply) validateCatalogueCorrectionTarget(manifest, environment, process.env.DB_URL ?? "postgresql://invalid");
const sql = getSql();
if (!sql) throw new Error("Database connection is not configured");
try {
  const manifestSha = catalogueRecordFingerprint(manifest);
  const result = await sql.begin(async transaction => {
    if (!apply) await transaction.unsafe("SET TRANSACTION READ ONLY");
    const outcomes = [];
    for (const correction of manifest.corrections) {
      if (!["products", "product_facts"].includes(correction.entityTable)) throw new Error("Invalid correction entity table");
      const rows = await transaction.unsafe(`SELECT * FROM public.${correction.entityTable} WHERE id=$1${apply ? " FOR UPDATE" : ""}`, [correction.entityId]);
      if (rows.length !== 1) throw new Error(`Correction entity missing: ${correction.correctionId}`);
      const current = rows[0];
      const status = catalogueCorrectionState(correction, current);
      const existing = await transaction`select manifest_sha256 from public.catalogue_correction_audit where correction_id=${correction.correctionId}`;
      if (existing.length && existing[0].manifest_sha256 !== manifestSha) throw new Error(`Correction identifier already belongs to a different manifest: ${correction.correctionId}`);
      if (existing.length && status !== "already_applied") throw new Error(`Previously corrected entity has changed: ${correction.correctionId}`);
      if (apply && !existing.length) {
        if (status === "already_applied") throw new Error(`Unrecorded correction must be reviewed before claiming it applied: ${correction.correctionId}`);
        const patch = Object.fromEntries(Object.keys(correction.after).filter(key => JSON.stringify(correction.after[key]) !== JSON.stringify(correction.before[key])).map(key => [key, correction.after[key]]));
        if (correction.entityTable === "products") {
          await transaction`update public.products set administration=${transaction.json(patch.administration as never)}, updated_at=now() where id=${correction.entityId}`;
        } else {
          await transaction`update public.product_facts set ${transaction(patch)}, updated_at=now() where id=${correction.entityId}`;
        }
        const [after] = await transaction.unsafe(`SELECT * FROM public.${correction.entityTable} WHERE id=$1`, [correction.entityId]);
        if (catalogueCorrectionState(correction, after) !== "already_applied") throw new Error(`Correction did not produce reviewed result: ${correction.correctionId}`);
        await transaction`insert into public.catalogue_correction_audit (correction_id,manifest_sha256,entity_table,entity_id,before_fingerprint,after_fingerprint,before_record,after_record,evidence) values (${correction.correctionId},${manifestSha},${correction.entityTable},${correction.entityId},${correction.beforeFingerprint},${correction.afterFingerprint},${transaction.json(current as never)},${transaction.json(after as never)},${transaction.json(correction.evidence)})`;
      }
      outcomes.push({ correctionId: correction.correctionId, status: apply && status === "pending" ? "applied" : status });
    }
    return outcomes;
  });
  console.log(JSON.stringify({ apply, manifestSha256: manifestSha, outcomes: result }, null, 2));
} finally { await closeSqlPool(); }
