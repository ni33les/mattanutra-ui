import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import postgres from "postgres";
import { closeSqlPool, getSql } from "../../lib/db.ts";
import { freezeCatalogueSnapshot, matchingSnapshotId } from "../../lib/agentic/catalogue/freeze.ts";
import { getPinnedCatalogueSnapshot, persistCataloguePin, resetCataloguePins, restoreCataloguePin } from "../../lib/agentic/catalogue/pin.ts";
import { createPostgresStore } from "../../lib/agentic/store/postgres.ts";
import { sampleValueSnapshot } from "../agentic/value/sample-catalogue.ts";

assert.ok(process.env.TEST_DB_URL, "Isolated PostgreSQL is mandatory");
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, "127.0.0.1");
assert.match(url.pathname, /^\/mattanutra_lock_review/);
process.env.DB_URL = url.href;
const independentSql = postgres(url.href, { max: 1, prepare: false });
after(async () => { await independentSql.end(); await closeSqlPool(); });
beforeEach(resetCataloguePins);

function fixture() {
  const snapshot = freezeCatalogueSnapshot({ ...sampleValueSnapshot(), catalogueVersion: `pin-integration-${randomUUID()}` });
  return { snapshot, id: matchingSnapshotId(snapshot) };
}

test("EFF-PIN-PG-01 concurrent pins share one committed PostgreSQL insert", async () => {
  const sql = getSql();
  assert.ok(sql);
  const store = createPostgresStore(sql);
  const { snapshot, id } = fixture();
  const insert = store.insertCatalogueSnapshot.bind(store);
  let inserts = 0;
  store.insertCatalogueSnapshot = async (...args) => { inserts++; await insert(...args); };
  try {
    assert.equal(store.catalogueWritesCommitIndependently?.(), true);
    const results = await Promise.all(Array.from({ length: 8 }, () => persistCataloguePin(snapshot, "integration-test", store)));
    assert.equal(inserts, 1);
    assert.ok(results.every(result => result === snapshot));
    const rows = await independentSql`select snapshot_json from public.agentic_catalogue_snapshots where snapshot_id = ${id}`;
    assert.equal(rows.length, 1, "the shared insert is committed and visible to an independent connection");
    assert.deepEqual(rows[0]!.snapshot_json, snapshot);
    assert.ok(getPinnedCatalogueSnapshot(id));
  } finally {
    resetCataloguePins();
    await independentSql`delete from public.agentic_catalogue_snapshots where snapshot_id = ${id}`;
  }
});

test("EFF-PIN-PG-02 transaction-owned persistence and restore cannot survive PostgreSQL rollback", async () => {
  const sql = getSql();
  assert.ok(sql);
  const store = createPostgresStore(sql);
  const { snapshot, id } = fixture();
  try {
    await assert.rejects(store.transaction(async transaction => {
      assert.equal(transaction.catalogueWritesCommitIndependently?.(), false);
      assert.equal(store.catalogueWritesCommitIndependently?.(), false, "root helpers join the ambient transaction");
      await persistCataloguePin(snapshot, "integration-test", transaction);
      assert.deepEqual(await restoreCataloguePin(id, "integration-test", transaction), snapshot);
      assert.equal(getPinnedCatalogueSnapshot(id), null);
      const visible = await independentSql`select snapshot_id from public.agentic_catalogue_snapshots where snapshot_id = ${id}`;
      assert.equal(visible.length, 0);
      throw new Error("Rollback catalogue pin transaction");
    }), /Rollback catalogue pin transaction/);
    assert.equal(store.catalogueWritesCommitIndependently?.(), true);
    assert.equal(await restoreCataloguePin(id, "integration-test", store), null);
    await persistCataloguePin(snapshot, "integration-test", store);
    assert.deepEqual(await store.getCatalogueSnapshot(id), snapshot, "a rolled-back insertion cannot satisfy the later independent owner");
  } finally {
    resetCataloguePins();
    await independentSql`delete from public.agentic_catalogue_snapshots where snapshot_id = ${id}`;
  }
});
