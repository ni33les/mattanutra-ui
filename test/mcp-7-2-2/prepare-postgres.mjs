import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postgres from "postgres";

// Isolated operation tests need the actual task columns and checks, not the
// payload pack's intentionally minimal task stub. No customer data is copied.
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55439");
assert.match(url.pathname, /^\/mattanutra_lock_review_ax_mcp722(?:_[a-z0-9]+)?$/);
const sql = postgres(url.href, { max: 1, prepare: false });
try {
 await sql.begin(async sql => {
  const base = readFileSync("db-rollout/db-rollout.sql", "utf8");
  const [existing] = await sql`select to_regclass('public.tasks') as tasks, to_regclass('public.products') as products`;
  assert.equal(existing.tasks, null, "Prepare a clean isolated schema, never replace existing task data");
  assert.equal(existing.products, null, "Do not overwrite a catalogue");
  for (const name of ["tasks", "task_events", "task_dependencies"]) {
    const definition = base.match(new RegExp(`CREATE TABLE public\\.${name} \\([\\s\\S]*?\\n\\);`));
    assert.ok(definition, `Missing maintained DDL for ${name}`);
    await sql.unsafe(definition[0]);
    await sql.unsafe(`alter table public.${name} add primary key (${name === "task_dependencies" ? "task_id,depends_on_task_id" : "id"})`);
  }
  await sql.unsafe(`create table public.organisations (id uuid primary key,slug text not null,organisation_type text not null,status text not null);
    insert into public.organisations values ('00000000-0000-4000-8000-000000000001','mattanutra','platform','active');
    alter table public.tasks add column organisation_id uuid references public.organisations(id),
      add column priority_score integer,add column priority_reason text,add column profit_impact_amount numeric,
      add column profit_impact_currency text,add column due_at timestamptz,add column source_entity_type text,add column source_entity_id uuid;
    create unique index tasks_fixture_idempotency on public.tasks(idempotency_scope_key,idempotency_key);
    create table public.products (id uuid primary key,administration jsonb,updated_at timestamptz default now());`);
  await sql.unsafe(readFileSync("db-rollout/product-administration-schema.sql", "utf8"));
  const correction = JSON.parse(readFileSync("data/catalogue-corrections/mcp-7.2.2-dev.json", "utf8")).corrections[0];
  await sql`insert into public.products (id,administration) values (${correction.entityId},null)`;
 });
  console.log(JSON.stringify({ isolated: true, database: url.pathname.slice(1), taskDdl: "db-rollout/db-rollout.sql", fullApplicationSchema: false }));
} finally { await sql.end(); }
