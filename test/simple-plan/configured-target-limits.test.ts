import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { validateToolIssues } from '../../lib/agentic/contract/validate.ts';
import { fixtureSnapshot } from '../../lib/agentic/catalogue/fixtures.ts';
import { replaceCatalogueSnapshot } from '../../lib/agentic/catalogue/snapshot.ts';
import { prepareSimpleRequest } from '../../lib/agentic/plan/simple-input.ts';
import { normalizePlanRequest, planRematchFingerprint } from '../../lib/agentic/plan/normalize.ts';
import { applyConfiguredTargetLimits } from '../../lib/agentic/plan/configured-target-limits.ts';
import { toCanonicalRequest } from '../../lib/agentic/plan/matching.ts';
import { isAgenticErrorResult } from '../../lib/agentic/contract/errors.ts';
import { SIMPLE_PLAN_SUCCESS_SCHEMA } from '../../lib/agentic/contract/decision-schema.ts';
import { presentDecision } from '../../lib/agentic/presentation/decision.ts';
import { targetLimitIssues } from '../../lib/agentic/presentation/target-limit-notes.ts';
import { setMatcherSafetyCeilings } from '../../lib/matcher/safety-ceilings.ts';
import { runWithMatcherSafetySnapshot } from '../../lib/matcher/safety-ceilings-server.ts';
import { internalFixture } from '../mcp-conversation-pack/helpers.ts';
import { rpc, rpcWithTaskExecutor, runtime, uninstallRealCatalogue } from '../ax-refinement/helpers.ts';
import type { CanonicalPlanState, PlanRequest } from '../../lib/agentic/plan/types.ts';
import type { SafetyCeiling } from '../../lib/matcher/types.ts';

const snapshot = fixtureSnapshot();
const d3 = snapshot.supplements.find(row => row.name === 'Vitamin D3')!;
const k2 = snapshot.supplements.find(row => row.name === 'Vitamin K2')!;
const band = (patch: Partial<SafetyCeiling> = {}): SafetyCeiling => ({ subjectId: d3.supplementId, name: d3.name,
  maxAmount: 15, maxUnit: 'mcg', lifeStage: 'adult', sourceScope: 'supplemental', bandId: 'configured-fixture', bandVersion: 1, ...patch });
const input = (amount = 2000, patch: Record<string, unknown> = {}) => ({ locale: 'en', destinationCountry: 'TH',
  profile: { ageYears: 35, lifeStage: 'adult' }, currentSupplements: [],
  intake: [{ name: 'D3', source: 'diet', certainty: 'known', amount: 0, unit: 'IU' }],
  targets: [{ name: 'D3', amount, unit: 'IU', basis: 'supplemental' }], ...patch });
async function prepare(value: Record<string, unknown> = input(), previous?: PlanRequest) {
  const request = prepareSimpleRequest(value, snapshot, previous);
  assert.ok(!isAgenticErrorResult(request), JSON.stringify(request));
  const normalized = await normalizePlanRequest({ request, snapshot, config: runtime('configured-limits').config });
  assert.ok(!isAgenticErrorResult(normalized), JSON.stringify(normalized));
  return normalized.state;
}
function presentation(state: CanonicalPlanState, supplied = 600, known = true) {
  const result = internalFixture(), product = result.selected!.basket[0];
  result.requestSnapshot = state;
  result.selected = { ...result.selected!, coverage: [{ ...result.selected!.coverage[0], supplementId: d3.supplementId,
    name: 'Vitamin D3', currentAmount: 0, intakeCertainty: known ? 'known' : 'unknown' }], basket: [{ ...product,
    requestedNutrients: [{ supplementId: d3.supplementId, name: d3.name, amount: supplied, unit: 'IU' }],
    incidentalNutrients: [], labelledFacts: [] }] };
  return result;
}
beforeEach(() => { replaceCatalogueSnapshot(snapshot); setMatcherSafetyCeilings([band()]); });
afterEach(uninstallRealCatalogue);

