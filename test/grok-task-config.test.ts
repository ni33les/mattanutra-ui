import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_GROK_MODEL } from "../lib/grok-client.ts";
import {
  GROK_TASK_REASONING_DEFAULTS,
  grokTaskReasoningDefault
} from "../lib/grok-task-config.ts";

describe("grok task config", () => {
  it("defaults to the highest general chat model on the account", () => {
    assert.equal(DEFAULT_GROK_MODEL, "grok-4.5");
  });

  it("uses medium reasoning for clinical and customer advice paths", () => {
    assert.equal(grokTaskReasoningDefault("formulation"), "medium");
    assert.equal(grokTaskReasoningDefault("foodGuidance"), "medium");
    assert.equal(grokTaskReasoningDefault("healthScoreCopy"), "medium");
    assert.equal(grokTaskReasoningDefault("nutritionAdvisor"), "medium");
    assert.equal(grokTaskReasoningDefault("panyaChat"), "medium");
  });

  it("uses none/low for template, translation, and bulk paths", () => {
    assert.equal(grokTaskReasoningDefault("panyaWelcome"), "none");
    assert.equal(grokTaskReasoningDefault("productCopyTranslation"), "low");
    assert.equal(grokTaskReasoningDefault("productFactCorrection"), "low");
    assert.equal(grokTaskReasoningDefault("customerInsights"), "low");
    assert.equal(grokTaskReasoningDefault("foodReview"), "low");
  });

  it("only uses supported task reasoning values", () => {
    for (const value of Object.values(GROK_TASK_REASONING_DEFAULTS)) {
      assert.ok(["none", "low", "medium"].includes(value), value);
    }
  });
});
