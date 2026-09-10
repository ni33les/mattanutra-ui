import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { recommendWithMatcher } from '../../lib/matcher/adapters/web.ts';
import { resetMatcherSafetyCeilings, setMatcherSafetyCeilings } from '../../lib/matcher/safety-ceilings.ts';

const manifest = JSON.parse(readFileSync(new URL('./fixtures/manifest.json', import.meta.url), 'utf8'));
const frozen = JSON.parse(readFileSync(new URL('./fixtures/reported-web-plan.json', import.meta.url), 'utf8'));
const context = JSON.parse(readFileSync(new URL('./fixtures/reported-client-context.json', import.meta.url), 'utf8'));

test('PRACTICAL-REPORTED-01 historical prices, unknown pills and 625 labelled servings remain immutable evidence', () => {
  for (const row of manifest.files) assert.equal(createHash('sha256').update(readFileSync(row.file)).digest('hex'), row.sha256);
  assert.equal(manifest.environment, 'dev'); assert.equal(frozen.snapshot.products.length, 154);
  const selected = frozen.runs[0].diagnostics.matching.options.find(row => row.optionId === frozen.runs[0].diagnostics.matching.selectedOptionId);
  assert.ok(selected); assert.equal(selected.dailyPills, null); assert.equal(selected.priceMinor, 507900);
  assert.equal(selected.productIds.length, 10); assert.ok(selected.dailyServings.includes(625));
});

test('PRACTICAL-REPORTED-02 the strong web profile selects lower overall burden on the frozen reported inputs', () => {
  setMatcherSafetyCeilings(frozen.ceilings);
  try {
    const result = recommendWithMatcher({ needs: frozen.runs[0].client_needs, candidates: frozen.snapshot.products.map(row => row.candidate),
      ...context, stackPreference: 'balanced', countryCode: 'TH', catalogueFingerprint: frozen.snapshot.catalogueVersion });
    const matching = result.diagnostics.matching;
    assert.ok(matching && matching.options.length > 1);
    const selected = matching.options.find(row => row.optionId === matching.selectedOptionId);
    assert.ok(selected?.overallScore && selected.productIds.length > 0);
    assert.equal(selected.overallScore.profile.importance.maxDailyPills, 'strong');
    assert.ok(selected.overallScore.preferences.maxDailyPills.actualLowerBound < 16);
    // The 625-serving line alone costs 0.05*(625-1)^2 = 19468.8.
    assert.ok(selected.overallScore.overallPenalty < 19468.8);
    assert.ok(selected.dailyServings.every(n => n < 625));
    for (const option of matching.options) {
      assert.ok(option.overallScore);
      assert.ok(selected.overallScore.overallPenalty <= option.overallScore.overallPenalty);
    }
    assert.ok(matching.searchSummary!.expansionAttempts <= 8000);
  } finally { resetMatcherSafetyCeilings(); }
});
