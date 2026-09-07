import type postgres from "postgres";
import { getSql } from "@/lib/db";

/** Transactionally committed catalogue identity; reads never lock catalogue rows. */
export async function getCatalogueRuntimeRevision(sql: postgres.Sql | postgres.TransactionSql | null = getSql()): Promise<number> {
  if (!sql) return 0;
  const [row] = await sql`select revision from public.catalogue_runtime_revision where singleton=true`;
  if (!row) throw new Error("Catalogue runtime revision schema is not installed");
  return Number(row.revision);
}
