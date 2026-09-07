import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import { seedPublicMatcherFixtures } from "../scripts/seed-matcher-public-fixtures.mjs";
import { inspectApprovedAdvisoryCacheRefresh, refreshApprovedAdvisoryCaches } from "../lib/product-advisory-cache-refresh.ts";

const databaseUrl = process.env.TEST_DB_URL;
assert.ok(databaseUrl, "Cache refresh tests require an isolated TEST_DB_URL");
assert.equal(new URL(databaseUrl).hostname, "127.0.0.1");
assert.match(new URL(databaseUrl).pathname, /^\/mattanutra_lock_review(?:[_-][a-zA-Z0-9_-]+)?$/);
assert.equal(process.env.DB_URL, databaseUrl);

test("CAT-CACHE-PG-01 reviewed approved caches refresh once with immutable before/after evidence and stale input rejection", async () => {
  const sql = postgres(databaseUrl, { max: 1 });
  const rollback = new Error("Roll back cache fixture and append-only audit");
  try {
    await assert.rejects(sql.begin("isolation level serializable", async tx => {
      const seeded = await seedPublicMatcherFixtures(tx);
      const fixture = seeded.products.find(row => row.key === "d3-high")!;
      await tx`update public.products set validation_status='failed',validation_reasons=ARRAY['unsafe_dose'],validation_summary='One or more facts exceed safety limits.' where id=${fixture.productId}`;
      const manifest = await inspectApprovedAdvisoryCacheRefresh(tx, fixture.productId);
      assert.equal(manifest.entries.length, 1);
      const [{ status }] = await refreshApprovedAdvisoryCaches(tx, manifest, false);
      assert.equal(status, "pending");
      const [before] = await tx`select status,validation_status from public.products where id=${fixture.productId}`;
      assert.deepEqual(before, { status: "approved", validation_status: "failed" });
      assert.equal((await refreshApprovedAdvisoryCaches(tx, manifest, true))[0]?.status, "applied");
      const [after] = await tx`select status,validation_status from public.products where id=${fixture.productId}`;
      assert.deepEqual(after, { status: "approved", validation_status: "pass" });
      assert.equal((await refreshApprovedAdvisoryCaches(tx, manifest, true))[0]?.status, "already_applied");
      const audit = await tx`select before_record,after_record from public.catalogue_correction_audit where correction_id=${manifest.entries[0]!.correctionId}`;
      assert.equal(audit.length, 1);
      assert.equal(audit[0].before_record.product.validation_status, "failed");
      assert.equal(audit[0].after_record.product.validation_status, "pass");
      assert.deepEqual(audit[0].before_record.validationInput, audit[0].after_record.validationInput);
      for (const field of ["status", "title", "price_amount", "currency", "administration"]) {
        assert.deepEqual(audit[0].before_record.product[field], audit[0].after_record.product[field], field);
      }
      await tx`update public.product_facts set amount=amount+1 where id=${fixture.factId}`;
      await assert.rejects(refreshApprovedAdvisoryCaches(tx, manifest, true), /changed since review|Previously refreshed/);
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});

test("CAT-CACHE-PG-02 pending approval, missing evidence and changed prior facts cannot be refreshed", async () => {
  const sql = postgres(databaseUrl, { max: 1 });
  const rollback = new Error("Roll back excluded cache fixtures");
  try {
    await assert.rejects(sql.begin("isolation level serializable", async tx => {
      const seeded = await seedPublicMatcherFixtures(tx);
      const fixture = seeded.products.find(row => row.key === "d3-high")!;
      await tx`update public.products set validation_status='failed',validation_reasons=ARRAY['unsafe_dose'] where id=${fixture.productId}`;
      const reviewed = await inspectApprovedAdvisoryCacheRefresh(tx, fixture.productId);
      assert.equal(reviewed.entries.length, 1);
      await tx`update public.product_facts set amount=amount+1 where id=${fixture.factId}`;
      await assert.rejects(refreshApprovedAdvisoryCaches(tx, reviewed, true), /changed since review/);
      await tx`update public.products set image_url=null where id=${fixture.productId}`;
      assert.equal((await inspectApprovedAdvisoryCacheRefresh(tx, fixture.productId)).entries.length, 0);
      await tx`update public.products set image_url=${fixture.imageUrl},status='pending_review' where id=${fixture.productId}`;
      assert.equal((await inspectApprovedAdvisoryCacheRefresh(tx, fixture.productId)).entries.length, 0);
      const [row] = await tx`select status,validation_status from public.products where id=${fixture.productId}`;
      assert.deepEqual(row, { status: "pending_review", validation_status: "failed" });
      throw rollback;
    }), error => error === rollback);
  } finally { await sql.end(); }
});

test("CAT-CACHE-PG-03 a contending ordinary product writer finishes while cache refresh rejects and releases its epoch", async () => {
  const sql = postgres(databaseUrl, { max: 1 });
  const writer = postgres(databaseUrl, { max: 1 });
  const productId = randomUUID(), fingerprint = "0".repeat(64);
  const correctionId = `health-advisory-v5:${productId}:${fingerprint.slice(0, 16)}`;
  let writerFinished: Promise<void> | null = null;
  let writerFailure: unknown;
  let refreshFailure: unknown;
  try {
    await sql`insert into public.products (id,platform,title,normalized_title,product_url,normalized_url)
      values (${productId},'manual','Cache contention fixture',${productId},${`https://fixture.example/${productId}`},${`https://fixture.example/${productId}`})`;
    const [before] = await sql`select to_jsonb(products) as record from public.products where id=${productId}`;
    const [{ pid: writerPid }] = await writer`select pg_backend_pid() as pid`;
    try {
      await sql.begin("isolation level serializable", async tx => {
        await tx.unsafe("SET LOCAL lock_timeout = '250ms'; SET LOCAL statement_timeout = '5s'");
        await tx`select revision from public.catalogue_runtime_revision where singleton=true for update`;
        writerFinished = writer.begin(async concurrent => {
          await concurrent.unsafe("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '5s'");
          // The ordinary UPDATE holds this product row before its AFTER trigger
          // tries to advance the epoch already held by maintenance.
          await concurrent`update public.products set title='Ordinary writer completed' where id=${productId}`;
        }).then(() => undefined, error => { writerFailure = error; });
        const deadline = Date.now() + 4000;
        let blockedByMaintenance = false;
        while (!blockedByMaintenance && Date.now() < deadline) {
          const [state] = await tx`select pg_backend_pid()=any(pg_blocking_pids(${writerPid})) as blocked`;
          blockedByMaintenance = state.blocked;
          if (!blockedByMaintenance) await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(blockedByMaintenance, true, "The writer must hold the product and wait on maintenance's epoch");
        await refreshApprovedAdvisoryCaches(tx, { version: 1, policy: "health-advisory-v5", entries: [{
          correctionId, productId, title: "Cache contention fixture", beforeFingerprint: fingerprint,
          expectedValidation: { status: "pass", matchableFactCount: 1, reasons: [], summary: "fixture" }
        }] }, true);
      });
    } catch (error) { refreshFailure = error; }
    await writerFinished;
    assert.equal(writerFailure, undefined, "The ordinary writer must finish instead of becoming a deadlock victim");
    assert.equal((refreshFailure as { code?: string })?.code, "55P03");
    assert.match((refreshFailure as Error)?.message ?? "", /could not obtain lock on row in relation "products"/,
      "Maintenance must reject via NOWAIT, not wait for lock timeout or deadlock detection");
    const [after] = await sql`select to_jsonb(products) as record from public.products where id=${productId}`;
    assert.deepEqual(after.record, { ...before.record, title: "Ordinary writer completed" },
      "Only the ordinary writer's explicit edit may persist");
    assert.equal((await sql`select correction_id from public.catalogue_correction_audit where correction_id=${correctionId}`).length, 0);
    await sql.begin(async tx => {
      await tx`select revision from public.catalogue_runtime_revision where singleton=true for update nowait`;
    });
  } finally {
    await writerFinished;
    await sql`delete from public.products where id=${productId}`;
    await writer.end();
    await sql.end();
  }
});
