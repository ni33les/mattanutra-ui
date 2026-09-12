import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { catalogueCorrectionState, validateCatalogueCorrectionTarget, verifyCatalogueCorrection } from '../../lib/catalogue-corrections.ts';
import type { CatalogueCorrectionManifest } from '../../lib/catalogue-corrections.ts';
const m=JSON.parse(readFileSync('db-rollout/relacza-active-b12-20260912-uat.json','utf8')) as CatalogueCorrectionManifest;
test('GAP-DATA-01 UAT correction changes diluted preparation mass to active B12 without changing any price or reference',()=>{
 assert.equal(m.environment,'uat'); assert.equal(m.corrections.length,1);const c=m.corrections[0]!;verifyCatalogueCorrection(c);
 assert.equal(c.before.amount,1);assert.equal(c.before.unit,'mg');assert.equal(c.after.amount,1);assert.equal(c.after.unit,'mcg');
 assert.equal(c.after.confidence,c.before.confidence);assert.equal(c.before.product_id,c.after.product_id);
 assert.deepEqual(Object.keys(c.before).filter(k=>JSON.stringify(c.before[k])!==JSON.stringify(c.after[k])).sort(),['source_text','source_url','unit']);
 assert.equal(catalogueCorrectionState(c,c.before),'pending');assert.equal(catalogueCorrectionState(c,c.after),'already_applied');
 assert.throws(()=>catalogueCorrectionState(c,{...c.before,amount:2}),/changed since review/);
 assert.match(c.evidence.sourceUrl,/vistra.co.th\/product\/vistra-relacza-plus/);
 assert.throws(()=>validateCatalogueCorrectionTarget(m,'dev','postgresql://test@example.test/mattanutra-dev'),/matching reviewed/);
});
test('GAP-DATA-02 already-correct DEV data agrees with the reviewed UAT result and needs no rewrite',()=>{
 const dev=JSON.parse(readFileSync('test/matcher-gap-repair/dev-preserved-fact.json','utf8'));
 assert.deepEqual(m.corrections[0]!.after,dev);
});
