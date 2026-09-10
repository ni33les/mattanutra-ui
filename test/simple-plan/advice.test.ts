import { adviceKind } from "../../lib/agentic/value/advice-kind.ts";
import assert from 'node:assert/strict';
import test from 'node:test';
import { internalFixture } from '../mcp-conversation-pack/helpers.ts';
import { presentDecision } from '../../lib/agentic/presentation/decision.ts';
import type { SafetyGuidance } from '../../lib/agentic/plan/types.ts';

test('SPLAN-ADV-01/03 PAY-VIEW-03 ingredient advice keeps only distinct exceeded recommended limits in all locales', () => {
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
    assert.equal(row.advice.length, 2); assert.ok(row.advice.every(row => row.kind === 'dose_review'));
    assert.deepEqual(row.advice.map(row => row.reference), [4000, 3200]); assert.equal(decision.nextAction, 'confirm_with_user');
    for (const finding of row.advice) { assert.ok([...finding.message].length <= 240); assert.doesNotMatch(finding.message, /\d\.\d{8}/); }
    assert.match(row.advice[0].message, locale === 'th' ? /[ก-๙]/ : locale === 'zh-CN' ? /[\u4e00-\u9fff]/ : /exceeds the MattaNutra recommended limit/);
  }
});

test("M721-ADVICE-03 explicit missing-reference rule classification does not change other dose or interaction rules", () => {
  assert.equal(adviceKind({ code: "dose_review_required", ruleId: "ul:missing:d3" }), "incomplete_information");
  assert.equal(adviceKind({ code: "dose_review_required", ruleId: "ul:total:d3" }), "dose_review");
  assert.equal(adviceKind({ code: "medication_interaction" }), "interaction");
});

test('SPLAN-ADV-04 live D3 omits product advice while all 19 unknown ingredient facts remain addressable', () => {
  const result = internalFixture(), first = result.selected!.basket[0];
  const facts = Array.from({ length: 19 }, (_, index) => ({ supplementId: `sup_label_${index}`, name: `Label ingredient ${index}`, amount: null, unit: 'mg' as const, confidence: 'low' as const, mappingStatus: 'unverified' as const }));
  const finding = { kind: 'product_data', code: 'unverified_product_facts', severity: 'high', supplementIds: facts.slice(0, 10).map(row => row.supplementId),
    productIds: [first.productId], ruleId: 'labels:unverified', rulesVersion: 'frozen', exposure: null, threshold: null,
    uncertainty: 'Some product quantities or label facts are unverified. Treat reported amounts as provisional; missing physical units, pill counts and supply duration remain unknown. Conflicting nutrient mappings do not establish coverage. Review the label evidence before relying on these amounts.' } as unknown as SafetyGuidance;
  const selected = { ...result.selected!, basket: [{ ...first, labelledFacts: facts }], safety: { ...result.selected!.safety, guidance: [finding, finding] } };
  for (const locale of ['en', 'th', 'zh-CN']) {
    const decision = presentDecision({ ...result, selected, alternatives: [], requestSnapshot: { ...result.requestSnapshot, locale } }, 'cap_live_d3_payload_regression', 1);
    assert.ok('choices' in decision); const choice = decision.choices[0];
    for (const fact of facts) assert.ok(choice.ingredients.some(row => row.ingredientId === fact.supplementId && row.supplied === null));
    assert.equal(choice.ingredients.flatMap(row => row.advice ?? []).length, 0);
    assert.deepEqual(selected.safety.guidance, [finding, finding], 'Presentation never deletes the stored findings');
    assert.ok(Buffer.byteLength(JSON.stringify(decision)) < 20000);
  }
});
