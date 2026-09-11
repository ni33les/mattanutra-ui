import assert from 'node:assert/strict';
import test,{beforeEach,afterEach} from 'node:test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleJsonRpc } from '../../lib/agentic/mcp/dispatcher.ts';
import { toolList, toolResult } from '../../lib/agentic/mcp/rpc.ts';
import { CLIENT_EXAMPLES, CONTRACT_RESOURCES, clientGuideMarkdown, publicContractBundle } from '../../lib/agentic/contract/guide.ts';
import { AGENTIC_OUTPUT_SCHEMAS, validateToolIssues } from '../../lib/agentic/contract/index.ts';
import { toCatalogueProduct } from '../../lib/agentic/catalogue/live.ts';
import { buildContributionIndex } from '../../lib/agentic/catalogue/live-supplements.ts';
import { normalizePublishedClientResult } from '../../scripts/published-client-semantics.mjs';
import { withServiceMeasurements, serviceMeasurements } from '../../lib/service-metrics.ts';
import { presentDecision } from '../../lib/agentic/presentation/decision.ts';
import { internalFixture } from '../mcp-conversation-pack/helpers.ts';
import { create, requirements, frozen, manifest, install, cleanup, runtime, plan, rpc } from './helpers.ts';
const tools=['info','plan','execute','order','support','feedback'];
beforeEach(install);afterEach(cleanup);

