import { adviceKind } from "../../lib/agentic/value/advice-kind.ts";
import assert from 'node:assert/strict';
import test from 'node:test';
import { internalFixture } from '../mcp-conversation-pack/helpers.ts';
import { presentDecision } from '../../lib/agentic/presentation/decision.ts';
import type { SafetyGuidance } from '../../lib/agentic/plan/types.ts';

test('SPLAN-ADV-01/03 PAY-VIEW-03 ingredient advice deduplicates facts but preserves distinct measured scopes and sources in all locales', () => {
  const result = internalFixture(); const first = result.selected!.basket[0];
  const guidance = { code: 'dose_review_required', kind: 'dose_review', action: 'review', severity: 'high', exposure: 150, threshold: 100,
    nutrientName: 'Vitamin D3', supplementIds: ['sup_d3'], productIds: [first.productId], unit: 'mcg', sourceScope: 'total',
    ruleId: 'controlled-reference', rulesVersion: 'unchanged', guidanceId: 'controlled-finding', message: 'Historical full source statement', messageKey: 'fixture', contributors: [],
    authorityUrl: 'https://example.test/reference', evidence: ['Controlled source'], uncertainty: 'Known supplement exposure only' } as SafetyGuidance;
  const otherSource = { ...guidance, authorityUrl: 'https://example.test/second-reference' };
  const otherScope = { ...guidance, sourceScope: 'supplemental' as const, threshold: 80 };
  const interaction = { ...guidance, kind: 'interaction' as const, code: 'medication_interaction' as const, ruleId: 'controlled-interaction', threshold: null };
  const missing = { ...guidance, kind: 'incomplete_information' as const, code: 'incomplete_information' as const, ruleId: 'ul:missing', threshold: null };
  const selected = { ...result.selected!, basket: [{ ...first, requestedNutrients: [{ supplementId: 'sup_d3', name: 'Vitamin D3', amount: 6000, unit: 'IU' as const }], incidentalNutrients: [], labelledFacts: [] }],
    safety: { ...result.selected!.safety, guidance: [guidance, guidance, otherSource, otherScope, interaction, missing] } };
  for (const locale of ['en', 'th', 'zh-CN']) {
    const decision = presentDecision({ ...result, selected, alternatives: [], requestSnapshot: { ...result.requestSnapshot, locale,
      targets: [{ supplementId: 'sup_d3', name: 'Vitamin D3', amount: 2000, unit: 'IU', basis: 'supplemental' }] } }, 'cap_advice_current_fixture_handle', 1);
    assert.ok('choices' in decision); const row = decision.choices[0].ingredients.find(row => row.ingredientId === 'sup_d3'); assert.ok(row?.advice);
    assert.equal(row.advice.length, 5); assert.equal(row.advice.filter(row => row.kind === 'dose_review').length, 3);
    assert.equal(row.advice.find(row => row.kind === 'incomplete_information')?.severity, 'low');
    assert.ok(row.advice.some(row => row.kind === 'interaction')); assert.equal(decision.nextAction, 'confirm_with_user');
    for (const finding of row.advice) { assert.ok([...finding.message].length <= 240); assert.doesNotMatch(finding.message, /\d\.\d{8}/); }
    assert.match(row.advice[0].message, locale === 'th' ? /[ก-๙]/ : locale === 'zh-CN' ? /[\u4e00-\u9fff]/ : /Review/);
  }
});

test("M721-ADVICE-03 explicit missing-reference rule classification does not change other dose or interaction rules", () => {
  assert.equal(adviceKind({ code: "dose_review_required", ruleId: "ul:missing:d3" }), "incomplete_information");
  assert.equal(adviceKind({ code: "dose_review_required", ruleId: "ul:total:d3" }), "dose_review");
  assert.equal(adviceKind({ code: "medication_interaction" }), "interaction");
});
