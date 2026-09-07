import { readFile } from "node:fs/promises";
import { closeSqlPool, getSql } from "@/lib/db";
const sql = getSql();
if (!sql) throw new Error("Database connection is not configured");
try {
  await sql.unsafe(await readFile(new URL("../db-rollout/product-administration-schema.sql", import.meta.url), "utf8"));
  console.log("Product administration and immutable correction-audit schema applied");
} finally {
  await closeSqlPool();
}
