import assert from "node:assert/strict";
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