test('CFG-LIMIT-01 normalization clamps with matching unit conversion and preserves original intent', async () => {
  const state = await prepare();
  assert.equal(state.targets[0].amount, 600);
  assert.equal(state.originalRequest!.targets[0].amount, 2000);
  assert.deepEqual(state.currentSupplements, []);
  assert.equal(state.targetLimitAdjustments?.length, 1);
  assert.equal(state.targetLimitAdjustments[0].bandId, 'configured-fixture');
  const canonical = toCanonicalRequest(state); assert.ok(!('error' in canonical));
  assert.equal(canonical.targets[0].requested.units, 15000n);
  assert.deepEqual(applyConfiguredTargetLimits(state), state);
});

test('CFG-LIMIT-02 equal, below and zero targets are unchanged with no note', async () => {
  for (const amount of [600, 500, 0]) {
    const state = await prepare(input(amount));
    assert.equal(state.targets[0].amount, amount); assert.deepEqual(targetLimitIssues(state), []);
  }
});

test('CFG-LIMIT-03 scope and population select only the applicable configured band', async () => {
  setMatcherSafetyCeilings([band(), band({ sourceScope: 'total', maxAmount: 30 }), band({ lifeStage: 'child_4_8', maxAmount: 10 })]);
  const total = await prepare(input(2000, { targets: [{ name: 'D3', amount: 2000, unit: 'IU', basis: 'total_daily' }] }));
  assert.equal(total.targets[0].amount, 1200);
  const child = await prepare(input(2000, { profile: { ageYears: 7, lifeStage: 'child' } }));
  assert.equal(child.targets[0].amount, 400);
  for (const profile of [{}, { ageYears: 35 }, { lifeStage: 'adult' }, { ageYears: 35, lifeStage: 'pregnant' }]) {
    const state = await prepare(input(2000, { profile }));
    assert.equal(state.targets[0].amount, 2000); assert.deepEqual(targetLimitIssues(state), []);
  }
  setMatcherSafetyCeilings([band()]);
  assert.equal((await prepare(input(2000, { targets: [{ name: 'D3', amount: 2000, unit: 'IU', basis: 'total_daily' }] }))).targets[0].amount, 2000);
});

test('CFG-LIMIT-04 absent, invalid and incompatible limits do not invent adjustments', async () => {
  for (const ceilings of [[], [band({ maxAmount: 0 })], [band({ maxAmount: -1 })], [band({ maxAmount: Infinity })], [band({ maxUnit: 'ml' })]]) {
    setMatcherSafetyCeilings(ceilings);
    const state = await prepare(); assert.equal(state.targets[0].amount, 2000); assert.deepEqual(targetLimitIssues(state), []);
  }
});

test('CFG-LIMIT-05 ranges cap with their target, while current intake and product proposals remain intact', async () => {
  const request = input(2000, { targets: [{ name: 'D3', amount: 2000, unit: 'IU', basis: 'supplemental', acceptableRange: { minimum: 25, maximum: 75, unit: 'mcg' } }],
    currentSupplements: [{ name: 'D3', dailyAmount: 100, unit: 'IU' }],
    requirements: { productDoses: [{ productId: snapshot.products[0].productId, servingsPerDay: 1 }] } });
  const state = await prepare(request);
  assert.deepEqual(state.targets[0].acceptableRange, { minimum: 600, maximum: 600, unit: 'IU' });
  assert.deepEqual(state.originalRequest!.targets[0].acceptableRange, request.targets[0].acceptableRange);
  assert.equal(state.currentSupplements[0].dailyAmount, 100);
  assert.deepEqual(state.requirements.productDoses, request.requirements.productDoses);
});

test('CFG-LIMIT-06 response gaps, met copy and percentages use the limit while requested stays original', async () => {
  const state = await prepare();
  for (const [supplied, gap, percent] of [[600, 0, 100], [300, 300, 50], [700, 0, 100]]) {
    const response = presentDecision(presentation(state, supplied), 'cap_configured', 1);
    assert.ok('choices' in response); assert.deepEqual(validateToolIssues(SIMPLE_PLAN_SUCCESS_SCHEMA, response), []);
    const ingredient = response.choices[0].ingredients[0];
    assert.equal(ingredient.requested, 2000); assert.equal(ingredient.gap, gap);
    assert.equal(ingredient.excess, Math.max(0, supplied - 600));
    assert.equal(response.choices[0].summary.coveragePercent, percent);
    assert.match(response.summary, /2000 IU.*600 IU/);
    if (supplied >= 600) assert.match(response.summary, /meet 1\/1 planned targets/);
    else assert.match(response.summary, /300\/600 IU planned/);
    assert.equal(response.requestIssues?.filter(row => row.code === 'adjusted_to_configured_limit').length, 1);
  }
  const unknown = presentDecision(presentation(state, 600, false), 'cap_configured', 1);
  assert.ok('choices' in unknown); assert.equal(unknown.choices[0].summary.coveragePercent, null);
  assert.equal(unknown.choices[0].summary.coverageAtLeastPercent, 100);
  assert.equal(unknown.choices[0].ingredients[0].gap, null);
});

