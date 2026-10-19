import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { webPreparationCards, webProductCopy } from "../components/nutrition-flow/web-product-copy.ts";

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