test('EV-01 initialization, discovery, resources and examples expose exactly six retained tools',async()=>{
  const app=runtime();assert.deepEqual(toolList().map(t=>t.name),tools);
  const init=await handleJsonRpc(app,{id:1,method:'initialize',params:{}});assert.ok(init?.result);
  assert.doesNotMatch(String(init.result.instructions),/feedback, evidence|\bevidence (?:tool|calls?)\b/i);
  assert.deepEqual(Object.keys(publicContractBundle().tools),tools);
  for(const locale of ['en','th','zh-CN']) {
    const info=await rpc(app,'info',{locale,view:'client_guide'});assert.ok(info?.result?.structuredContent);
    assert.doesNotMatch(clientGuideMarkdown(locale),/"tool":\s*"evidence"|Narrow evidence calls|Tools:.*\bevidence\b/);
  }
  for(const resource of CONTRACT_RESOURCES){const read=await handleJsonRpc(app,{id:1,method:'resources/read',params:{uri:resource.uri}});assert.ok(read?.result);}
  assert.ok(CLIENT_EXAMPLES.length>0);assert.ok(CLIENT_EXAMPLES.every(e=>tools.includes(e.tool)));
});
test('EV-02 removed evidence and a fixed unknown tool return the same unknown-tool envelope without store access',async()=>{
  const app=runtime();let calls=0;
  const store=new Proxy(app.store,{get(target,key){const value=Reflect.get(target,key);return typeof value==='function'?()=>{calls++;throw Error('Unknown tool must not access plan/order storage');}:value;}});
  for(const name of ['evidence','ev_nonexistent_control']) {
    const result=await rpc({...app,store},name,{planHandle:'cap_removed_tool_fixture_000000000001',expectedRevision:1,optionId:'opt_returned_fixture',productId:manifest.fixtures[0].productId});
    assert.deepEqual(result,{jsonrpc:'2.0',id:1,error:{code:-32601,message:`Unknown tool: ${name}`}});
  }
  assert.equal(calls,0);
});
test('EV-03 pinned product versions, composition and internal catalogue validation remain intact',()=>{
  const before=JSON.stringify(frozen);const index=buildContributionIndex(frozen.snapshot.supplements);
  for(const fixture of manifest.fixtures){const p=frozen.snapshot.products.find(p=>p.productId===fixture.productId);assert.ok(p);
    assert.equal(frozen.versions.find(v=>`prd_${v.product_id.replaceAll('-','')}`===p.productId)?.version,fixture.productVersion);
    assert.equal(p.candidate.imageUrl,fixture.imageUrl);assert.deepEqual(p.candidate.facts,fixture.composition);assert.deepEqual(p.candidate.administration,fixture.administration);
    assert.ok(toCatalogueProduct(p.candidate,frozen.snapshot.supplements,index));
  }
  assert.equal(JSON.stringify(frozen),before);
});
test('EV-04 / IMG-01 / IMG-03 / IMG-05 / AX-01 real-product create, refine, select and read retain facts, images and delivery equality',async t=>{
  const app=runtime();let imageRequests=0;t.mock.method(globalThis,'fetch',async()=>{imageRequests++;throw Error('No outbound image/manufacturer validation is allowed');});
  const first=await plan(app,create());assert.equal(first.status,'ready');assert.equal(first.revision,1);
  function check(value:typeof first,index:number){const fixture=manifest.fixtures[index];assert.equal(value.choices.length,1);const products=value.choices[0].products;assert.equal(products.length,1);
    assert.equal(products[0].productId,fixture.productId);assert.equal(products[0].imageUrl,fixture.imageUrl);assert.match(products[0].imageUrl!,/^https:\/\//);
    assert.equal(products[0].servingsPerDay,fixture.servingsPerDay);assert.equal(products[0].unitPrice,fixture.unitPriceMinor/100);assert.equal(products[0].lineTotal,products[0].quantity*fixture.unitPriceMinor/100);
    const target=value.choices[0].ingredients.find(i=>i.requested!==null);assert.ok(target);assert.equal(target.requested,1000);assert.equal(target.supplied,1000);assert.equal(target.gap,0);
    assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan,value),[]);
  }
  check(first,0);
  const revised=await plan(app,{planHandle:first.planHandle,expectedRevision:1,idempotencyKey:'ev-images-refine',requirements:requirements(1)});assert.equal(revised.revision,2);check(revised,1);
  const selected=await plan(app,{planHandle:first.planHandle,expectedRevision:2,idempotencyKey:'ev-images-select',selectedOptionId:revised.recommendedOptionId});assert.equal(selected.revision,3);check(selected,1);
  const read=await withServiceMeasurements(async()=>{const read=await plan(app,{planHandle:first.planHandle});assert.equal(serviceMeasurements()['db.statements']?.total??0,0,'Stored image delivery must not add database metadata queries');return read;});
  assert.deepEqual(read,selected);assert.equal(read.nextAction,'execute');
  const structured=toolResult(read,false,'plan','structured'),text=toolResult(read,false,'plan','text');
  assert.deepEqual(JSON.parse((text.content as Array<{text:string}>)[0].text),structured.structuredContent);
  assert.equal(imageRequests,0);
  const out=process.env.MCP_EVIDENCE_IMAGES_OUTPUT;if(out){mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'real-plan-journey.json'),JSON.stringify(normalizePublishedClientResult({first,revised,selected,read}),null,2),{flag:'wx'});}
});
test('IMG-04 retained real stock avoids a new product or image-only placeholder',async()=>{
  const app=runtime(),request=create();const ingredient=frozen.snapshot.supplements.find(s=>s.name==='Vitamin D3');assert.ok(ingredient);
  const result=await plan(app,{...request,idempotencyKey:'ev-images-stock-01',requirements:{},currentSupplements:[{name:'Vitamin D3',supplementId:ingredient.supplementId,productId:manifest.fixtures[0].productId,dailyAmount:1000,daysRemaining:30,unit:'IU'}]});
  assert.equal(result.status,'no_purchase');assert.ok(result.choices.every(c=>c.products.length===0));assert.equal(result.recommendedOptionId,null);
});
test('IMG-02 coverage availability is explicit; no missing-image real retail SKU is fabricated',()=>{
  assert.equal(manifest.missingImageCoverage.status,'REAL_DATA_UNAVAILABLE');assert.ok(manifest.missingImageCoverage.missingProductCount>0);
  assert.ok(frozen.snapshot.products.length>0);assert.ok(frozen.snapshot.products.every(p=>Boolean(p.candidate.imageUrl)));
});
test('IMG-NULL-DTO missing image serializes as null without extra products or questions (presentation-only, not a real missing-image matching claim)',()=>{
  const result=internalFixture();assert.ok(result.selected?.basket.length);
  const original=presentDecision(result,'cap_null_image_presentation_only',1);
  const cleared=structuredClone(result);for(const row of cleared.selected!.basket)row.imageUrl=null;
  const decision=presentDecision(cleared,'cap_null_image_presentation_only',1);
  assert.ok('choices' in decision&&'choices' in original);assert.ok(decision.choices.length);
  assert.deepEqual(decision.questions,original.questions);assert.equal(decision.choices[0].products.length,original.choices[0].products.length);
  assert.ok(decision.choices[0].products.every(p=>Object.hasOwn(p,'imageUrl')&&p.imageUrl===null));
  assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.plan,decision),[]);
});
