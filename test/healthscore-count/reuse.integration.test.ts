import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {captureAssessment,retryAssessmentHealthScore} from '../../lib/assessment-capture.ts';
import {getSql,closeSqlPool} from '../../lib/db.ts';
import {FUNNEL_GENERATOR_VERSION,getRevisionFormulationNutrientCount,loadGenerationInput} from '../../lib/assessment-revisions.ts';
import {createStripeCheckoutSession,completeMockPayment} from '../../lib/stripe-payments.ts';
import {fulfillWebPayment} from '../../lib/web-payment-fulfillment.ts';
import {completeHealthScoreFixture} from '../fixtures/healthscore.ts';
import {stableHash} from '../../lib/task-enqueue-helpers.ts';
import {effectiveQuestionnaireAnswers} from '../../lib/web-purchase-preferences.ts';
assert.ok(process.env.TEST_DB_URL,'Isolated PostgreSQL is required');
const url=new URL(process.env.TEST_DB_URL);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/mattanutra_lock_review_/);
const sql=getSql()!;after(closeSqlPool);
const answers={firstName:'Count fixture',age:'36-45',sex:'male',goals:['energy']};
const ids=['vitamin-d3','omega-3','magnesium','vitamin-b12','coq10','creatine','vitamin-c','zinc','l-carnitine','selenium'];
async function prepared(locale:'en'|'th'|'zh-CN'='en') {
  const receipt=await captureAssessment({answers,locale},{idempotencyKey:randomUUID()});const id=receipt.planId;
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result) values(${id}::uuid,1,${locale},${FUNNEL_GENERATOR_VERSION},${sql.json(completeHealthScoreFixture(locale))})`;
  const tasks=await formulaTasks(id);assert.equal(tasks.length,1,'Capture must create one real formulation task');
  const generation=await loadGenerationInput(sql,id,locale);assert.ok(generation);
  assert.equal(tasks[0].payload.generation.inputHash,generation.inputHash);
  assert.equal(tasks[0].payload.generation.revision,1);assert.equal(tasks[0].payload.generation.locale,locale);
  assert.equal(tasks[0].payload.generation.generatorVersion,FUNNEL_GENERATOR_VERSION);
  await sql`insert into formulations(plan_id,version,assessment_revision,generation_locale,generator_version,formulation) values(${id}::uuid,1,1,${locale},${FUNNEL_GENERATOR_VERSION},${sql.json({supplementBreakdown:ids.map(id=>({id}))})})`;
  await sql`update tasks set status='completed',completed_at=now() where plan_id=${id}::uuid`;
  return receipt;
}
const formulaTasks=(id:string)=>sql`select id,status,payload from tasks where plan_id=${id}::uuid and task_type='generate_supplement_guidance' order by created_at`;

test('HS-COUNT-01 completed ten-ingredient formula survives concurrent retries and checkout/fulfillment without another generation',async()=>{
  const receipt=await prepared(),id=receipt.planId,before=await formulaTasks(id);
  assert.equal(before.length,1);assert.equal(await getRevisionFormulationNutrientCount(id,'en',1),10);
  await Promise.all(Array.from({length:3},()=>retryAssessmentHealthScore(id,'en')));
  assert.deepEqual(await formulaTasks(id),before,'A retry must not replace a completed formula');
  const session=await createStripeCheckoutSession({planId:id,locale:'en',selectedPlan:'precision',sourceSurface:'healthscore',idempotencyKey:randomUUID()});
  assert.deepEqual(await formulaTasks(id),before,'Checkout must adopt the prepared formula');
  await completeMockPayment({paymentId:session.paymentId});
  await fulfillWebPayment(session.paymentId,{session:async()=>null,rate:async()=>({currency:'THB',fallbackUsed:false,fxRateId:null,provider:'fixture',source:'fixture',usdRate:0.03})});
  await retryAssessmentHealthScore(id,'en');
  assert.deepEqual(await formulaTasks(id),before,'Paid access and further reads/retries must preserve the same formula');
  assert.equal(await getRevisionFormulationNutrientCount(id,'en',1),10);
  assert.equal((await sql`select count(*)::int as n from formulations where plan_id=${id}::uuid`)[0].n,1);
  assert.equal((await sql`select fulfillment_status from payments where id=${session.paymentId}::uuid`)[0].fulfillment_status,'complete');
});
test('HS-COUNT-02 completed task with missing output remains recoverable',async()=>{
  const receipt=await prepared();await sql`delete from formulations where plan_id=${receipt.planId}::uuid`;
  await retryAssessmentHealthScore(receipt.planId,'en');
  const rows=await formulaTasks(receipt.planId);assert.equal(rows.length,2);assert.equal(rows[1].status,'queued');
});
for(const locale of ['en','th','zh-CN'] as const)test(`HS-COUNT-03 ${locale} reuses its formula but changed answers require a new revision`,async()=>{
  const receipt=await prepared(locale),before=await formulaTasks(receipt.planId);
  await retryAssessmentHealthScore(receipt.planId,locale);assert.deepEqual(await formulaTasks(receipt.planId),before);
  const changed=await captureAssessment({answers:{...answers,goals:['sleep']},locale,expectedRevision:1},{planId:receipt.planId,idempotencyKey:randomUUID()});
  assert.equal(changed.revision,2);assert.equal(await getRevisionFormulationNutrientCount(receipt.planId,locale,2),null);
  assert.equal((await formulaTasks(receipt.planId)).filter(t=>t.payload.generation.revision===2&&t.status==='queued').length,1);
});


test('HS-COUNT-04 omitted web purchase fields do not make the completed current formula stale',async()=>{
  const receipt=await prepared(),id=receipt.planId,before=await formulaTasks(id);
  const generation=await loadGenerationInput(sql,id,'en');assert.ok(generation);
  assert.equal(before[0].status,'completed');assert.equal(before[0].payload.generation.inputHash,generation.inputHash);
  assert.deepEqual(Object.keys(before[0].payload.answers).filter(key=>!(key in generation.answers)).sort(),['budget','form','maxPills']);
  assert.deepEqual(effectiveQuestionnaireAnswers(before[0].payload.answers),generation.answers);
  assert.notEqual(before[0].payload.inputHash,stableHash({answers:generation.answers,locale:'en'}),'Exercise the actual capture/retry representation drift');
  const formulas=await sql`select to_jsonb(f) as row from formulations f where plan_id=${id}::uuid`;
  assert.equal(formulas.length,1);assert.equal(formulas[0].row.assessment_revision,generation.revision);assert.equal(formulas[0].row.generation_locale,generation.locale);assert.equal(formulas[0].row.generator_version,generation.generatorVersion);
  await retryAssessmentHealthScore(id,'en');
  assert.deepEqual(await formulaTasks(id),before);
  assert.deepEqual(await sql`select to_jsonb(f) as row from formulations f where plan_id=${id}::uuid`,formulas);
});

for(const [field,value] of [['inputHash','changed-health-input'],['revision',2],['locale','th'],['generatorVersion','obsolete-generator']] as const)
  test(`HS-COUNT-05 mismatched completed ${field} cannot prove current formulation readiness`,async()=>{
    const receipt=await prepared(),id=receipt.planId,before=await formulaTasks(id);
    const generation=await loadGenerationInput(sql,id,'en');assert.ok(generation);
    const payload={...before[0].payload,inputHash:stableHash({answers:generation.answers,locale:'en'}),generation:{...before[0].payload.generation,[field]:value}};
    await sql`update tasks set payload=${sql.json(payload)} where id=${before[0].id}::uuid`;
    await retryAssessmentHealthScore(id,'en');
    const after=await formulaTasks(id);assert.equal(after.length,2,'Conflicting generation provenance requires recoverable work');
    assert.equal(after[0].status,'completed');assert.equal(after[1].status,'queued');
    assert.deepEqual(after[1].payload.generation,generation);
    assert.equal(await getRevisionFormulationNutrientCount(id,'en',1),10,'Do not rewrite the last stored formula while recovery is queued');
  });

test('HS-COUNT-06 legacy completed task without a generation envelope retains exact-input reuse',async()=>{
  const receipt=await prepared(),id=receipt.planId,original=(await formulaTasks(id))[0];
  const generation=await loadGenerationInput(sql,id,'en');assert.ok(generation);
  const payload={...original.payload,inputHash:stableHash({answers:generation.answers,locale:'en'})};delete payload.generation;
  await sql`update tasks set payload=${sql.json(payload)} where id=${original.id}::uuid`;
  const before=await formulaTasks(id);assert.equal(before[0].status,'completed');
  await retryAssessmentHealthScore(id,'en');assert.deepEqual(await formulaTasks(id),before);
});


test('HS-COUNT-07 concurrent pending retries reuse the admitted current formula task',async()=>{
  const receipt=await captureAssessment({answers,locale:'en'},{idempotencyKey:randomUUID()}),id=receipt.planId;
  const before=await formulaTasks(id);assert.equal(before.length,1);assert.equal(before[0].status,'queued');
  assert.equal(await getRevisionFormulationNutrientCount(id,'en',1),null,'There is no completed output to mask active-task reuse');
  const generation=await loadGenerationInput(sql,id,'en');assert.ok(generation);
  assert.equal(before[0].payload.generation.inputHash,generation.inputHash);
  assert.notEqual(before[0].payload.inputHash,stableHash({answers:generation.answers,locale:'en'}));
  await Promise.all(Array.from({length:3},()=>retryAssessmentHealthScore(id,'en')));
  assert.deepEqual(await formulaTasks(id),before,'Retry must observe the same queued calculation, not another same-revision formula');
});

test('HS-COUNT-08 an active task with conflicting health input cannot satisfy a retry by body hash alone',async()=>{
  const receipt=await captureAssessment({answers,locale:'en'},{idempotencyKey:randomUUID()}),id=receipt.planId;
  const before=await formulaTasks(id);assert.equal(before.length,1);assert.equal(before[0].status,'queued');
  const generation=await loadGenerationInput(sql,id,'en');assert.ok(generation);
  const payload={...before[0].payload,inputHash:stableHash({answers:generation.answers,locale:'en'}),generation:{...before[0].payload.generation,inputHash:'different-health-input'}};
  await sql`update tasks set payload=${sql.json(payload)} where id=${before[0].id}::uuid`;
  await retryAssessmentHealthScore(id,'en');
  const after=await formulaTasks(id);assert.equal(after.length,2);assert.equal(after[1].status,'queued');
  assert.deepEqual(after[1].payload.generation,generation);
});


for(const completed of [true,false])test(`HS-COUNT-09 ${completed?'completed':'pending'} current work on a legacy assessment resolves its nullable stored hash`,async()=>{
  const receipt=completed?await prepared():await captureAssessment({answers,locale:'en'},{idempotencyKey:randomUUID()}),id=receipt.planId;
  await sql`update assessments set input_hash=null where plan_id=${id}::uuid`;
  const generation=await loadGenerationInput(sql,id,'en');assert.ok(generation);
  const original=(await formulaTasks(id))[0];assert.equal(original.status,completed?'completed':'queued');
  // Current work admitted on a legacy assessment carries the resolved canonical
  // generation identity, although that assessment has no persisted input hash.
  await sql`update tasks set payload=${sql.json({...original.payload,generation})} where id=${original.id}::uuid`;
  const before=await formulaTasks(id),formulas=await sql`select to_jsonb(f) as row from formulations f where plan_id=${id}::uuid`;
  assert.equal((await sql`select input_hash from assessments where plan_id=${id}::uuid`)[0].input_hash,null);
  assert.equal(before[0].payload.generation.inputHash,generation.inputHash);
  assert.equal(formulas.length,completed?1:0);
  await retryAssessmentHealthScore(id,'en');
  assert.deepEqual(await formulaTasks(id),before,'A missing stored hash cannot invalidate matching canonical work');
  assert.deepEqual(await sql`select to_jsonb(f) as row from formulations f where plan_id=${id}::uuid`,formulas);
  assert.equal((await sql`select input_hash from assessments where plan_id=${id}::uuid`)[0].input_hash,null,'Readiness must not backfill historical assessment metadata');
});
