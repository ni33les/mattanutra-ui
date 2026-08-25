import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_MATCHER_CONFIG } from "../../lib/matcher/config.ts";
import { match } from "../../lib/matcher/index.ts";
import {
  QA_GOLD_CATALOG,
  bruteForceMatch,
  pickCatalog,
  qaRequest,
  qaTarget
} from "../../lib/matcher/qa/index.ts";

const ORACLE_SEED = 20260825;

describe("Mode C brute-force oracle", () => {
  it("agrees with match() on a tiny random catalogue", () => {
    const catalog = pickCatalog(QA_GOLD_CATALOG, 6, ORACLE_SEED);
    const request = qaRequest({
      maxProductCount: 3,
      optimization: "fewest_pills",
      targets: [qaTarget("d3", 2000), qaTarget("c", 500), qaTarget("mag", 200)]
    });
    const config = {
      ...DEFAULT_MATCHER_CONFIG,
      exactGroupLimit: 12,
      exactVariantLimit: 24,
      searchDeadlineMs: 5_000
    };
    const matcher = match(request, catalog, config);
    const oracle = bruteForceMatch(request, catalog, config);
    assert.equal(oracle.trimmed, false);
    console.log(
      `Mode C seed=${ORACLE_SEED} matcher=${(matcher.selected?.productIds ?? []).join(",") || "none"} oracle=${(oracle.selected?.productIds ?? []).join(",") || "none"}`
    );
    assert.deepEqual(
      matcher.selected?.productIds ?? [],
      oracle.selected?.productIds ?? []
    );
  });

  it("does not import golden SKU ids into the oracle", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("lib/matcher/qa/oracle.ts", "utf8");
    assert.doesNotMatch(source, /G-BASE-COMBO|G-HIGH-TRAP|G-C-500/);
  });
});
