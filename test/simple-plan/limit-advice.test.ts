import assert from 'node:assert/strict';
import test from 'node:test';
import { internalFixture, storedFixture } from '../mcp-conversation-pack/helpers.ts';
import { presentDecision } from '../../lib/agentic/presentation/decision.ts';
import { evidenceTool } from '../../lib/agentic/evidence/tool.ts';
import { agenticServerInstructions } from '../../lib/agentic/contract/instructions.ts';
import { clientGuideMarkdown } from '../../lib/agentic/contract/guide.ts';
import type { SafetyGuidance } from '../../lib/agentic/plan/types.ts';

const finding = (extra: Partial<SafetyGuidance> = {}): SafetyGuidance => ({
  code: 'dose_review_required', kind: 'dose_review', ruleId: 'ul:fixture', rulesVersion: 'frozen', guidanceId: 'fixture',
  action: 'review', severity: 'high', exposure: 1200, threshold: 1010, unit: 'mcg', nutrientName: 'Fixture nutrient',
  supplementIds: ['sup_fixture'], productIds: [], sourceScope: 'total', message: 'Long stored source advice.',
  messageKey: 'fixture', contributors: [], ...extra
});
function fixture(guidance: SafetyGuidance[]) {
  const result = internalFixture(), product = result.selected!.basket[0];
  return { ...result, alternatives: [], requestSnapshot: { ...result.requestSnapshot, medicationCodes: ['apixaban'],
    targets: [{ name: 'Fixture nutrient', supplementId: 'sup_fixture', amount: 500, unit: 'mcg' as const, basis: 'supplemental' as const }] },
    selected: { ...result.selected!, basket: [{ ...product, requestedNutrients: [{ supplementId: 'sup_fixture', name: 'Fixture nutrient', amount: 1200, unit: 'mcg' as const }], incidentalNutrients: [], labelledFacts: [] }],
      safety: { ...result.selected!.safety!, guidance: guidance.map(row => ({ ...row, productIds: [product.productId] })) } } };
}
const advice = (result: ReturnType<typeof fixture>) => {
  const response = presentDecision(result, 'cap_limit_advice_fixture', 1);
  assert.ok('choices' in response); return response.choices.flatMap(option => option.ingredients.flatMap(row => row.advice ?? []));
};

test('MCP-LIMIT-01 only finite quantified exposure strictly above a positive recommended limit emits advice', () => {
  for (const extra of [{ exposure: 1000 }, { exposure: 1010 }, { exposure: null }, { exposure: NaN }, { exposure: Infinity },
    { threshold: null }, { threshold: 0 }, { threshold: -1 }, { threshold: Infinity }, { comparator: 'lt' as const },
    { code: 'continued_dose_increased' as const }, { code: 'duplicate_or_overlap' as const },
    { code: 'medication_interaction' as const }, { code: 'incomplete_information' as const },
    { code: 'unverified_product_facts' as const }, { ruleId: 'ul:missing:fixture' }]) {
    assert.deepEqual(advice(fixture([finding(extra)])), [], JSON.stringify(extra));
  }
  assert.equal(advice(fixture([finding({ exposure: 1010.001 })])).length, 1);
});

test('MCP-LIMIT-02 concise messages use the configured amount, preserve measurements and do not veto purchase', () => {
  for (const locale of ['en', 'th', 'zh-CN']) {
    const result = fixture([finding()]); result.requestSnapshot.locale = locale;
    const rows = advice(result); assert.equal(rows.length, 1); assert.equal(rows[0].exposure, 1200); assert.equal(rows[0].reference, 1010);
    assert.equal(rows[0].kind, 'dose_review'); assert.ok(rows[0].message.length < 160);
    assert.match(rows[0].message, /1010/);
    if (locale === 'en') assert.equal(rows[0].message, 'This dose exceeds the MattaNutra recommended limit of 1010 µg/day.');
    if (locale === 'th') assert.match(rows[0].message, /เกิน/);
    if (locale === 'zh-CN') assert.match(rows[0].message, /超过/);
    const response = presentDecision(result, 'cap_limit_advice_fixture', 1);
    assert.equal(response.status, 'ready'); assert.equal(response.nextAction, 'confirm_with_user');
    assert.doesNotMatch(response.summary, /not been assessed|cleared|medically approved/i);
  }
});

test('MCP-LIMIT-03 an estimated upper endpoint alone is not a confirmed excess', () => {
  const result = fixture([finding({ uncertaintyCodes: ['estimated_intake', 'upper_endpoint_of_estimate'] })]);
  assert.deepEqual(advice(result), []);
  for (const minimum of [900, 1100]) {
    result.selected.doseFit = { ...result.selected.doseFit!, perLimit: [{ subjectId: 'sup_fixture', name: 'Fixture nutrient',
      unit: 'mcg', sourceScope: 'total', exposure: 1200, exposureMinimum: minimum, exposureMaximum: 1200,
      limit: 1010, excess: 190, ruleId: 'ul:fixture', certainty: 'estimated' }] } as typeof result.selected.doseFit;
    assert.equal(advice(result).length, minimum > 1010 ? 1 : 0);
    if (minimum > 1010) assert.equal(advice(result)[0].exposure, minimum);
  }
});

test('MCP-LIMIT-04 internal fact lookup returns only exceeded-limit findings while preserving label facts and source', async () => {
  const result = fixture([finding({ authorityUrl: 'https://example.test/limit', evidence: ['Frozen source'] }), finding({ code: 'medication_interaction', threshold: null })]);
  const { app, handle } = await storedFixture(result);
  const decision = presentDecision(result, handle, 1); assert.ok('choices' in decision);
  const body = await evidenceTool({ ...app, planHandle: handle, expectedRevision: 1, optionId: decision.choices[0].optionId, ingredientId: 'sup_fixture' });
  assert.ok('findings' in body);
  assert.equal(body.ok, true); assert.ok(Array.isArray(body.facts)); assert.equal(body.findings.length, 1);
  assert.equal(body.findings[0].reference, 1010); assert.equal(body.findings[0].source, 'https://example.test/limit');
  assert.equal(body.findings[0].message, 'This dose exceeds the MattaNutra recommended limit of 1010 µg/day.');
  assert.equal(result.selected.safety.guidance.length, 2);
});

test('MCP-LIMIT-05 published instructions and guides describe only exceeded recommended-limit advice', () => {
  for (const locale of ['en', 'th', 'zh-CN']) {
    const text = agenticServerInstructions('dev', locale) + clientGuideMarkdown(locale, 'dev');
    assert.match(text, /Advice reports only quantified exposure above MattaNutra recommended limits/);
    assert.doesNotMatch(text, /Numerical overruns strictly above 20% receive prominent advice/);
  }
});
