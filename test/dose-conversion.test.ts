import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  comparableDoseAmount,
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
});
