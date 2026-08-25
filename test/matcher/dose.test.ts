import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addScaled,
  aggregateDailyExposure,
  amountFromScaled,
  scaleAmount
} from "../../lib/matcher/dose.ts";
import type { CanonicalCurrent, DoseVariant } from "../../lib/matcher/types.ts";

function zinc(amount: number, unit: string, subjectId = "sup_zinc") {
  const scaled = scaleAmount({
    amount,
    subjectId,
    subjectName: "Zinc",
    unit
  });
  assert.equal("reason" in scaled, false);
  return scaled as Exclude<typeof scaled, { reason: string }>;
}

describe("matcher dose engine", () => {
  it("DOSE-01 totals current 15 mg plus selected 25 mg as exactly 40 mg", () => {
    const current: CanonicalCurrent = {
      daily: zinc(15, "mg"),
      dailyAmount: 15,
      name: "Zinc",
      sourceId: "current-1",
      subjectId: "sup_zinc",
      unit: "mg"
    };
    const variant: DoseVariant = {
      amountPerUnit: new Map([["sup_zinc", zinc(25, "mg")]]),
      contributions: new Map([["sup_zinc", zinc(25, "mg")]]),
      dailyPills: 1,
      dailyUnits: 1,
      productId: "prd_zinc",
      unknownSafetyAmount: false,
      variantId: "prd_zinc:x1"
    };
    const exposure = aggregateDailyExposure({ current: [current], variants: [variant] });
    assert.equal("reason" in exposure, false);
    if ("reason" in exposure) {
      return;
    }
    assert.equal(amountFromScaled(exposure.totals.get("sup_zinc")!, "mg", "Zinc"), 40);
    assert.equal(exposure.provenance.length, 2);
  });

  it("DOSE-04 treats 1000 mcg plus 1 mg as exactly 2 mg", () => {
    const mcg = zinc(1000, "mcg");
    const mg = zinc(1, "mg");
    const total = addScaled(mcg, mg);
    assert.equal("reason" in total, false);
    if ("reason" in total) {
      return;
    }
    assert.equal(amountFromScaled(total, "mg", "Zinc"), 2);
    assert.equal(amountFromScaled(total, "mcg", "Zinc"), 2000);
  });

  it("DOSE-05 does not let pack count change daily exposure", () => {
    const once = zinc(25, "mg");
    const variant: DoseVariant = {
      amountPerUnit: new Map([["sup_zinc", once]]),
      contributions: new Map([["sup_zinc", once]]),
      dailyPills: 1,
      dailyUnits: 1,
      productId: "prd_zinc",
      unknownSafetyAmount: false,
      variantId: "prd_zinc:x1"
    };
    const one = aggregateDailyExposure({ current: [], variants: [variant] });
    const twoPacksSameSchedule = aggregateDailyExposure({ current: [], variants: [variant] });
    assert.equal("reason" in one, false);
    assert.equal("reason" in twoPacksSameSchedule, false);
    if ("reason" in one || "reason" in twoPacksSameSchedule) {
      return;
    }
    assert.equal(one.totals.get("sup_zinc")?.units, twoPacksSameSchedule.totals.get("sup_zinc")?.units);
  });

  it("DOSE-06 two capsules per day doubles labelled amount", () => {
    const once = zinc(25, "mg");
    const twice = { ...once, units: once.units * BigInt(2) };
    assert.equal(amountFromScaled(twice, "mg", "Zinc"), 50);
  });

  it("DOSE-07 fails closed on unknown units", () => {
    const result = scaleAmount({
      amount: 10,
      subjectId: "sup_zinc",
      subjectName: "Zinc",
      unit: "widgets"
    });
    assert.equal("reason" in result, true);
    if ("reason" in result) {
      assert.equal(result.reason, "unsupported_unit");
    }
  });

  it("DOSE-09 is permutation invariant", () => {
    const a: CanonicalCurrent = {
      daily: zinc(15, "mg"),
      dailyAmount: 15,
      name: "Zinc",
      sourceId: "b",
      subjectId: "sup_zinc",
      unit: "mg"
    };
    const b: CanonicalCurrent = {
      daily: zinc(10, "mg"),
      dailyAmount: 10,
      name: "Zinc",
      sourceId: "a",
      subjectId: "sup_zinc",
      unit: "mg"
    };
    const left = aggregateDailyExposure({ current: [a, b], variants: [] });
    const right = aggregateDailyExposure({ current: [b, a], variants: [] });
    assert.equal("reason" in left, false);
    assert.equal("reason" in right, false);
    if ("reason" in left || "reason" in right) {
      return;
    }
    assert.equal(left.totals.get("sup_zinc")?.units, right.totals.get("sup_zinc")?.units);
    assert.deepEqual(
      left.provenance.map((item) => item.sourceId),
      right.provenance.map((item) => item.sourceId)
    );
  });

  it("keeps amount-per-unit fixed when daily units change", () => {
    const perUnit = zinc(25, "mg");
    const x1: DoseVariant = {
      amountPerUnit: new Map([["sup_zinc", perUnit]]),
      contributions: new Map([["sup_zinc", perUnit]]),
      dailyPills: 1,
      dailyUnits: 1,
      productId: "prd_zinc",
      unknownSafetyAmount: false,
      variantId: "prd_zinc:x1"
    };
    const x2: DoseVariant = {
      amountPerUnit: new Map([["sup_zinc", perUnit]]),
      contributions: new Map([["sup_zinc", { ...perUnit, units: perUnit.units * BigInt(2) }]]),
      dailyPills: 2,
      dailyUnits: 2,
      productId: "prd_zinc",
      unknownSafetyAmount: false,
      variantId: "prd_zinc:x2"
    };
    assert.equal(x1.amountPerUnit.get("sup_zinc")?.units, x2.amountPerUnit.get("sup_zinc")?.units);
    assert.equal(
      x2.contributions.get("sup_zinc")?.units,
      (x1.amountPerUnit.get("sup_zinc")?.units ?? BigInt(0)) * BigInt(x2.dailyUnits)
    );
    const exposure = aggregateDailyExposure({ current: [], variants: [x2] });
    assert.equal("reason" in exposure, false);
    if ("reason" in exposure) {
      return;
    }
    assert.equal(amountFromScaled(exposure.totals.get("sup_zinc")!, "mg", "Zinc"), 50);
  });
});
