import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateVo2Max } from "../lib/vo2-estimate.ts";

describe("VO2 estimate", () => {
  it("estimates from questionnaire activity, age band, sex, height and weight", () => {
    assert.equal(
      estimateVo2Max({
        activity: "moderate",
        age: "36-45",
        heightCm: "175",
        sex: "male",
        weightKg: "78"
      }),
      40
    );
  });

  it("returns null when required questionnaire fields are missing or unsupported", () => {
    assert.equal(
      estimateVo2Max({
        activity: "moderate",
        age: "36-45",
        heightCm: "",
        sex: "male",
        weightKg: "78"
      }),
      null
    );
    assert.equal(
      estimateVo2Max({
        activity: "unknown",
        age: "36-45",
        heightCm: "175",
        sex: "male",
        weightKg: "78"
      }),
      null
    );
  });

  it("clamps estimates to the display range used by the questionnaire", () => {
    assert.equal(
      estimateVo2Max({
        activity: "athlete",
        age: "18",
        heightCm: "250",
        sex: "male",
        weightKg: "30"
      }),
      70
    );
    assert.equal(
      estimateVo2Max({
        activity: "sedentary",
        age: "90",
        heightCm: "130",
        sex: "female",
        weightKg: "160"
      }),
      18
    );
  });
});
