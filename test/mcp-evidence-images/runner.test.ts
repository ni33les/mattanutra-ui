import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runMatcherBatches} from '../../scripts/run-matcher-test-suite.mjs';
import {normalizePublishedClientResult} from '../../scripts/published-client-semantics.mjs';

test('QA-01 complete MCP runs use separate initial database instances and separate semantic evidence',async()=>{
  const evidence=mkdtempSync(join(tmpdir(),'mcp-independent-runs-')),seen:Array<{label:string;db:string;output:string}>=[];
  const environments={a:{TEST_DB_URL:'postgresql://localhost/frozen_a',DB_URL:'postgresql://localhost/frozen_a',DB_WORKER_URL:'postgresql://localhost/frozen_a',MCP_EVIDENCE_IMAGES_OUTPUT:join(evidence,'semantic-a')},b:{TEST_DB_URL:'postgresql://localhost/frozen_b',DB_URL:'postgresql://localhost/frozen_b',DB_WORKER_URL:'postgresql://localhost/frozen_b',MCP_EVIDENCE_IMAGES_OUTPUT:join(evidence,'semantic-b')}};
  try{
    await runMatcherBatches({common:{TEST_DB_URL:'template'},environments,evidence,inventory:{files:['test/a.test.ts','test/b.integration.test.ts'],integration:['test/b.integration.test.ts']},args:['--test'],runs:['a','b'],
      start:async(env:typeof environments.a)=>{assert.ok([environments.a.DB_URL,environments.b.DB_URL].includes(env.DB_URL));return {identity:{origin:'http://127.0.0.1:3100'},stop:async()=>{}};},
      batch:async(label:string,_args:unknown,env:typeof environments.a)=>{seen.push({label,db:env.DB_URL,output:env.MCP_EVIDENCE_IMAGES_OUTPUT});return {passed:true};}});
    assert.deepEqual(seen.map(r=>r.db),[environments.a.DB_URL,environments.a.DB_URL,environments.b.DB_URL,environments.b.DB_URL]);
    assert.deepEqual(seen.map(r=>r.output),[environments.a.MCP_EVIDENCE_IMAGES_OUTPUT,environments.a.MCP_EVIDENCE_IMAGES_OUTPUT,environments.b.MCP_EVIDENCE_IMAGES_OUTPUT,environments.b.MCP_EVIDENCE_IMAGES_OUTPUT]);
  }finally{rmSync(evidence,{recursive:true,force:true});}
});
test('QA-01 canonical equality preserves exact image URLs, nulls and product associations',()=>{
  const a={products:[{productId:'recorded-product',imageUrl:'https://cdn.example/image-a.webp'}]};
  for(const imageUrl of ['https://cdn.example/image-b.webp',null])assert.notDeepEqual(normalizePublishedClientResult(a),normalizePublishedClientResult({products:[{...a.products[0],imageUrl}]}));
});
