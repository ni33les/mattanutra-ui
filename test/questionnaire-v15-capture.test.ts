import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { validateCaptureAnswers } from "../lib/assessment-capture.ts";
import { buildCapturePayload, finalizeAssessmentCapture } from "../lib/questionnaire/agents/capture-agent.ts";
import { createScreenState, fastForwardScreens, updateScreenAnswer } from "../lib/questionnaire/screens.ts";
import { createInitialState, fastForwardQuestionnaire } from "../lib/questionnaire/engine.ts";

function completed() {
  let state = fastForwardScreens(createScreenState("en", randomUUID()));
  state = updateScreenAnswer(state, "heightStatus", "unknown");
  state = updateScreenAnswer(state, "avoid", "kimchi");
  state = updateScreenAnswer(state, "suppAllergies", ["other"]);
  state = updateScreenAnswer(state, "otherSupp", "Reaction to a previous supplement");
  return { ...state, answers: { ...state.answers, disclosure: true }, phase: "complete" as const, completedAt: Date.now() };
}

it("grouped answers retain unknown measurements and safety detail at the server boundary", () => {
  const payload = buildCapturePayload(completed());
  const answers = validateCaptureAnswers(payload.answers);
  assert.equal(answers.heightCm, "");
  assert.equal(answers.weightKg, "72");
  assert.deepEqual(answers.answerStatus, { height: "unknown", weight: "known" });
  assert.equal(answers.avoid, "kimchi");
  assert.equal(answers.otherSupp, "Reaction to a previous supplement");
  assert.equal(answers.consentSafety, true);
  assert.equal(answers.disclosure, true);
  assert.equal(payload.precision, null);
  assert.equal(payload.completionPct, 100);
});

it("capture rejects malformed extension fields and invalid lab dates", () => {
  for (const input of [
    { answerStatus: { height: "probably" } },
    { answerStatus: { arbitrary: "known" } },
    { labsHave: "unknown" },
    { consentSafety: "yes" },
    { labDate: "2026-02-30" },
    { labDate: "2999-01-01" },
    { avoid: ["kimchi"] },
    { otherSupp: { note: "reaction" } }
  ]) assert.throws(() => validateCaptureAnswers(input), { code: "invalid_answers" });
});

it("new questionnaire uses the native idempotent capture and pharmacy binding fields", async () => {
  const state = completed();
  const calls: Array<{ body: Record<string, unknown>; options: { idempotencyKey: string } }> = [];
  const captureImpl = async (body: unknown, options: { idempotencyKey: string }) => {
    const value = body as Record<string, unknown>;
    validateCaptureAnswers(value.answers);
    calls.push({ body: value, options });
    return { planId: "saved-plan", revision: 3, inputHash: "saved-input" };
  };
  const input = { state, pharmacyId: "existing-pharmacy", planId: "saved-plan", expectedRevision: 2, captureImpl };
  assert.equal((await finalizeAssessmentCapture(input)).ok, true);
  assert.equal((await finalizeAssessmentCapture(input)).ok, true);
  assert.equal(calls[0].options.idempotencyKey, calls[1].options.idempotencyKey);
  assert.equal(calls[0].body.pharmacyId, "existing-pharmacy");
  assert.equal(calls[0].body.expectedRevision, 2);
  assert.equal(calls[0].body.questionnaireState, state);
  const bpm = calls[0].body.bpm as { properties: Record<string, unknown> };
  assert.equal(bpm.properties.completionPct, 100);
  assert.equal("precision" in bpm.properties, false);
});

it("legacy conversational capture retains its existing precision contract", () => {
  const legacy = fastForwardQuestionnaire(createInitialState({ locale: "en", channel: "line" }));
  assert.ok(legacy.ok);
  const payload = buildCapturePayload(legacy.state);
  assert.equal(typeof payload.precision, "number");
  assert.equal("completionPct" in payload, false);
  assert.doesNotThrow(() => validateCaptureAnswers(payload.answers, "line"));
});
