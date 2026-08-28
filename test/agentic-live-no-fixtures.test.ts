import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import {
  getCatalogueSnapshot,
  replaceCatalogueSnapshot,
  resetCatalogueSnapshotCache
} from "../lib/agentic/catalogue/snapshot.ts";
import { engineeringInfo, resetInfoCache } from "../lib/agentic/info.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";

function withoutTestContext<T>(work: () => T | Promise<T>) {
  const previous = process.env.NODE_TEST_CONTEXT;

  delete process.env.NODE_TEST_CONTEXT;

  return Promise.resolve()
    .then(work)
    .finally(() => {
      if (previous === undefined) {
        delete process.env.NODE_TEST_CONTEXT;
      } else {
        process.env.NODE_TEST_CONTEXT = previous;
      }
    });
}

afterEach(() => {
  replaceCatalogueSnapshot(null);
  resetCatalogueSnapshotCache();
  resetInfoCache();
});

describe("live catalogue never serves fixtures", () => {
  it("returns an empty snapshot instead of an installed fixture catalogue", async () => {
    await withoutTestContext(async () => {
      replaceCatalogueSnapshot(fixtureSnapshot());

      const got = getCatalogueSnapshot("TH");
      assert.equal(got.products.length, 0);
      assert.equal(got.supplements.length, 0);
      assert.match(got.catalogueVersion, /retail-TH-unavailable/);
      assert.equal(
        got.products.some((item) => item.source === "fixture"),
        false
      );
    });
  });

  it("does not list fixture recognised names when the live catalogue is empty", async () => {
    replaceCatalogueSnapshot(null);
    resetCatalogueSnapshotCache();
    resetInfoCache();
    const info = await engineeringInfo({ config: loadAgenticConfig() });
    assert.deepEqual(info.recognisedNames, []);
  });
});
