import assert from "node:assert/strict";
import { test } from "node:test";
import { internalFixture } from "./helpers.ts";
import { evaluateSafety } from "../../lib/agentic/plan/safety.ts";
import { publicSafetyGuidance } from "../../lib/agentic/public-mapper.ts";
import { formatNutrientAmount } from "../../lib/agentic/presentation/amount.ts";

test("test_overlap_message_has_no_binary_float_junk", () => {
  const base = internalFixture(), amount = 158.39999999999998;
  for (const locale of ["en", "th", "zh-CN"] as const) for (const unit of ["mcg", "mg", "IU"] as const) {
    const selected = { ...base.selected!, coverage: [{ ...base.coverage[0], name: "Vitamin D3", unit,
      requestedAmount: 200, currentAmount: 1, deliveredAmount: amount, totalExposureAmount: amount + 1,
      remainingGap: 200 - amount - 1, status: "partial" as const,
      contributors: [{ productId: "prd_measured", productName: "Measured supplement", amount, unit, source: "selected" as const }] }] };
    const rows = evaluateSafety({ state: base.requestSnapshot, selected, locale });
    const overlap = rows.find(row => row.code === "duplicate_or_overlap"); assert.ok(overlap, "Real advice generation must exercise overlap copy");
    assert.doesNotMatch(overlap.message, /999999|\d+\.\d{8,}/);
    assert.ok(overlap.message.includes(unit === "IU" ? "158 IU" : `158.4 ${unit}`), overlap.message);
    assert.equal(overlap.contributors.find(row => row.productId === "prd_measured")?.amount, amount, "Display rounding cannot alter evidence");
    const saved = { ...overlap, message: `Measured supplement ${amount} ${unit}; remaining 40.60000000000002 ${unit}.` };
    const legacy = publicSafetyGuidance(saved);
    assert.doesNotMatch(legacy.message, /999999|\d+\.\d{8,}/, "Saved overlap copy also uses the formatter");
  }
});

test("overlap formatting retains requested precision above two decimal places", () => {
  const base = internalFixture();
  const selected = { ...base.selected!, coverage: [{ ...base.coverage[0], name: "Magnesium", unit: "mg", requestedAmount: 200.1234,
    currentAmount: 1, deliveredAmount: 158.456789, remainingGap: 40.666611, totalExposureAmount: 159.456789,
    status: "partial" as const, contributors: [{ productId: "prd_measured", productName: "Measured", amount: 158.456789, unit: "mg", source: "selected" as const }] }] };
  const row = evaluateSafety({ state: base.requestSnapshot, selected, locale: "en" }).find(row => row.code === "duplicate_or_overlap");
  assert.ok(row); assert.match(row.message, /158\.4568 mg/); assert.doesNotMatch(row.message, /158\.456789/);
  assert.match(publicSafetyGuidance(row, "not_required", 200.1234).message, /158\.4568 mg/);
});

test("nutrient amount formatter uses unit precision and never changes its input", () => {
  assert.equal(formatNutrientAmount(158.39999999999998, "mg"), "158.4");
  assert.equal(formatNutrientAmount(1.239, "mcg"), "1.24");
  assert.equal(formatNutrientAmount(158.39999999999998, "IU"), "158");
  assert.equal(formatNutrientAmount(158.9, "IU", 200.1234), "159");
  assert.equal(formatNutrientAmount(1.23456, "mg", 2.0001), "1.2346");
  assert.equal(formatNutrientAmount(0.0000123456, "mcg", 1e-7), "0.0000123");
});
