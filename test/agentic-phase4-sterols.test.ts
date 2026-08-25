import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_SUPPLEMENTS } from "../lib/agentic/catalogue/fixtures.ts";
import { overlayFixtureSupplementAliases } from "../lib/agentic/catalogue/live-supplements.ts";
import { match } from "../lib/matcher/index.ts";
import { QA_GOLD_CATALOG, qaRequest, qaTarget } from "../lib/matcher/qa/index.ts";

describe("Phase 4 plant sterols aliases", () => {
  it("recognises stanols as plant sterols in fixture aliases", () => {
    const sterols = FIXTURE_SUPPLEMENTS.find((item) => item.name === "Plant sterols");
    assert.ok(sterols);
    const names = [sterols.name, ...sterols.aliases].map((value) =>
      value.toLowerCase()
    );
    assert.equal(names.includes("stanols"), true);
    assert.equal(names.includes("plant stanols"), true);
    assert.equal(names.includes("plant sterols / stanols"), true);
  });

  it("overlays those aliases onto a live plant-sterols supplement row", () => {
    const overlay = overlayFixtureSupplementAliases([
      {
        acceptedUnits: ["mg"],
        aliases: ["Phytosterols"],
        name: "Plant sterols",
        supplementId: "sup_sterols",
        uuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
      }
    ]);
    assert.ok(overlay[0]?.aliases.includes("Stanols"));
    assert.ok(overlay[0]?.aliases.includes("Plant sterols / stanols"));
  });

  it("still covers 2000 mg sterols from the gold catalogue when the product exists", () => {
    const result = match(
      qaRequest({
        optimization: "fewest_pills",
        targets: [qaTarget("sterols", 2000)]
      }),
      QA_GOLD_CATALOG
    );
    assert.ok(result.selected);
    assert.equal(result.selected.productIds.includes("G-STEROLS-2000"), true);
  });
});
