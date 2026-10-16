import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { computeHealthScore } from '../../lib/health-score.ts';
import { waitForHealthScoreCopy } from '../../lib/healthscore-copy-client.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
test('HS-PAR-01 retain actual formula count and deterministic evaluated / set-aside / shortlisted data', () => {
  const score = computeHealthScore({ goals: ['energy'], sex: 'male' }, 'en', { evaluatedIngredientCount: 142, chosenNutrients: 10 });
  assert.deepEqual(score.pageContent!.locked.subtraction, { mode: 'nutrients', evaluated: 142, setAside: 132, chosen: 10 });
  const source = read('components/nutrition-flow/healthscore-panel.tsx');
  assert.match(source, /evaluated: subtraction\.evaluated/);
  assert.match(source, /chosen: subtraction\.chosen/);
  assert.match(source, /localize\(ai\?\.subtractionBody, locale\)/);
  assert.match(source, /data-testid="healthscore-shortlist"/);
});

test('HS-PAR-02 complete advice releases chat/classic/direct HealthScore while formula preparation continues', async t => {
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    reads++;
    return Response.json({ copyReady: true, copyFailed: false, readyForHealthScore: true, healthScorePageFailed: false,
      preparedNutrientCount: null, preparedFormulaFailed: false, readyForReveal: false, formulationStatus: 'pending' });
  });
  const result = await waitForHealthScoreCopy('parallel-fixture', 'en', new AbortController().signal);
  assert.equal(result.status, 'ready'); assert.equal(reads, 1);
  assert.match(read('app/[locale]/nutrition/healthscore/page.tsx'), /readyForHealthScore/);
});

test('HS-PAR-03 formula and product failures do not hide complete HealthScore advice', async t => {
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    reads++;
    return Response.json({ copyReady: true, copyFailed: false, readyForHealthScore: true, healthScorePageFailed: false,
      preparedNutrientCount: null, preparedFormulaFailed: true, readyForReveal: false, failed: true });
  });
  const result = await waitForHealthScoreCopy('failed-reveal-fixture', 'en', new AbortController().signal);
  assert.equal(result.status, 'ready'); assert.equal(reads, 1);
});

test('HS-PAR-04 failed advice still exposes HealthScore recovery even if the formula is complete', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ copyReady: false, copyFailed: true,
    readyForHealthScore: false, healthScorePageFailed: true, preparedNutrientCount: 4, preparedFormulaFailed: false }));
  assert.equal((await waitForHealthScoreCopy('failed-advice-fixture', 'en', new AbortController().signal)).status, 'failed');
});
