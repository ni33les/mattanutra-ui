import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { closeSqlPool } from "../lib/db.ts";
import { persistMatcherTelemetry } from "../lib/agentic/plan/telemetry.ts";
import { planAResult } from "./helpers/com-fixtures.ts";

const databaseUrl = process.env.TEST_DB_URL;
assert.ok(databaseUrl, "Fractional telemetry tests require an isolated TEST_DB_URL");
const database = new URL(databaseUrl);
assert.equal(database.hostname, "127.0.0.1");
assert.match(database.pathname, /^\/mattanutra_lock_review(?:[_-][a-zA-Z0-9_-]+)?$/);
assert.equal(process.env.DB_URL, databaseUrl);
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
const planId = randomUUID();
const historicalEventId = randomUUID();

before(async () => {
  await sql`insert into public.agentic_plans (id,environment,tenant_scope) values (${planId},'dev','fractional-telemetry-fixture')`;
  await sql`insert into public.agentic_matcher_events (id,plan_id,revision,coverage_percent) values (${historicalEventId},${planId},1,42)`;
});
after(async () => {
  try {
    await sql`delete from public.agentic_matcher_events where plan_id=${planId}`;
    await sql`delete from public.agentic_plans where id=${planId}`;
  } finally { await closeSqlPool(); await sql.end(); }
});

test("TELEMETRY5-PG-01 matcher writes preserve fractional and unknown coverage without losing event context", async () => {
  const original = planAResult();
  const values = [66.67, 99.9, null];
  for (const [index, coveragePercent] of values.entries()) {
    await persistMatcherTelemetry({ planId, revision: index + 2,
      result: { ...original, matcherTelemetry: { ...original.matcherTelemetry, coveragePercent } } });
  }
  const rows = await sql`select revision,coverage_percent,requested_doses,product_ids,constraints from public.agentic_matcher_events where plan_id=${planId} order by revision`;
  assert.equal(rows.length, 4, "Every attempted telemetry event is durably persisted, including partial coverage");
  assert.deepEqual(rows.map(row => row.coverage_percent == null ? null : String(row.coverage_percent)), ["42", "66.67", "99.9", null]);
  for (const row of rows.slice(1)) {
    assert.deepEqual(row.requested_doses, original.matcherTelemetry.requestedDoses);
    assert.deepEqual(row.product_ids, original.matcherTelemetry.productIds);
    assert.equal(row.constraints.matcherVersion, original.matcherTelemetry.matcherVersion);
  }
});

test("TELEMETRY5-PG-02 widening an integer history preserves rows, full decimal precision and migration replay", async () => {
  const migration = await readFile(new URL("../db-rollout/agentic-matcher-telemetry-schema.sql", import.meta.url), "utf8");
  // A fixture-owned schema exercises the exact production migration without
  // downgrading the shared public table or altering historical application data.
  const schema = `telemetry_${randomUUID().replaceAll("-", "")}`;
  await sql.begin(async tx => {
    await tx.unsafe(`create schema ${schema}`);
    await tx.unsafe(`create table ${schema}.agentic_matcher_events (id integer primary key, coverage_percent integer)`);
    await tx.unsafe(`insert into ${schema}.agentic_matcher_events values (1,42),(2,null)`);
    const scopedMigration = migration.replaceAll("public.", `${schema}.`);
    await tx.unsafe(scopedMigration);
    await tx.unsafe(`insert into ${schema}.agentic_matcher_events values (3,66.671234567)`);
    await tx.unsafe(scopedMigration);
    const rows = await tx.unsafe(`select coverage_percent::text as value from ${schema}.agentic_matcher_events order by id`);
    assert.deepEqual(rows.map(row => row.value), ["42", null, "66.671234567"]);
    await tx.unsafe(`drop schema ${schema} cascade`);
  });
});
