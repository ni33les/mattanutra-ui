import assert from "node:assert/strict";
import { it } from "node:test";
import { nutrientNameMatchesTarget } from "../lib/nutrient-identity.ts";

it("resolves true aliases while preserving explicitly requested forms", () => {
  assert.equal(nutrientNameMatchesTarget("EPA", "Eicosapentaenoic acid"), true);
  assert.equal(nutrientNameMatchesTarget("EPA", "DHA"), false);
  assert.equal(nutrientNameMatchesTarget("DHA", "Omega-3"), false);
  assert.equal(nutrientNameMatchesTarget("Vitamin D3", "Vitamin D2"), false);
  assert.equal(nutrientNameMatchesTarget("Magnesium glycinate", "Magnesium oxide"), false);
  assert.equal(nutrientNameMatchesTarget("Magnesium glycinate", "Magnesium bisglycinate"), true);
  assert.equal(nutrientNameMatchesTarget("Ubiquinol", "Ubiquinone"), false);
  assert.equal(nutrientNameMatchesTarget("Folic acid", "Methylfolate"), false);
  assert.equal(nutrientNameMatchesTarget("Omega-3", "EPA"), true);
  assert.equal(nutrientNameMatchesTarget("Omega-3", "Fish oil"), false);
});
