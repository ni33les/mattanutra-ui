import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as adviceModule from '../../lib/web-health-advice.ts';
import * as components from '../../components/web-health-advice.tsx';
import { assessPreferences } from '../../lib/matcher/preferences.ts';

const limit = (ingredient = 'D3', amount = 125) => adviceModule.webHealthAdvice({ code: 'reference_limit_exceeded', kind: 'limit', ingredient, amount, unit: 'mcg', limit: { amount: 100, unit: 'mcg' }, evidence: `reference:${ingredient}` });
const interaction = adviceModule.webHealthAdvice({ code: 'medication_interaction', kind: 'context', ingredient: 'Omega-3', evidence: 'omega3+anticoagulant' });
const target = adviceModule.webHealthAdvice({ code: 'target_exceeded', kind: 'target', ingredient: 'D3', amount: 80, referenceDose: { amount: 50, unit: 'mcg', basis: 'agreed_target' } });
const unknown = adviceModule.webHealthAdvice({ code: 'intake_unknown', kind: 'unknown', ingredient: 'D3' });
const input = [limit(), limit(), limit('Calcium', 2700), interaction, interaction, target, unknown];

test('PRACTICAL-WEB-01 selected cautions deduplicate without losing distinct interactions or measured limits', () => {
  assert.equal(typeof adviceModule.partitionWebMatchingAdvice, 'function');
  const value = adviceModule.partitionWebMatchingAdvice(input);
  assert.deepEqual(value.medical.map(row => [row.code, row.ingredient]), [['reference_limit_exceeded', 'D3'], ['reference_limit_exceeded', 'Calcium'], ['medication_interaction', 'Omega-3']]);
  assert.equal(value.details.length, 2);
  const noMeasuredLimit = { ...limit(), referenceLimit: null };
  assert.equal(adviceModule.partitionWebMatchingAdvice([noMeasuredLimit]).medical.length, 0);
  assert.equal(input.length, 7);
});

for (const locale of ['en', 'th', 'zh-CN'] as const) test(`PRACTICAL-WEB-02 ${locale} selected advice is concise with complete findings behind details`, () => {
  assert.equal(typeof components.WebMatchingAdvice, 'function');
  const html = renderToStaticMarkup(createElement(components.WebMatchingAdvice, { advice: input, locale, selected: true }));
  const visible = html.split('<details')[0];
  assert.match(visible, /data-testid="medical-cautions"/); assert.match(visible, /Omega-3/);
  assert.doesNotMatch(visible, /data-advice-code="(?:target_exceeded|intake_unknown)"/);
  assert.match(html, /<details/); assert.doesNotMatch(html, /<details[^>]*open/);
  assert.match(html, /data-advice-code="target_exceeded"/);
  assert.match(html, /data-advice-code="intake_unknown"/);
  assert.doesNotMatch(html, /type="checkbox"|required=/);
});

test('PRACTICAL-WEB-03 another option shows its own cautions before ordinary confirmation', () => {
  assert.equal(typeof components.WebMatchingAdvice, 'function');
  const alternative = renderToStaticMarkup(createElement(components.WebMatchingAdvice, { advice: [interaction], locale: 'en', selected: false }));
  assert.doesNotMatch(alternative.split('<details')[0], /Omega-3/);
  const selected = renderToStaticMarkup(createElement(components.WebMatchingAdvice, { advice: [interaction], locale: 'en', selected: true }));
  assert.match(selected.split('<details')[0], /Omega-3/); assert.doesNotMatch(selected, /Calcium/);
});

test('PRACTICAL-WEB-04 routine totals preserve verified lower bounds instead of showing unknown as zero', () => {
  const html = renderToStaticMarkup(createElement(components.WebMatchingPillCount, { count: null, lowerBound: 16, locale: 'en' }));
  assert.match(html, /at least 16/i); assert.match(html, /unknown/i); assert.doesNotMatch(html, /count: 0/);
});

test('PRACTICAL-WEB-05 monthly preferences display THB values without changing the input basis', () => {
  const preferences = assessPreferences({ maxPriceMinor: 100000, pricePreferenceBasis: 'monthly_30_days' }, { productCount: 1, dailyPills: 1, goodsPriceMinor: 60000, monthlyGoodsPriceMinor: 120000, currency: 'THB' });
  const html = renderToStaticMarkup(createElement(components.WebPreferenceAdvice, { preferences, locale: 'en' }));
  assert.match(html, /30.day|monthly/i); assert.match(html, /1200|1,200/); assert.doesNotMatch(html, /120000|120,000/);
});
