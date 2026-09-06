import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../lib/questionnaire/engine.ts";
import { chatAnswersFromAssessment, parseChatDraft, resolveChatDraft, updateChatDraft, type ChatDraft } from "../lib/questionnaire/browser-draft.ts";
import { toAssessmentAnswers } from "../lib/questionnaire/normalize.ts";

const local = (sessionId: string): ChatDraft => ({ version: 1, state: { ...createInitialState({ locale: "en", sessionId }), answers: { firstName: "Local" } }, revision: 2, captured: null, contactEmail: "prior@fixture.test", paymentId: null, updatedAt: 3000 });
describe("questionnaire browser draft recovery", () => {
  it("ignores unrelated browser state and hydrates fresh-browser resume with payment and contact", () => {
    const server = { answers: { firstName: "Saved", sex: "male", age: "36-45" }, planId: "reserved", revision: 0, paymentId: "payment", contactEmail: "saved@fixture.test", captured: false };
    const draft = resolveChatDraft({ locale: "th", sessionId: "resume-session", server, local: local("unrelated") });
    assert.equal(draft.state.answers.firstName, "Saved");
    assert.equal(draft.paymentId, "payment"); assert.equal(draft.contactEmail, "saved@fixture.test");
    assert.equal(draft.state.locale, "th");
  });
  it("accepts newer local edits only with the same session and server revision", () => {
    const state = { ...createInitialState({ locale: "en", sessionId: "same", planId: "plan" }), answers: { firstName: "Server" } };
    const server = { questionnaireState: state, planId: "plan", revision: 2, captured: true, updatedAt: new Date(2000).toISOString() };
    assert.equal(resolveChatDraft({ locale: "en", sessionId: "same", server, local: local("same") }).state.answers.firstName, "Local");
    assert.equal(resolveChatDraft({ locale: "en", sessionId: "same", server: { ...server, revision: 3 }, local: local("same") }).state.answers.firstName, "Server");
  });
  it("retains a capture receipt through reload and clears it after an answer edit", () => {
    const draft = resolveChatDraft({ locale: "en", sessionId: "same", server: { answers: { firstName: "Saved" }, planId: "plan", revision: 2, captured: true } });
    assert.deepEqual(parseChatDraft(JSON.stringify(draft))?.captured, { planId: "plan", revision: 2 });
    assert.equal(updateChatDraft(draft, { ...draft.state, answers: { ...draft.state.answers, age: "46-55" } }).captured, null);
    const switched = resolveChatDraft({ locale: "zh-CN", sessionId: "same", local: draft });
    assert.equal(switched.captured?.planId, "plan"); assert.equal(switched.state.locale, "zh-CN");
  });
  it("maps saved body, food, lab and safety inputs without losing their values", () => {
    const answers = { heightCm: "173", weightKg: "69", foodFrequency: { fish: "often" }, skin: "IV", labs: { vitd: "30" }, labUnits: { vitd: "ng/mL" }, disclosure: true };
    const result = toAssessmentAnswers(chatAnswersFromAssessment(answers));
    assert.equal(result.heightCm, answers.heightCm); assert.equal(result.weightKg, answers.weightKg);
    assert.equal(result.foodFrequency.fish, "often"); assert.equal(result.skin, "IV"); assert.equal(result.labs.vitd, "30"); assert.equal(result.disclosure, true);
  });
});
