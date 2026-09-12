import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { fixtureSnapshot } from '../../lib/agentic/catalogue/fixtures.ts';
import { replaceCatalogueSnapshot } from '../../lib/agentic/catalogue/snapshot.ts';
import { rpc, rpcWithTaskExecutor, runtime, uninstallRealCatalogue } from '../ax-refinement/helpers.ts';

beforeEach(()=>replaceCatalogueSnapshot(fixtureSnapshot()));afterEach(uninstallRealCatalogue);
test('AVAIL-MCP-06 mixed proposals, replay and refinement retain original omissions in all locales',async()=>{
  for(const locale of ['en','th','zh-CN']){
    const app=runtime(`availability-${locale}`);
    const input={locale,destinationCountry:'TH',idempotencyKey:`availability-create-${locale}`,targets:[{name:'D3',amount:2000,unit:'IU'},
      {name:'Unlisted example ingredient',amount:50,unit:'mg'}],requirements:{productDoses:[{productId:'prd_missing',servingsPerDay:1}]}};
    const admitted=await rpc(app,'plan',input);assert.equal(admitted.status,'processing');
    const first=await rpcWithTaskExecutor(app,'plan',input);assert.equal(first.ok,true,JSON.stringify(first));assert.equal(first.status,'ready');
    const choices=first.choices as Array<{ingredients:Array<{ingredientId:string;availability:string}>;products:unknown[]}>;
    assert.equal(choices.length,1);assert.ok(choices[0].products.length);
    const unknown=choices[0].ingredients.find(row=>row.availability==='not_on_list');assert.ok(unknown);
    const issues=first.requestIssues as Array<{itemId:string;code:string;message:string}>;assert.ok(issues.some(row=>row.itemId==='prd_missing'));
    assert.ok(issues.every(row=>row.message.length>0));
    const replay=await rpc(app,'plan',input);assert.equal(replay.revision,first.revision);assert.deepEqual(replay.requestIssues,issues);
    const change={planHandle:first.planHandle,expectedRevision:first.revision,idempotencyKey:`availability-refine-${locale}`,scoring:{weights:{price:2}}};
    const pending=await rpc(app,'plan',change);assert.equal(pending.revision,2);
    const polled=await rpc(app,'plan',{planHandle:first.planHandle});assert.equal(polled.revision,2);
    const revised=await rpcWithTaskExecutor(app,'plan',change);assert.equal(revised.status,'ready',JSON.stringify(revised));
    assert.deepEqual(revised.requestIssues,issues);assert.equal(revised.revision,2);
  }
});
test('AVAIL-MCP-07 entirely unavailable request terminates without purchase or polling loop',async()=>{
  replaceCatalogueSnapshot({...fixtureSnapshot(),products:[]});const app=runtime('availability-empty');
  const result=await rpcWithTaskExecutor(app,'plan',{locale:'en',destinationCountry:'TH',idempotencyKey:'availability-entire-empty',targets:[{name:'D3',amount:2000,unit:'IU'}]});
  assert.equal(result.ok,true,JSON.stringify(result));assert.notEqual(result.status,'processing');assert.notEqual(result.nextAction,'execute');
  assert.ok((result.requestIssues as Array<{code:string}>).some(row=>row.code==='unavailable'));
  assert.deepEqual((await rpc(app,'plan',{planHandle:result.planHandle})).requestIssues,result.requestIssues);
});
