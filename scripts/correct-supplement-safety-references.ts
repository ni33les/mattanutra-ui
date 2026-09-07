import { readFile } from "node:fs/promises";
import { closeSqlPool, getSql } from "@/lib/db";
import { applySupplementSafetyCorrection, inspectSupplementSafetyCorrection, verifySupplementSafetyCorrection,
  type SupplementSafetyCorrection } from "@/lib/supplement-safety-reference-corrections";

const args = process.argv.slice(2);
const option = (name: string) => args[args.indexOf(name) + 1];
const manifestPath = args.includes("--manifest") ? option("--manifest") : undefined;
const environment = args.includes("--environment") ? option("--environment") : undefined;
if (!manifestPath || !["dev", "uat"].includes(environment ?? "") || process.env.MATTANUTRA_ENV !== environment) {
  throw new Error("Use --manifest <file> --environment dev|uat with matching MATTANUTRA_ENV; default is dry-run");
}
const target = new URL(process.env.DB_URL ?? "");
const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(target.hostname);
if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new Error("Reference correction database protocol is invalid");
if (loopback && (target.hostname !== "127.0.0.1" || !target.port || ["5432", "80", "443", "3000"].includes(target.port) ||
    !/^\/mattanutra_lock_review[_a-zA-Z0-9]*$/.test(target.pathname) || target.search || target.hash)) {
  throw new Error("Local reference corrections require an explicitly isolated mattanutra_lock_review database");
}
if (!loopback && target.pathname.match(/(dev|uat)$/)?.[1] !== environment) {
  throw new Error("Remote reference correction database must end with the selected environment");
}
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as SupplementSafetyCorrection | { environment: string; corrections: SupplementSafetyCorrection[] };
if (manifest.environment !== environment) throw new Error("Reference manifest environment mismatch");
const corrections = "corrections" in manifest ? manifest.corrections : [manifest];
if (!Array.isArray(corrections) || !corrections.length || corrections.some(correction => correction.environment !== environment)) throw new Error("Reference manifest environment mismatch");
if (new Set(corrections.map(correction => correction.correctionId)).size !== corrections.length ||
    new Set(corrections.map(correction => correction.manifestId)).size !== 1) throw new Error("Reference manifest contains duplicate corrections or inconsistent manifest IDs");
for (const correction of corrections) verifySupplementSafetyCorrection(correction);
const sql = getSql();
if (!sql) throw new Error("Database is not configured");
try {
  const [resolved] = await sql`select current_database() as name`;
  if (resolved?.name !== decodeURIComponent(target.pathname.slice(1))) throw new Error("Resolved reference correction database does not match the selected target");
  // Validate every reviewed head before applying the first nutrient correction.
  for (const correction of corrections) await inspectSupplementSafetyCorrection(sql, correction);
  for (const correction of corrections) {
    const result = args.includes("--apply") ? await applySupplementSafetyCorrection(sql, correction) : await inspectSupplementSafetyCorrection(sql, correction);
    console.log(JSON.stringify({ environment, manifestId: correction.manifestId, correctionId: correction.correctionId,
      supplementId: correction.supplementId, mode: args.includes("--apply") ? "apply" : "dry-run", status: result.status }));
  }
} finally { await closeSqlPool(); }
