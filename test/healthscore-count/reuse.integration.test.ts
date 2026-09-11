import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {captureAssessment,retryAssessmentHealthScore} from '../../lib/assessment-capture.ts';
import {getSql,closeSqlPool} from '../../lib/db.ts';
import {FUNNEL_GENERATOR_VERSION,getRevisionFormulationNutrientCount} from '../../lib/assessment-revisions.ts';
import {createStripeCheckoutSession,completeMockPayment} from '../../lib/stripe-payments.ts';
import {fulfillWebPayment} from '../../lib/web-payment-fulfillment.ts';
import {completeHealthScoreFixture} from '../fixtures/healthscore.ts';
assert.ok(process.env.TEST_DB_URL,'Isolated PostgreSQL is required');
const url=new URL(process.env.TEST_DB_URL);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/mattanutra_lock_review_/);
const sql=getSql()!;after(closeSqlPool);
const answers={firstName:'Count fixture',age:'36-45',sex:'male',goals:['energy']};
const ids=['vitamin-d3','omega-3','magnesium','vitamin-b12','coq10','creatine','vitamin-c','zinc','l-carnitine','selenium'];
async function prepared(locale:'en'|'th'|'zh-CN'='en') {
  const receipt=await captureAssessment({answers,locale},{idempotencyKey:randomUUID()});const id=receipt.planId;
  await sql`insert into assessment_healthscore_results(plan_id,revision,locale,generator_version,result) values(${id}::uuid,1,${locale},${FUNNEL_GENERATOR_VERSION},${sql.json(completeHealthScoreFixture(locale))})`;
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
test('HS-COUNT-02 completed task with missing output and failed work remain recoverable',async()=>{
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