test('CFG-LIMIT-07 localized adjustment issues coexist with availability issues and remain bounded', async () => {
  setMatcherSafetyCeilings([band(), band({ subjectId: k2.supplementId, name: k2.name, maxAmount: 75 })]);
  for (const locale of ['en', 'th', 'zh-CN']) {
    const state = await prepare(input(2000, { locale, targets: [...input().targets, { name: 'K2', amount: 100, unit: 'mcg', basis: 'supplemental' }] }));
    const empty = presentation(state, 0); empty.selected!.basket = [];
    const response = presentDecision(empty, 'cap_configured', 1); assert.ok('choices' in response);
    assert.equal(response.requestIssues?.filter(row => row.code === 'adjusted_to_configured_limit').length, 2);
    assert.ok(response.requestIssues?.some(row => row.code === 'not_selected' && row.itemId === d3.supplementId));
    assert.ok(response.requestIssues?.every(row => row.message.length <= 240));
    assert.ok(response.summary.length <= 600); assert.deepEqual(validateToolIssues(SIMPLE_PLAN_SUCCESS_SCHEMA, response), []);
  }
});

test('CFG-LIMIT-08 refinement recomputes from original intent after unit, profile, amount or band changes', async () => {
  const initial = await prepare(), original = initial.originalRequest!;
  const unitOnly = await prepare({ targets: [{ ingredientId: d3.supplementId, unit: 'mcg' }] }, original);
  assert.equal(unitOnly.originalRequest!.targets[0].amount, 50); assert.equal(unitOnly.targets[0].amount, 15);
  const lowered = await prepare({ targets: [{ ingredientId: d3.supplementId, amount: 500 }] }, original);
  assert.equal(lowered.targets[0].amount, 500); assert.deepEqual(targetLimitIssues(lowered), []);
  const cleared = await prepare({ targets: [{ ingredientId: d3.supplementId, amount: null }] }, original);
  assert.deepEqual(cleared.targets, []); assert.deepEqual(targetLimitIssues(cleared), []);
  const missingProfile = applyConfiguredTargetLimits({ ...initial, profileKnown: { ageYears: false, lifeStage: false, sex: false } });
  assert.equal(missingProfile.targets[0].amount, 2000); assert.deepEqual(targetLimitIssues(missingProfile), []);
  setMatcherSafetyCeilings([band({ maxAmount: 25, bandVersion: 2 })]);
  const raised = applyConfiguredTargetLimits(initial);
  assert.equal(raised.targets[0].amount, 1000);
  assert.notEqual(planRematchFingerprint(raised), planRematchFingerprint(initial));
  assert.equal(presentDecision(presentation(initial), 'cap_frozen', 1).summary.includes('600 IU'), true);
});

test('CFG-LIMIT-09 captured operation references win over a concurrent process refresh', async () => {
  const captured = { version: 1 as const, ceilings: [band()], identity: { runtimeRevision: 99, fingerprint: 'frozen' }, unavailable: false };
  await runWithMatcherSafetySnapshot(captured, async () => {
    setMatcherSafetyCeilings([band({ maxAmount: 25 })], { runtimeRevision: 100, fingerprint: 'new' });
    const state = await prepare(); assert.equal(state.targets[0].amount, 600);
    assert.equal(state.configuredLimitPolicy?.referenceFingerprint, 'frozen');
  });
});

