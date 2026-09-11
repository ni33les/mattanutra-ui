import { readFile } from "node:fs/promises";
import { getSql, closeSqlPool, withDatabaseTransaction } from "../lib/db.ts";

const sql = getSql();
if (!sql) throw new Error("Database is required for matching lock-boundary migration");
try {
  const migration = await readFile(new URL("../db-rollout/matching-lock-boundaries.sql", import.meta.url), "utf8");
  await withDatabaseTransaction(sql, async tx => { await tx.unsafe(migration); });
  const [row] = await sql`select
    exists(select 1 from pg_trigger where tgname='commit_catalogue_runtime_revision' and tgdeferrable and tginitdeferred) as deferred,
    position('task-dependency:' in pg_get_functiondef('public.prevent_task_dependency_cycle()'::regprocedure))>0 as scoped_dependencies,
    position('catalogue_revision_commits' in pg_get_functiondef('public.bump_catalogue_runtime_revision()'::regprocedure))>0 as commit_epoch`;
  if (!row?.deferred || !row.scoped_dependencies || !row.commit_epoch) throw new Error("Matching lock-boundary schema verification failed");
  console.log(JSON.stringify({ matchingLockBoundaries: "verified", catalogueValuesChanged: false }));
} finally { await closeSqlPool(); }
