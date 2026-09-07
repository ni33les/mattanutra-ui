import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { publicSupplementId } from "../lib/agentic/contract/ids.ts";
import type { CatalogueSnapshot } from "../lib/agentic/catalogue/types.ts";
import { pinWithoutRematch } from "./agentic-det-pack.test.ts";
import { createSnapshotMemoryStore } from "./agentic/value/snapshot-store.ts";
import { sampleRetailProduct } from "./agentic/value/sample-catalogue.ts";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";

const nutrients = [
  { uuid: "927083fb-b90a-5a24-b4c5-5067b06ead5f", name: "Vitamin D3", amount: 2000, unit: "IU" },
  { uuid: "9da42d1d-24f5-56d2-bd62-5ea45adfcc4b", name: "Omega-3", amount: 1000, unit: "mg" },
  { uuid: "199df5c4-8921-5c37-b85b-6bcb14b443fa", name: "Magnesium", amount: 200, unit: "mg" },
  { uuid: "7ddcc4f2-708f-5905-99a4-02d80e935adf", name: "Vitamin B12", amount: 250, unit: "mcg" },
  { uuid: "a34da45e-fcf0-5dbd-8a0e-7d4f9fc7b71c", name: "Vitamin C", amount: 500, unit: "mg" }
] as const;
const snapshot: CatalogueSnapshot = {
  availabilityAsOf: "2026-08-27T00:00:00.000Z", catalogueVersion: "det-exact-epoch-fixture", runtimeRevision: 47,
  supplements: nutrients.map(item => ({ ...item, supplementId: publicSupplementId(item.uuid), aliases: [], acceptedUnits: [item.unit] })),
  products: nutrients.map((item, index) => sampleRetailProduct({ ...item, id: `829283fb-b90a-5a24-b4c5-${String(index + 1).padStart(12, "0")}`,
    supplementId: publicSupplementId(item.uuid), form: "capsule", title: `DET ${item.name} fixture`, servingLabel: "1 capsule; 30 capsules per bottle", unitPriceMinor: 12000 }))
};

beforeEach(installGoldCatalogue);
afterEach(uninstallGoldCatalogue);

test("DET5-EPOCH-01 the pin probe publishes and selects against its exact captured catalogue", async () => {
  assert.deepEqual(await pinWithoutRematch(snapshot), { pinKeptOption: true, pinWithoutRematch: true });
});

test("DET5-EPOCH-02 a stale captured store cannot make the same pin probe pass", async () => {
  const stale = createSnapshotMemoryStore({ runtimeRevision: 46 });
  assert.deepEqual(await pinWithoutRematch(snapshot, stale), { pinKeptOption: false, pinWithoutRematch: false });
  const current = createSnapshotMemoryStore(snapshot);
  await assert.rejects(current.isCatalogueRevisionCurrent!(47), /require a transaction/);
  await current.transaction(async tx => {
    assert.equal(await tx.isCatalogueRevisionCurrent!(47), true);
    assert.equal(await tx.isCatalogueRevisionCurrent!(46), false);
  });
});
