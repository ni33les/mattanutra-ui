import { adminAccessSchemaSql } from "./admin-access-schema.ts";
import { closeSqlPool, getSql } from "@/lib/db";

const sql = getSql();

if (!sql) {
  throw new Error("DB_CONNECTION is required to apply the admin access schema");
}

try {
  await sql.unsafe(adminAccessSchemaSql);
  console.log(JSON.stringify({ adminAccessSchema: "applied" }));
} finally {
  await closeSqlPool();
}
