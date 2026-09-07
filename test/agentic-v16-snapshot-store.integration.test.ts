import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeSqlPool } from "../lib/db.ts";
import {
  createV16Runtime,
  endV16Run,
  freezeRealThailandCatalogue,
  frozenSnapshot
} from "./agentic/v16/harness.ts";
import { createV18Runtime } from "./agentic/v18/harness.ts";

const databaseUrl = process.env.TEST_DB_URL;
assert.ok(databaseUrl, "Captured catalogue tests require an isolated TEST_DB_URL");
const database = new URL(databaseUrl);
assert.equal(database.hostname, "127.0.0.1");
assert.match(database.pathname, /^\/mattanutra_lock_review(?:[_-][a-zA-Z0-9_-]+)?$/);
assert.equal(process.env.DB_URL, databaseUrl);

after(async () => { endV16Run(); await closeSqlPool(); });

test("V16-EPOCH-01 both real-catalogue harnesses require a captured catalogue before creating a store", () => {
  assert.equal(frozenSnapshot(), null);
  assert.throws(() => createV16Runtime(), /freezeRealThailandCatalogue/);
  assert.throws(() => createV18Runtime("v18-captured-epoch"), /freezeRealThailandCatalogue/);
});

test("V16-EPOCH-02 v16 and v18 publish only against their exact frozen catalogue inside a transaction", async () => {
  const attestation = await freezeRealThailandCatalogue();
  const snapshot = frozenSnapshot();
  assert.ok(snapshot);
  assert.ok(attestation.productCount > 0, "A real catalogue is required; this regression cannot silently skip");
  assert.ok(Number.isSafeInteger(snapshot.runtimeRevision));
  const epoch = snapshot.runtimeRevision!;
  for (const { store } of [createV16Runtime(), createV18Runtime("v18-captured-epoch")]) {
    await assert.rejects(store.isCatalogueRevisionCurrent!(epoch), /require a transaction/);
    await store.transaction(async tx => {
      assert.equal(await tx.isCatalogueRevisionCurrent!(epoch), true, "The captured revision must be publishable");
      assert.equal(await tx.isCatalogueRevisionCurrent!(epoch + 1), false, "Another revision must still be rejected");
      assert.equal(await tx.isCatalogueRevisionCurrent!(-1), false);
    });
  }
});
