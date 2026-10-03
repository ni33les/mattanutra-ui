import { readFileSync } from "node:fs";
import postgres from "postgres";
if (!process.env.DB_URL) throw new Error("DB_URL is required");
const sql = postgres(process.env.DB_URL, { max: 1, prepare: false, onnotice() {} });
try {
  await sql.begin(async tx => {
    await tx`set local lock_timeout='5s'`;
    await tx`set local statement_timeout='30s'`;
    await tx.unsafe(readFileSync(new URL("./meta-tracking-schema.sql", import.meta.url), "utf8"));
  });
  console.log(JSON.stringify({ schema: "meta-tracking-v1", applied: true }));
} finally { await sql.end(); }
