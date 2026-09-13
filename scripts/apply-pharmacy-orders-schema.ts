import { readFile } from "node:fs/promises";
import { getSql, closeSqlPool } from "@/lib/db";
const sql = getSql();
if (!sql) throw new Error("Database is required");
try {
  const [identity] = await sql`select current_database() as name`;
  if (identity.name !== "mattanutra-dev" && !String(identity.name).startsWith("mattanutra_lock_review_")) {
    throw new Error("Pharmacy rollout only permits DEV or isolated test databases");
  }
  const migration = await readFile(new URL("../db-rollout/pharmacy-orders.sql", import.meta.url), "utf8");
  await sql.begin(tx => tx.unsafe(migration));
  console.log("Pharmacy order source enabled; no business data changed");
} finally { await closeSqlPool(); }
