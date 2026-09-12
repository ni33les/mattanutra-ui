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
async function reserved(){
 const assessment=await captureAssessment({answers:{age:'36-45',sex:'male',goals:['energy']},locale:'en'},{idempotencyKey:randomUUID()});
 const {agent}=await registerWorkerSession({agent:{name:`availability-${randomUUID()}`,capabilities:['generate_supplement_guidance']},instanceId:randomUUID(),taskTypes:['generate_supplement_guidance'],workerVersion:process.env.AGENTIC_BUILD_ID});
 const rows=await sql`update tasks set status='reserved',reserved_by_agent_id=${agent.id}::uuid,lease_until=now()+interval '180 seconds' where plan_id=${assessment.planId}::uuid and task_type='generate_supplement_guidance' returning id`;
 assert.equal(rows.length,1);return (await getTaskBundle({taskId:rows[0].id})).task;
}
test('AVAIL-PG-01 task preparation freezes permitted inputs once; empty worker completion is publishable',async()=>{
 const task=await reserved();assert.equal((task.payload as {formulationPolicy:string}).formulationPolicy,'product-backed-v1');
 // The isolated live-catalogue adapter deliberately exposes an empty market.
 const work=await buildTaskWorkItem(task);assert.equal(work.taskType,'generate_supplement_guidance');
 if(work.taskType!=='generate_supplement_guidance')throw new Error('Wrong task type');
 assert.deepEqual(work.canonicalSupplements,[]);assert.ok(work.formulationAvailability?.inputIdentity);
 const saved=(await getTaskBundle({taskId:task.id})).task;
 assert.deepEqual((saved.payload as {formulationAvailability:unknown}).formulationAvailability,work.formulationAvailability);
 const before=await sql`select payload,updated_at from tasks where id=${task.id}::uuid`;
 const again=await buildTaskWorkItem(saved);assert.deepEqual(again,work);assert.deepEqual(await sql`select payload,updated_at from tasks where id=${task.id}::uuid`,before);
 const result=await executeTaskWorkItem(work);
 const prepared=await prepareTaskCompletionResult({task:saved,resultPayload:result});assert.ok(prepared.formulation);
 assert.deepEqual(prepared.formulation.value.supplementBreakdown,[]);
});
test('AVAIL-PG-02 lost task ownership cannot publish a new availability snapshot',async()=>{
 const task=await reserved();await sql`update tasks set status='cancelled',lease_until=null where id=${task.id}::uuid`;
 await assert.rejects(buildTaskWorkItem(task),/ownership was lost/);
 const [row]=await sql`select payload from tasks where id=${task.id}::uuid`;assert.ok(!row.payload.formulationAvailability);
});
