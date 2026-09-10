import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { computeHealthScore } from '../../lib/health-score.ts';
import { waitForHealthScoreCopy } from '../../lib/healthscore-copy-client.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
test('HS-PAR-01 retain evaluated / set-aside / shortlisted layout with the actual formula count', () => {
  const score = computeHealthScore({ goals: ['energy'], sex: 'male' }, 'en', { evaluatedIngredientCount: 142, chosenNutrients: 10 });
  assert.deepEqual(score.pageContent!.locked.subtraction, { mode: 'nutrients', evaluated: 142, setAside: 132, chosen: 10 });
  const source = read('components/nutrition-flow/healthscore-panel.tsx');
  assert.match(source, /subtraction\.evaluated,[\s\S]*subtraction\.setAside,[\s\S]*subtraction\.chosen/);
  assert.match(source, /localize\(ai\?\.subtractionBody, locale\)/);
  assert.match(read('components/nutrition-flow/healthscore-panel-copy.ts'), /subtractionEyebrow: "How your formula was built"/);
});

test('HS-PAR-02 advice alone cannot release chat/classic/direct HealthScore polling', async t => {
  const states = [
    { copyReady: true, copyFailed: false, readyForHealthScore: false, healthScorePageFailed: false },
    { copyReady: true, copyFailed: false, readyForHealthScore: true, healthScorePageFailed: false }
  ];
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async () => Response.json(states[Math.min(reads++, 1)]));
  const result = await waitForHealthScoreCopy('parallel-fixture', 'en', new AbortController().signal);
  assert.equal(result.status, 'ready'); assert.equal(reads, 2);
  assert.match(read('app/[locale]/nutrition/healthscore/page.tsx'), /readyForHealthScore/);
});

test('HS-PAR-03 a failed reveal preparation exposes recovery even when advice is complete', async t => {
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async () => Response.json(++reads === 1
    ? { copyReady: true, copyFailed: false, readyForHealthScore: false, healthScorePageFailed: true }
    : { copyReady: false, copyFailed: true, readyForHealthScore: false, healthScorePageFailed: true }));
  const result = await waitForHealthScoreCopy('failed-reveal-fixture', 'en', new AbortController().signal);
  assert.equal(result.status, 'failed'); assert.equal(reads, 1);
});
