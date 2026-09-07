import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import { appendSupplementSafetyLimitVersion, lockSupplementSafetyReference } from "../lib/supplement-safety-limit-versions.ts";
import * as loader from "../lib/agentic/catalogue/load-safety-ceilings.ts";
import { getCatalogueRuntimeRevision } from "../lib/catalogue-runtime-revision.ts";
import { resetMatcherSafetyCeilings } from "../lib/matcher/safety-ceilings.ts";
import { isolatedDatabasePreflight } from "../scripts/run-full-test-suite.mjs";

assert.deepEqual(isolatedDatabasePreflight(process.env), []);
const sql = postgres(process.env.TEST_DB_URL!, { max: 3 });
const base = { lifeStage: "adult" as const, sourceScope: "supplemental" as const,
  maxAmount: 100, maxUnit: "mcg/day", confidence: "high" as const, safetyFlags: [],
  safetyNotes: "Reviewed reference", sourceUrl: "https://fixture.example/reference-a", basisRationale: "Adult total intake reference" };

async function fixture(work: (tx: postgres.TransactionSql, supplementId: string) => Promise<void>) {
  const rollback = new Error("Rollback reference integrity fixture");
  try {
    await assert.rejects(sql.begin(async tx => {
      const supplementId = randomUUID();
      await tx`insert into public.supplements (id,name,normalized_name,category) values (${supplementId},${`Reference ${supplementId}`},${supplementId},'Vitamin')`;
      await work(tx, supplementId);
      throw rollback;
    }), error => error === rollback);
  } finally { resetMatcherSafetyCeilings(); }
}

test("ANNA-REF-PG-01 provenance-only corrections append a complete new version", async () => {
  await fixture(async (tx, supplementId) => {
    const first = await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId });
    const second = await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId, skipIfUnchanged: true,
      sourceUrl: "https://fixture.example/reference-b", basisRationale: "Corrected source and population rationale" });
    assert.equal(second, first + 1, "Changed authority provenance cannot be mistaken for an unchanged amount");
    const [head] = await tx`select source_url,basis_rationale from public.supplement_safety_limits where supplement_id=${supplementId} order by version desc limit 1`;
    assert.equal(head.source_url, "https://fixture.example/reference-b");
    assert.equal(head.basis_rationale, "Corrected source and population rationale");
  });
});

test("ANNA-REF-PG-02 latest null retires only its band while total and other populations remain", async () => {
  await fixture(async (tx, supplementId) => {
    await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId, maxAmount: 1000 });
    await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId, maxAmount: null });
    await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId, sourceScope: "total" });
    await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId, lifeStage: "child_4_8", maxAmount: 75 });
    const loaded = await loader.loadAdminSafetyReferenceSnapshot(tx);
    const rows = loaded.ceilings.filter(row => row.subjectId === supplementId);
    assert.equal(rows.length, 2);
    assert.equal(rows.some(row => row.lifeStage === "adult" && row.sourceScope === "supplemental"), false);
    assert.equal(rows.find(row => row.lifeStage === "adult")?.maxAmount, 100);
    assert.equal(rows.find(row => row.lifeStage === "adult")?.sourceScope, "total");
    assert.equal(loaded.runtimeRevision, await getCatalogueRuntimeRevision(tx));
    assert.match(loaded.fingerprint, /^[a-f0-9]{64}$/);
  });
});

test("ANNA-REF-PG-03 latest-null provenance and flags remain versioned even without a numeric limit", async () => {
  await fixture(async (tx, supplementId) => {
    const first = await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId, maxAmount: null });
    const second = await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId, maxAmount: null,
      maxUnit: "IU/day", safetyFlags: ["general_caution"], skipIfUnchanged: true });
    assert.equal(second, first + 1);
    const third = await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId, maxAmount: null,
      maxUnit: "IU/day", safetyFlags: ["general_caution"], skipIfUnchanged: true });
    assert.equal(third, second, "A truly identical complete payload is idempotent");
  });
});

test("ANNA-REF-PG-06 bootstrap never resurrects an explicitly retired reference", async () => {
  await fixture(async (tx, supplementId) => {
    await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId });
    const retired = await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId, maxAmount: null });
    const seeded = await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId, onlyIfMissing: true });
    assert.equal(seeded, retired);
    const [row] = await tx`select max_amount from public.supplement_safety_limits where supplement_id=${supplementId} order by version desc limit 1`;
    assert.equal(row.max_amount, null);
  });
});

test("ANNA-REF-PG-07 a changed catalogue epoch refreshes references before the ten-minute TTL", async () => {
  await fixture(async (tx, supplementId) => {
    await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId });
    const firstEpoch = await getCatalogueRuntimeRevision(tx);
    const first = await loader.refreshAdminSafetyCeilings({ sql: tx, runtimeRevision: firstEpoch });
    assert.equal(first.find(row => row.subjectId === supplementId)?.maxAmount, 100);
    await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId, maxAmount: null });
    const nextEpoch = await getCatalogueRuntimeRevision(tx);
    assert.ok(nextEpoch > firstEpoch);
    const next = await loader.refreshAdminSafetyCeilings({ sql: tx, runtimeRevision: nextEpoch });
    assert.equal(next.some(row => row.subjectId === supplementId), false);
    await assert.rejects(loader.refreshAdminSafetyCeilings({ sql: tx, runtimeRevision: firstEpoch, force: true }), /epoch changed/);
  });
});

test("ANNA-REF-PG-08 concurrent writers fail fast without writes and can retry after the nutrient lock releases", async () => {
  const [nutrient] = await sql`select id::text from public.supplements order by id limit 1`;
  assert.ok(nutrient?.id, "The isolated catalogue must have a real nutrient to exercise writer contention");
  const [before] = await sql`select count(*)::int as count from public.supplement_safety_limits where supplement_id=${nutrient.id}`;
  let release!: () => void, held!: () => void;
  const proceed = new Promise<void>(resolve => { release = resolve; });
  const locked = new Promise<void>(resolve => { held = resolve; });
  const rollback = new Error("Rollback concurrent reference fixture");
  const first = assert.rejects(sql.begin(async tx => {
    await lockSupplementSafetyReference(tx, nutrient.id);
    held(); await proceed; throw rollback;
  }), error => error === rollback);
  await locked;
  try {
    await assert.rejects(sql.begin(async tx => {
      await tx`set local lock_timeout = '500ms'`;
      await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId: nutrient.id, lifeStage: "child_4_8", sourceScope: "total" });
    }), { code: "reference_review_in_progress" });
    const [after] = await sql`select count(*)::int as count from public.supplement_safety_limits where supplement_id=${nutrient.id}`;
    assert.equal(after.count, before.count, "The contending writer cannot append any head");
  } finally { release(); await first; }
  await assert.rejects(sql.begin(async tx => {
    const nextVersion = await appendSupplementSafetyLimitVersion(tx, { ...base, supplementId: nutrient.id, lifeStage: "child_4_8", sourceScope: "total" });
    assert.ok(nextVersion > 0);
    throw rollback;
  }), error => error === rollback);
});

test.after(async () => { await sql.end(); });
