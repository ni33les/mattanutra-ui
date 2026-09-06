import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { installGoldCatalogue, uninstallGoldCatalogue } from "./helpers/gold-catalogue.ts";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { ensureCatalogueSnapshot, ensureQaCatalogueSnapshot, replaceCatalogueSnapshot } from "../lib/agentic/catalogue/snapshot.ts";
import { flushMatchingCatalogueCaches } from "../lib/agentic/catalogue/flush.ts";
import { persistCataloguePin, resetCataloguePins, restoreCataloguePin } from "../lib/agentic/catalogue/pin.ts";
import { catalogueSnapshotId } from "../lib/agentic/catalogue/freeze.ts";
import { createMemoryStore } from "../lib/agentic/store/memory.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { normalizePlanRequest, planRematchFingerprint } from "../lib/agentic/plan/normalize.ts";

const request = {
  destinationCountry: "TH", locale: "en", optimization: "balanced",
  profile: { ageYears: 38, lifeStage: "adult", sex: "male" }, requirements: {},
  targets: [{ name: "Vitamin D3", amount: 1000, unit: "IU" }]
};

beforeEach(() => installGoldCatalogue());
afterEach(() => { uninstallGoldCatalogue(); resetCataloguePins(); });

describe("MCP reliability: catalogue persistence and cache isolation", () => {
  it("keeps a QA publication frozen while refreshing live customer snapshots", async () => {
    const qa = await ensureQaCatalogueSnapshot("dev");
    flushMatchingCatalogueCaches();
    replaceCatalogueSnapshot({ ...fixtureSnapshot(), catalogueVersion: "retail-TH-updated" });
    const live = await ensureCatalogueSnapshot("dev", "TH");
    assert.equal(live.catalogueVersion, "retail-TH-updated");
    assert.equal((await ensureQaCatalogueSnapshot("dev")).catalogueVersion, qa.catalogueVersion);
  });

  it("does not reuse the Thailand catalogue for another destination", async () => {
    const th = await ensureCatalogueSnapshot("dev", "TH");
    const sg = await ensureCatalogueSnapshot("dev", "SG");
    assert.ok(th.products.length > 0);
    assert.equal(sg.products.length, 0);
    assert.match(sg.catalogueVersion, /^retail-SG-/);
  });

  it("recovers an exact pinned snapshot from the store after a process-cache reset", async () => {
    const store = createMemoryStore();
    const snapshot = fixtureSnapshot();
    await persistCataloguePin(snapshot, "test", store);
    resetCataloguePins();
    assert.deepEqual(await restoreCataloguePin(catalogueSnapshotId(snapshot), "test", store), snapshot);
    assert.equal(await restoreCataloguePin("snap_missing", "test", store), null);
  });

  it("invalidates matching when either retention requirement changes", async () => {
    const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), request, snapshot: fixtureSnapshot() });
    assert.ok("state" in normalized);
    for (const requirements of [{ retainProductIds: ["prd_keep"] }, { retainSupplementIds: ["sup_keep"] }]) {
      assert.notEqual(planRematchFingerprint(normalized.state), planRematchFingerprint({
        ...normalized.state, requirements: { ...normalized.state.requirements, ...requirements }
      }));
    }
  });
});
