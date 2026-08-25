import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { match } from "../../lib/matcher/index.ts";
import { publicCoveragePercent } from "../../lib/matcher/explainer.ts";
import {
  QA_BOUNDARY,
  QA_CORRUPT,
  QA_GOLD_CATALOG,
  QA_IMPOSSIBLE,
  QA_IRRELEVANT,
  QA_OVERLAP,
  QA_SPARSE,
  QA_UNSAFE_ONLY,
  qaLargeNoisy,
  qaRequest,
  qaTarget
} from "../../lib/matcher/qa/index.ts";

function ids(result: ReturnType<typeof match>) {
  return result.selected?.productIds ?? [];
}

describe("Mode B adversarial catalogues", () => {
  it("QA-SPARSE reports honest gaps instead of inventing coverage", () => {
    const result = match(qaRequest(), QA_SPARSE);
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
    assert.ok(
      publicCoveragePercent(result.selected) < 100 || result.selected == null
    );
    assert.ok(
      result.leftovers.some(
        (item) => item.reason === "uncovered" || item.reason === "dose_gap"
      )
    );
  });

  it("QA-OVERLAP still prefers the purposeful combo over incidental collagen", () => {
    const result = match(qaRequest({ optimization: "fewest_pills" }), QA_OVERLAP);
    assert.ok(ids(result).includes("G-BASE-COMBO"));
    assert.equal(ids(result).includes("G-INCIDENTAL-C"), false);
  });

  it("QA-UNSAFE-ONLY returns no trap basket", () => {
    const result = match(
      qaRequest({
        optimization: "lowest_cost",
        targets: [qaTarget("d3", 2000), qaTarget("mag", 200)]
      }),
      QA_UNSAFE_ONLY
    );
    assert.equal(result.selected, null);
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
    assert.ok(result.rejected.some((item) => item.reason === "ul_exceeded"));
    assert.ok(result.leftovers.some((item) => item.reason === "uncovered"));
  });

  it("QA-IRRELEVANT does not invent a dedicated C SKU", () => {
    const result = match(
      qaRequest({ targets: [qaTarget("c", 500)] }),
      QA_IRRELEVANT
    );
    assert.equal(ids(result).includes("G-C-500"), false);
    if (result.selected) {
      assert.ok((result.selected.incidentalCount ?? 0) > 0);
    } else {
      assert.ok(result.leftovers.some((item) => item.reason === "uncovered"));
    }
  });

  it("QA-CORRUPT quarantines unknown and incomplete facts", () => {
    const result = match(
      qaRequest({ targets: [qaTarget("d3", 2000)] }),
      QA_CORRUPT
    );
    assert.equal(ids(result).includes("G-CORRUPT-NO-UNIT"), false);
    assert.equal(ids(result).includes("G-CORRUPT-INCOMPLETE"), false);
    assert.ok(
      result.rejected.some(
        (item) => item.reason === "ul_exceeded" || item.reason === "incomplete_facts"
      )
    );
  });

  it("QA-BOUNDARY keeps country, form, diet and life-stage exclusions hard", () => {
    const result = match(
      qaRequest({
        dietaryPreference: "vegan",
        omega3SourcePreference: "algae_only",
        targets: [qaTarget("d3", 2000), qaTarget("omega", 500, "mg", "Algae omega-3")]
      }),
      QA_BOUNDARY
    );
    assert.equal(ids(result).includes("G-FOREIGN-D3"), false);
    assert.equal(ids(result).includes("G-OOS-D3-2000"), false);
    assert.equal(ids(result).includes("G-O3-FISH-1000"), false);
    assert.equal(ids(result).includes("G-PRECARE"), false);
    assert.equal(ids(result).includes("G-COLLAGEN-5G"), false);
  });

  it("QA-IMPOSSIBLE is blocked or uncovered with reasons", () => {
    const result = match(
      qaRequest({ targets: [qaTarget("d3", 2000)] }),
      QA_IMPOSSIBLE
    );
    assert.equal(result.selected, null);
    const reasons = new Set(result.rejected.map((item) => item.reason));
    assert.ok(reasons.has("ul_exceeded") || reasons.has("oos") || reasons.has("foreign_retailer"));
  });

  it("QA-LARGE-NOISY still finds the gold combo on a bounded noisy set", () => {
    const result = match(qaRequest({ optimization: "fewest_pills" }), qaLargeNoisy(24));
    assert.ok(ids(result).includes("G-BASE-COMBO"));
    assert.equal(ids(result).includes("G-HIGH-TRAP"), false);
  });

  it("does not special-case gold ids inside match()", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("lib/matcher/index.ts", "utf8");
    assert.doesNotMatch(source, /G-BASE-COMBO|G-HIGH-TRAP|QA-GOLD/);
    assert.equal(QA_GOLD_CATALOG.products.length > 0, true);
  });
});
