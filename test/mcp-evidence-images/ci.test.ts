import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';

test('QA-CI-01 current CI runs the maintained paired MCP inventory with a compiled candidate',()=>{
  const text=readFileSync('.github/workflows/mcp-722.yml','utf8');
  assert.match(text,/test:matcher:twice/);
  assert.match(text,/npm run build/);
  assert.doesNotMatch(text,/v10 scoped|test:mcp:simple-plan/);
});
test('QA-CI-02 isolated reference fixtures retain captured amounts, scope and confidence',async()=>{
  const {frozenReferenceRows}=await import('../../scripts/seed-matcher-reference-fixtures.mjs');
  const frozen=JSON.parse(gunzipSync(readFileSync('test/fixtures/mcp-evidence-images/dev-20260911.json.gz')).toString());
  const canonical=frozen.snapshot.supplements.filter((row:{name:string})=>['Vitamin D3','Calcium'].includes(row.name));
  assert.equal(canonical.length,2);
  const rows=frozenReferenceRows(frozen,canonical.map((row:{uuid:string;name:string})=>({id:row.uuid,name:row.name})));
  assert.ok(rows.length>0); assert.ok(rows.some((row:{name:string;maxAmount:number;maxUnit:string;sourceScope:string})=>row.name==='Vitamin D3'&&row.maxAmount===100&&row.maxUnit==='mcg'&&row.sourceScope==='total'));
  for(const row of rows){const captured=frozen.references.ceilings.find((item:{bandId:string})=>item.bandId===row.id);assert.ok(captured);assert.equal(row.maxAmount,captured.maxAmount);assert.equal(row.confidence,captured.referenceConfidence);assert.equal(row.sourceScope,captured.sourceScope);assert.equal(row.sourceUrl,captured.authorityUrl);}
  assert.throws(()=>frozenReferenceRows(frozen,[{id:'one',name:'Vitamin D3'},{id:'two',name:'Vitamin D3'}]),/ambiguous/i);
});
