import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { catalogueCorrectionState, type CatalogueCorrectionManifest } from '../../lib/catalogue-corrections.ts';
import frozen from './fixtures/reported.json' with { type: 'json' };

test('WEB-JOURNEY-03 reviewed Relacza correction uses active B12 micrograms and preserves identity/confidence', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../data/catalogue-corrections/web-journey-dev.json', import.meta.url), 'utf8')) as CatalogueCorrectionManifest;
  assert.equal(manifest.environment, 'dev'); assert.equal(manifest.corrections.length, 1);
  const correction = manifest.corrections[0];
  assert.equal(catalogueCorrectionState(correction, frozen.factBefore), 'pending');
  assert.equal(catalogueCorrectionState(correction, correction.after), 'already_applied');
  assert.equal(correction.after.amount, 1); assert.equal(correction.after.unit, 'mcg');
  assert.equal(correction.after.confidence, frozen.factBefore.confidence);
  assert.equal(correction.after.product_id, frozen.factBefore.product_id);
  assert.match(correction.evidence.sourceUrl, /vistra\.co\.th\/product\/vistra-relacza-plus/);
  assert.throws(() => catalogueCorrectionState(correction, { ...frozen.factBefore, amount: 2 }), /changed since review/);
});
