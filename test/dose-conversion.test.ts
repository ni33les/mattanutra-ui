import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  comparableDoseAmount,
  doseAmountInLimitUnit,
  doseExceedsLimit,
  parseDose,
  parseDoseLimit
} from "../lib/dose-conversion.ts";

describe("dose conversion", () => {
  it("compares mass units through a standard mcg basis", () => {
    const dose = parseDose("1 g/day");
    const limit = parseDoseLimit(500, "mg/day");

    assert.ok(dose);
    assert.ok(limit);
    assert.equal(doseExceedsLimit(dose, limit), true);
  });

  it("keeps vitamin D display units but compares IU against mcg limits", () => {
    const dose = parseDose("2000 IU/day", "vitamin_d3");
    const limit = parseDoseLimit(100, "mcg/day");

    assert.ok(dose);
    assert.ok(limit);
    assert.equal(comparableDoseAmount(dose, "vitamin_d3"), 50);
    assert.equal(doseExceedsLimit(dose, limit, "vitamin_d3"), false);
  });

  it("detects vitamin D doses that exceed the mcg safety ceiling", () => {
    const dose = parseDose("5000 IU/day", "vitamin_d3");
    const limit = parseDoseLimit(100, "mcg/day");

    assert.ok(dose);
    assert.ok(limit);
    assert.equal(doseExceedsLimit(dose, limit, "vitamin_d3"), true);
  });

  it("compares high-strength vitamin D mass doses against the mcg safety ceiling", () => {
    const dose = parseDose("1 mg/day", "vitamin_d3");
    const limit = parseDoseLimit(100, "mcg/day");

    assert.ok(dose);
    assert.ok(limit);
    assert.equal(doseExceedsLimit(dose, limit, "vitamin_d3"), true);
    assert.equal(doseAmountInLimitUnit(dose, limit, "vitamin_d3"), 1000);
  });

  it("compares vitamin E IU against alpha-tocopherol mg limits", () => {
    const dose = parseDose("250 IU/day", "vitamin_e");
    const limit = parseDoseLimit(1000, "mg alpha-tocopherol/day");

    assert.ok(dose);
    assert.ok(limit);
    assert.equal(comparableDoseAmount(dose, "vitamin_e"), 167_500);
    assert.equal(doseExceedsLimit(dose, limit, "vitamin_e"), false);
  });

  it("compares probiotic CFU units on a shared colony-count basis", () => {
    const dose = parseDose("2.3 billion CFU per serve", "probiotics");
    const safeLimit = parseDoseLimit(5, "billion CFU/day");
    const lowLimit = parseDoseLimit(1_500, "million CFU/day");

    assert.ok(dose);
    assert.ok(safeLimit);
    assert.ok(lowLimit);
    assert.equal(comparableDoseAmount(dose, "probiotics"), 2_300_000_000);
    assert.equal(doseExceedsLimit(dose, safeLimit, "probiotics"), false);
    assert.equal(doseExceedsLimit(dose, lowLimit, "probiotics"), true);
  });

  it("returns unverified for IU conversions without an ingredient rule", () => {
    const dose = parseDose("2000 IU/day", "unknown_ingredient");
    const limit = parseDoseLimit(100, "mcg/day");

    assert.ok(dose);
    assert.ok(limit);
    assert.equal(doseExceedsLimit(dose, limit, "unknown_ingredient"), null);
  });

  it("parses configured limit units with descriptive suffixes", () => {
    const dose = parseDose("250 mg daily");
    const limit = parseDoseLimit(350, "mg/day supplemental");

    assert.ok(dose);
    assert.ok(limit);
    assert.equal(doseExceedsLimit(dose, limit), false);
  });

  it("converts a product dose into the configured limit unit without changing labels", () => {
    const dose = parseDose("4 mg daily");
    const limit = parseDoseLimit(3000, "mcg RAE/day");

    assert.ok(dose);
    assert.ok(limit);
    assert.equal(doseExceedsLimit(dose, limit, "vitamin_a"), true);
    assert.equal(doseAmountInLimitUnit(dose, limit, "vitamin_a"), 4000);
    assert.equal(limit.originalText, "mcg RAE/day");
  });

  it("converts comparable CFU limits into the stored configured unit", () => {
    const dose = parseDose("2.3 billion CFU per serve", "probiotics");
    const limit = parseDoseLimit(1500, "million CFU/day");

    assert.ok(dose);
    assert.ok(limit);
    assert.equal(doseAmountInLimitUnit(dose, limit, "probiotics"), 2300);
  });
});
