import { readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { inspectApprovedAdvisoryCacheRefresh, refreshApprovedAdvisoryCaches, type AdvisoryCacheManifest } from "../lib/product-advisory-cache-refresh.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply"), prepare = args.includes("--prepare");
const path = args.find(arg => !arg.startsWith("--"));
if (!path || args.filter(arg => !arg.startsWith("--")).length !== 1 || (apply && prepare) || args.some(arg => arg.startsWith("--") && !["--apply", "--prepare"].includes(arg))) throw new Error("Usage: refresh-advisory-product-caches.ts [--prepare|--apply] reviewed-manifest.json. Default is read-only dry-run.");
const url = new URL(process.env.DB_URL ?? "postgresql://invalid");
const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
if (apply && !(loopback && process.env.DB_URL === process.env.TEST_DB_URL && /^\/mattanutra_lock_review(?:[_-][a-zA-Z0-9_-]+)?$/.test(url.pathname) || process.env.MATTANUTRA_ENV === "dev" && /dev/i.test(url.pathname))) throw new Error("Advisory cache writes require DEV or an isolated loopback TEST_DB_URL");
if (!process.env.DB_URL) throw new Error("DB_URL is required");
// The application pool's begin wrapper accepts a callback only. This bounded
// rollout command needs PostgreSQL's serializable transaction option explicitly.
const sql = postgres(process.env.DB_URL, { max: 1, connection: { application_name: "mattanutra-advisory-cache-refresh" } });
async function transaction<T>(readOnly: boolean, work: (tx: postgres.TransactionSql) => Promise<T>) {
  return sql.begin(readOnly ? "isolation level serializable read only" : "isolation level serializable", async tx => {
    await tx.unsafe("SET LOCAL statement_timeout = '15s'; SET LOCAL lock_timeout = '2s'; SET LOCAL idle_in_transaction_session_timeout = '10s'");
    return work(tx);
  });
}
try {
  if (prepare) {
    const manifest = await transaction(true, tx => inspectApprovedAdvisoryCacheRefresh(tx));
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ readOnly: true, reviewedCandidates: manifest.entries.length, manifest: path }));
  } else {
    const manifest = JSON.parse(await readFile(path, "utf8")) as AdvisoryCacheManifest;
    const results = await transaction(!apply, tx => refreshApprovedAdvisoryCaches(tx, manifest, apply));
    console.log(JSON.stringify({ apply, results }, null, 2));
  }
} finally { await sql.end(); }
