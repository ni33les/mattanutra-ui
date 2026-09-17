import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {getSql,closeSqlPool} from '../../lib/db.ts';
import {captureAssessment} from '../../lib/assessment-capture.ts';
import {registerWorkerSession} from '../../lib/task-service-agents.ts';
import {getTaskBundle} from '../../lib/task-service.ts';
import {buildTaskWorkItem} from '../../lib/task-work-items.ts';
import {executeTaskWorkItem} from '../../lib/task-execution.ts';
import {prepareTaskCompletionResult} from '../../lib/task-result-applier.ts';
assert.ok(process.env.TEST_DB_URL,'Isolated PostgreSQL required');
const url=new URL(process.env.TEST_DB_URL);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/mattanutra_lock_review_ax_/);
const sql=getSql()!;after(closeSqlPool);
async function reserved(country = 'Vietnam'){
 const assessment=await captureAssessment({answers:{age:'36-45',sex:'male',goals:['energy'],country},locale:'en'},{idempotencyKey:randomUUID()});
 const {agent}=await registerWorkerSession({agent:{name:`availability-${randomUUID()}`,capabilities:['generate_supplement_guidance']},instanceId:randomUUID(),taskTypes:['generate_supplement_guidance'],workerVersion:process.env.AGENTIC_BUILD_ID});
 const rows=await sql`update tasks set status='reserved',reserved_by_agent_id=${agent.id}::uuid,lease_until=now()+interval '180 seconds' where plan_id=${assessment.planId}::uuid and task_type='generate_supplement_guidance' returning id`;
 assert.equal(rows.length,1);return (await getTaskBundle({taskId:rows[0].id})).task;
}
test('AVAIL-PG-01 an empty product market retains approved ingredients through AI and publication',async t=>{
 const task=await reserved();assert.equal((task.payload as {formulationPolicy:string}).formulationPolicy,'approved-ingredients-v2');
 // Vietnam has no products. Its approved ingredient list must still reach the AI.
 const work=await buildTaskWorkItem(task);assert.equal(work.taskType,'generate_supplement_guidance');
 if(work.taskType!=='generate_supplement_guidance')throw new Error('Wrong task type');
 assert.ok(work.canonicalSupplements.length > 0, 'Missing products must not remove approved ingredients');assert.ok(work.formulationAvailability?.inputIdentity);
 assert.ok(work.canonicalSupplements.every(row => row.listStatus === 'active'));
 const prior=process.env.XAI_API_KEY;process.env.XAI_API_KEY='offline';
 t.after(()=>{if(prior===undefined)delete process.env.XAI_API_KEY;else process.env.XAI_API_KEY=prior;});
 const ingredient=work.canonicalSupplements[0];let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify({
  supplementBreakdown:[{id:'approved-ingredient',category:'Foundation',supplement:ingredient.name,dailyDose:'10 mg/day',effectivenessRank:1,status:'add',rationale:'Supports the stated goal.',decision:'Review total intake.',whyThisIsForYou:'Reflects the supplied goals.',cautions:[]}],
  cautions:[],marketingPoints:[1,2,3].map(n=>({id:`point-${n}`,title:'Routine',body:'Based on your answers.'}))
 })}}]});});
 const saved=(await getTaskBundle({taskId:task.id})).task;
 assert.deepEqual((saved.payload as {formulationAvailability:unknown}).formulationAvailability,work.formulationAvailability);
 const before=await sql`select payload,updated_at from tasks where id=${task.id}::uuid`;
 const again=await buildTaskWorkItem(saved);assert.deepEqual(again,work);assert.deepEqual(await sql`select payload,updated_at from tasks where id=${task.id}::uuid`,before);
 const result=await executeTaskWorkItem(work);
 const prepared=await prepareTaskCompletionResult({task:saved,resultPayload:result});assert.ok(prepared.formulation);
 assert.equal(calls,1);assert.equal(prepared.formulation.value.supplementBreakdown.length,1);
 assert.equal(prepared.formulation.value.supplementBreakdown[0].supplement,ingredient.name);
});
test('AVAIL-PG-02 lost task ownership cannot publish a new availability snapshot',async()=>{
 const task=await reserved();await sql`update tasks set status='cancelled',lease_until=null where id=${task.id}::uuid`;
 await assert.rejects(buildTaskWorkItem(task),/ownership was lost/);
 const [row]=await sql`select payload from tasks where id=${task.id}::uuid`;assert.ok(!row.payload.formulationAvailability);
});

test('AVAIL-PG-03 Thailand, Vietnam and Singapore receive the same approved ingredient universe',async()=>{
 const counts=[];const inputs=[];
 for(const country of ['Thailand','Vietnam','Singapore']){
  const work=await buildTaskWorkItem(await reserved(country));
  assert.equal(work.taskType,'generate_supplement_guidance');
  if(work.taskType!=='generate_supplement_guidance')throw new Error('Wrong task type');
  assert.ok(work.canonicalSupplements.length>0);
  counts.push(work.canonicalSupplements.map(row=>row.id));inputs.push(work.formulationAvailability?.catalogueIdentity);
 }
 assert.deepEqual(counts[0],counts[1]);assert.deepEqual(counts[0],counts[2]);
 assert.equal(inputs[0],inputs[1]);assert.equal(inputs[0],inputs[2]);
});
