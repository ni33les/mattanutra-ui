import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSESSMENT_FIRST_NAME_MAX_LENGTH,
  firstNameFromAssessmentAnswers,
  normalizeAssessmentFirstName
} from "../lib/assessment-first-name.ts";

describe("assessment first name normalization", () => {
  it("keeps ordinary English and Thai names", () => {
    assert.equal(normalizeAssessmentFirstName("  Maya  "), "Maya");
    assert.equal(normalizeAssessmentFirstName("นิชา"), "นิชา");
  });

  it("collapses spacing and clamps long values", () => {
    assert.equal(normalizeAssessmentFirstName("Mary   Jane"), "Mary Jane");
    assert.equal(
      normalizeAssessmentFirstName("A".repeat(ASSESSMENT_FIRST_NAME_MAX_LENGTH + 8)),
      "A".repeat(ASSESSMENT_FIRST_NAME_MAX_LENGTH)
    );
  });

  it("returns null for missing, too-short, numeric, symbol, and joke values", () => {
    assert.equal(normalizeAssessmentFirstName(""), null);
    assert.equal(normalizeAssessmentFirstName(" A "), null);
    assert.equal(normalizeAssessmentFirstName("Maya2"), null);
    assert.equal(normalizeAssessmentFirstName("Maya!"), null);
    assert.equal(normalizeAssessmentFirstName("test"), null);
  });

  it("reads the canonical and legacy answer keys", () => {
    assert.equal(firstNameFromAssessmentAnswers({ firstName: "Niran" }), "Niran");
    assert.equal(firstNameFromAssessmentAnswers({ first_name: "Niran" }), "Niran");
    assert.equal(firstNameFromAssessmentAnswers({ firstName: "null" }), null);
  });
});
