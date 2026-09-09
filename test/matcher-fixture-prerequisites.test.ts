import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMatcherFixtureCounts } from "../scripts/matcher-fixture-prerequisites.mjs";

const complete = { products: 3, productFacts: 4, supplements: 2, retailListings: 3, safetyReferences: 5 };
test("MCP-FIXTURE-01 schema-only and reference-free fixtures cannot qualify the maintained MCP pack", () => {
  for (const field of Object.keys(complete)) {
    assert.throws(() => validateMatcherFixtureCounts({ ...complete, [field]: 0 }), new RegExp(field));
    assert.throws(() => validateMatcherFixtureCounts({ ...complete, [field]: undefined }), new RegExp(field));
  }
});
test("MCP-FIXTURE-02 prerequisite validation preserves declared counts and rejects invalid evidence", () => {
  assert.deepEqual(validateMatcherFixtureCounts(complete), complete);
  for (const value of [-1, 0.5, NaN, Infinity]) assert.throws(() => validateMatcherFixtureCounts({ ...complete, safetyReferences: value }), /safetyReferences/);
  assert.deepEqual(complete, { products: 3, productFacts: 4, supplements: 2, retailListings: 3, safetyReferences: 5 });
});
