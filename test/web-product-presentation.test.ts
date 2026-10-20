import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { webPreparationCards, webProductCopy } from "../components/nutrition-flow/web-product-copy.ts";
import { webRevealProgress } from "../lib/web-reveal-progress.ts";

describe("free product journey waiting details", () => {
  for (const locale of ["en", "th", "zh-CN"] as const) {
    it(`${locale}: uses saved answer labels in a stable order without inventing missing answers`, () => {
      const cards = webPreparationCards({ goals: ["energy"], diet: "balanced", supplements: "none", firstName: "Private Name", meds: "Private Medication" }, locale);
      assert.deepEqual(cards.map(card => card.id), ["goals", "diet", "supplements", "process"]);
      assert.notEqual(cards[0].value, webProductCopy[locale].unspecified);
      assert.notEqual(cards[1].value, webProductCopy[locale].unspecified);
      assert.notEqual(cards[2].value, webProductCopy[locale].unspecified);
      assert.doesNotMatch(JSON.stringify(cards), /Private Name|Private Medication/);
      const missing = webPreparationCards({ goals: ["future_unknown_option"], diet: "<script>" }, locale);
      assert.deepEqual(missing.slice(0, 3).map(card => card.value), Array(3).fill(webProductCopy[locale].unspecified));
      assert.doesNotMatch(JSON.stringify(missing), /future_unknown_option|<script>/);
    });
  }
});

describe("free reveal progress follows available work", () => {
  const waiting = { ready: false, failed: false, formulaReady: false };
  const scorePending = { copyReady: false, copyFailed: false };
  const scoreReady = { copyReady: true, copyFailed: false };
  const scoreFailed = { copyReady: false, copyFailed: true };

  it("moves from HealthScore preparation through formula and product matching as results arrive", () => {
    assert.deepEqual([
      webRevealProgress({ ...waiting, snapshot: scorePending }),
      webRevealProgress({ ...waiting, snapshot: scoreReady }),
      webRevealProgress({ ...waiting, formulaReady: true, snapshot: scoreReady }),
      webRevealProgress({ ...waiting, formulaReady: true, ready: true, snapshot: scoreReady }),
    ], ["calculating", "preparing", "matching", "ready"]);
  });

  it("keeps formula preparation available when independent HealthScore analysis fails", () => {
    assert.equal(webRevealProgress({ ...waiting, snapshot: scoreFailed }), "preparing");
  });

  it("shows available formula and products without waiting for a late or failed HealthScore", () => {
    for (const snapshot of [scorePending, scoreFailed]) {
      assert.equal(webRevealProgress({ ...waiting, formulaReady: true, snapshot }), "matching");
      assert.equal(webRevealProgress({ ...waiting, formulaReady: true, ready: true, snapshot }), "ready");
    }
  });

  it("reports a failed generation step while preserving ready results as the highest priority", () => {
    assert.equal(webRevealProgress({ ...waiting, failed: true, snapshot: scorePending }), "failed");
    assert.equal(webRevealProgress({ ...waiting, formulaReady: true, failed: true, snapshot: scoreReady }), "failed");
    assert.equal(webRevealProgress({ ...waiting, formulaReady: true, ready: true, failed: true, snapshot: scoreFailed }), "ready");
  });

  it("does not claim HealthScore calculation without a current snapshot", () => {
    assert.equal(webRevealProgress({ ...waiting, snapshot: null }), "preparing");
  });

  it("provides distinct localized progress labels for all supported locales", () => {
    assert.deepEqual([
      webProductCopy.en.calculating, webProductCopy.en.preparing, webProductCopy.en.matching,
    ], ["Calculating your HealthScore", "Formulating your supplements", "Matching products"]);
    for (const locale of ["en", "th", "zh-CN"] as const) {
      const copy = webProductCopy[locale];
      assert.equal(new Set([copy.calculating, copy.preparing, copy.matching]).size, 3);
      for (const text of [copy.calculating, copy.preparing, copy.matching]) assert.ok(text.trim());
    }
  });
});
