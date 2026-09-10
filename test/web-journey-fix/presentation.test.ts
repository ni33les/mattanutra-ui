import assert from 'node:assert/strict';
import test from 'node:test';
import { computeHealthScore } from '../../lib/health-score.ts';
import frozen from './fixtures/reported.json' with { type: 'json' };

test('WEB-JOURNEY-01 unknown formula has no invented shortlist or rejection count', () => {
  const result = computeHealthScore(frozen.healthAnswers, 'en');
  assert.equal(result.score, 38);
  assert.equal(result.pageContent?.locked.nutrientsChosen, null);
  assert.equal(result.pageContent?.locked.subtraction.setAside, null);
});

test('WEB-JOURNEY-02 HealthScore uses actual formula count in every locale without changing score', () => {
  for (const locale of ['en', 'th', 'zh-CN'] as const) {
    // The option is new: the RED control ignores it and invents eight.
    const result = computeHealthScore(frozen.healthAnswers, locale, { chosenNutrients: 10 } as Parameters<typeof computeHealthScore>[2]);
    assert.equal(result.score, 38);
    assert.equal(result.pageContent?.locked.nutrientsChosen, 10);
    assert.equal(result.pageContent?.locked.subtraction.chosen, 10);
  }
});
