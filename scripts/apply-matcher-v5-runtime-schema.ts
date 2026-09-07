import { readFile } from "node:fs/promises";
import { closeSqlPool, getSql } from "@/lib/db";
const sql = getSql();
if (!sql) throw new Error("Database connection is not configured");
try {
  await sql.unsafe(await readFile(new URL("../db-rollout/matcher-v5-runtime-schema.sql", import.meta.url), "utf8"));
  console.log("Matcher v5 catalogue revision and search-effort schema applied");
} finally { await closeSqlPool(); }