test('CFG-LIMIT-10 actual task matching, replay and refinement preserve effective coverage and original notes', async () => {
  // The catalogue fixture supplies 2000 IU per physical serving; this limit is fixture data, not a regulatory claim.
  setMatcherSafetyCeilings([band({ maxAmount: 50 })]);
  const app = runtime('configured-limits-journey');
  const request = { ...input(4000), idempotencyKey: 'configured-limits-create' };
  const first = await rpcWithTaskExecutor(app, 'plan', request);
  assert.equal(first.ok, true, JSON.stringify(first)); assert.equal(first.status, 'ready');
  const decision = first as unknown as ReturnType<typeof presentDecision>; assert.ok('choices' in decision);
  assert.equal(decision.choices[0].ingredients[0].requested, 4000);
  assert.equal(decision.choices[0].ingredients[0].gap, 0);
  assert.equal(decision.choices[0].summary.coveragePercent, 100);
  assert.match(decision.requestIssues![0].message, /4000 IU.*2000 IU/);
  assert.deepEqual(await rpc(app, 'plan', request), first);
  assert.deepEqual(await rpc(app, 'plan', { planHandle: first.planHandle }), first);
  const changed = await rpcWithTaskExecutor(app, 'plan', { planHandle: first.planHandle, expectedRevision: first.revision,
    idempotencyKey: 'configured-limits-refine', targets: [{ ingredientId: d3.supplementId, amount: 2000 }] });
  assert.equal(changed.ok, true); assert.equal(changed.revision, 2); assert.equal(changed.requestIssues, undefined);
  const different = await rpcWithTaskExecutor(app, 'plan', { ...input(5000), idempotencyKey: 'configured-limits-other-request' });
  assert.match(JSON.stringify(different.requestIssues), /5000 IU/); assert.doesNotMatch(JSON.stringify(different.requestIssues), /4000 IU/);
});

test('CFG-LIMIT-11 a changed reference bypasses no-op reuse while a frozen handle retains its note', async () => {
  setMatcherSafetyCeilings([band({ maxAmount: 50 })], { runtimeRevision: 99, fingerprint: 'first-band' });
  const app = runtime('configured-limits-refresh');
  const first = await rpcWithTaskExecutor(app, 'plan', { ...input(5000), idempotencyKey: 'configured-refresh-create' });
  assert.match(JSON.stringify(first.requestIssues), /2000 IU/);
  setMatcherSafetyCeilings([band({ maxAmount: 100, bandVersion: 2 })], { runtimeRevision: 99, fingerprint: 'second-band' });
  assert.deepEqual(await rpc(app, 'plan', { planHandle: first.planHandle }), first);
  const refreshed = await rpcWithTaskExecutor(app, 'plan', { planHandle: first.planHandle, expectedRevision: 1,
    idempotencyKey: 'configured-refresh-new-revision', scoring: {} });
  assert.equal(refreshed.revision, 2); assert.match(JSON.stringify(refreshed.requestIssues), /5000 IU.*4000 IU/);
});

test('CFG-LIMIT-12 existing exposure advice is unchanged for the same basket and medication context', async () => {
  const state = await prepare(input(2000, { medicationCodes: ['apixaban'] }));
  const adjusted = presentation(state, 700), product = adjusted.selected!.basket[0];
  const finding = { code: 'dose_review_required' as const, kind: 'dose_review' as const, ruleId: 'configured-fixture',
    rulesVersion: '1', guidanceId: 'existing-dose-advice', action: 'review' as const, severity: 'high' as const,
    exposure: 700, threshold: 600, unit: 'IU', nutrientName: d3.name, supplementIds: [d3.supplementId],
    productIds: [product.productId], sourceScope: 'supplemental' as const, message: 'Preserved warning', messageKey: 'fixture', contributors: [] };
  const withAdvice = { ...adjusted, selected: { ...adjusted.selected!, safety: { assessedConditionCodes: [], assessedMedicationCodes: [],
    guidance: [finding, { ...finding, code: 'medication_interaction' as const, nutrientName: 'Vitamin K2', threshold: null, supplementIds: [k2.supplementId] }] } } };
  const before = presentDecision({ ...withAdvice, requestSnapshot: { ...state, targetLimitAdjustments: undefined } }, 'cap_warning', 1);
  const after = presentDecision(withAdvice, 'cap_warning', 1);
  assert.ok('choices' in before && 'choices' in after);
  assert.deepEqual(after.choices[0].ingredients.map(row => row.advice), before.choices[0].ingredients.map(row => row.advice));
  assert.equal(after.choices[0].ingredients[0].advice?.length, 1);
  assert.equal(withAdvice.selected.safety.guidance.length, 2);
});
