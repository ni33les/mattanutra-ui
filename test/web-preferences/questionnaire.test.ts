import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInitialAnswers, buildRandomDevAnswers, precisionProgress } from '../../components/assessment-flow-state.ts';
import { createInitialState, fastForwardQuestionnaire, getDefinition, getNextPrompt, deserializeState, computePrecision, isVisibleTurn, summarizeAnswer } from '../../lib/questionnaire/engine.ts';
import { buildCapturePayload } from '../../lib/questionnaire/agents/capture-agent.ts';
import { resolveChatDraft } from '../../lib/questionnaire/browser-draft.ts';
const keys = ['budget', 'maxPills', 'form'];
const preferences = { budget: 'u1000', maxPills: '1-3', form: 'capsules' };
for (const locale of ['en', 'th', 'zh-CN'] as const) {
  test(`WEB-PREF-01 ${locale}: web traversal, review and precision omit purchase questions`, () => {
    const result = fastForwardQuestionnaire(createInitialState({ locale, channel: 'web' }));
    assert.equal(result.ok, true); assert.equal(result.state.phase, 'complete');
    const state = result.state, definition = getDefinition(state);
    assert.equal(definition.turns.length, 53, 'Historical turn indices must not move');
    assert.ok(!state.log.some(row => 'turnKey' in row && keys.includes(row.turnKey)));
    assert.ok(keys.every(key => state.answers[key] === undefined));
    const old = { ...state, answers: { ...state.answers, ...preferences }, earned: { ...state.earned, budget: 2, maxPills: 2, form: 2 } };
    for (const key of keys) assert.equal(summarizeAnswer(old, key), null);
    assert.equal(computePrecision(definition, old), computePrecision(definition, state));
  });
}
test('WEB-PREF-02 agent and LINE retain questions and captured preferences', () => {
  for (const channel of ['agent', 'line', 'api'] as const) {
    const state = createInitialState({ locale: 'en', channel });
    const complete = fastForwardQuestionnaire(state); assert.equal(complete.ok, true);
    assert.ok(keys.every(key => complete.state.answers[key] !== undefined));
    const captured = buildCapturePayload({ ...complete.state, answers: { ...complete.state.answers, ...preferences } });
    for (const key of keys) assert.equal(captured.answers[key as keyof typeof captured.answers], preferences[key as keyof typeof preferences]);
  }
});
test('WEB-PREF-03 resume on each retired web turn skips it without renumbering or losing health context', () => {
  const state = createInitialState({ locale: 'en', channel: 'web' }), definition = getDefinition(state);
  for (const key of keys) {
    const turnIndex = definition.turns.findIndex(turn => turn.k === key); assert.ok(turnIndex >= 0);
    const restored = deserializeState(JSON.stringify({ ...state, phase: 'active', turnIndex, answers: { ...preferences, firstName: 'Maya', meds: 'yes', medTypes: ['statin'] } }));
    assert.ok(restored); const next = getNextPrompt(restored);
    assert.ok(next.turn && !keys.includes(next.turn.k)); assert.ok(next.turnIndex > turnIndex);
    assert.deepEqual(restored.answers.medTypes, ['statin']); assert.equal(restored.answers.firstName, 'Maya');
    const captured = buildCapturePayload(restored);
    for (const key of keys) assert.equal(captured.answers[key as keyof typeof captured.answers], '');
  }
});
test('WEB-PREF-04 classic completion and random presets omit the three answers', () => {
  const initial = buildInitialAnswers(), old = buildInitialAnswers(preferences);
  assert.deepEqual(precisionProgress(initial), precisionProgress(old));
  const random = buildRandomDevAnswers();
  for (const key of keys) assert.equal(random[key as keyof typeof random], '');
});
test('WEB-PREF-05 browser server resume remains web-scoped and preserves receipt and payment', () => {
  const state = createInitialState({ locale: 'en', channel: 'web', planId: 'saved-plan' });
  const draft = resolveChatDraft({ locale: 'th', sessionId: state.sessionId, server: { captured: true, revision: 3, planId: 'saved-plan', paymentId: 'frozen-payment', questionnaireState: { ...state, answers: { ...preferences, meds: 'yes' } } } });
  assert.equal(draft.captured?.revision, 3); assert.equal(draft.paymentId, 'frozen-payment');
  const capture = buildCapturePayload(draft.state);
  assert.equal(capture.answers.meds, 'yes'); assert.equal(capture.answers.budget, '');
  const definition = getDefinition(draft.state);
  assert.ok(definition.turns.filter(t => keys.includes(t.k)).every(t => !isVisibleTurn(definition, t, draft.state.answers, draft.state.channel)));
});
test('WEB-PREF-09 section introduction no longer promises budget or format personalisation', () => {
  for (const locale of ['en', 'th'] as const) {
    const definition = getDefinition(createInitialState({ locale, channel: 'web' }));
    assert.doesNotMatch(definition.sections[5]!.desc, /budget|งบประมาณ/);
  }
});
