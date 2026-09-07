import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAdminLimitUnit, parseAdminLimitDose } from "../../lib/matcher/safety-ceilings.ts";

describe("admin safety limit units", () => {
  it("maps admin /day units onto matcher units without inventing amounts", () => {
    assert.equal(parseAdminLimitUnit("mg/day"), "mg");
    assert.equal(parseAdminLimitUnit("mcg/day"), "mcg");
    assert.equal(parseAdminLimitUnit("g/day"), "g");
    assert.equal(parseAdminLimitUnit("ml/day"), "ml");
    assert.equal(parseAdminLimitUnit("IU/day"), "IU");
    assert.equal(parseAdminLimitUnit("mg"), "mg");
    assert.equal(parseAdminLimitUnit("µg/day"), "mcg");
    assert.equal(parseAdminLimitUnit("mg/day extract"), "mg");
    assert.equal(parseAdminLimitUnit("mg NE/day"), "mg");
    assert.equal(parseAdminLimitUnit("mcg RAE/day"), "mcg");
  });

  it("ANNA-REF-CFU preserves scaled reference amounts when decoding original CFU units", () => {
    assert.deepEqual(parseAdminLimitDose(100, "billion CFU/day"), { amount: 100_000_000_000, unit: "CFU" });
    assert.deepEqual(parseAdminLimitDose(20, "billion CFU/day"), { amount: 20_000_000_000, unit: "CFU" });
    assert.deepEqual(parseAdminLimitDose(1.5, "million CFU/day"), { amount: 1_500_000, unit: "CFU" });
    assert.deepEqual(parseAdminLimitDose(100, "mcg/day"), { amount: 100, unit: "mcg" });
    assert.equal(parseAdminLimitDose(100, "custom"), null);
    assert.equal(parseAdminLimitDose(100, "unknown CFU/day"), null);
    assert.equal(parseAdminLimitDose(10_000_000_000, "billion CFU/day"), null);
  });

  it("does not invent a unit for review-only or scaled CFU admin rows", () => {
    assert.equal(parseAdminLimitUnit("exclude/blend review"), null);
    assert.equal(parseAdminLimitUnit("custom"), null);
    assert.equal(parseAdminLimitUnit("billion CFU/day"), null);
    assert.equal(parseAdminLimitUnit(""), null);
  });
});
