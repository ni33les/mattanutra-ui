import { readFile } from "node:fs/promises";
import { closeSqlPool, getSql } from "@/lib/db";
const sql = getSql();
if (!sql) throw new Error("Database connection is not configured");
try {
  await sql.unsafe(await readFile(new URL("../db-rollout/supplement-safety-reference-integrity-schema.sql", import.meta.url), "utf8"));
  console.log("Supplement safety reference correction receipts schema applied");
} finally { await closeSqlPool(); }
