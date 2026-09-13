import assert from "node:assert/strict";
import { after, test } from "node:test";
import { getSql, closeSqlPool, withDatabaseTransaction } from "../lib/db.ts";
import { getFunnelReadiness } from "../lib/funnel-readiness.ts";
import { getStoredFormulationRead } from "../lib/assessment-store.ts";
import { getRevisionHealthScore, getRevisionFormulationNutrientCount } from "../lib/assessment-revisions.ts";
import type { Locale } from "../lib/i18n.ts";
import { hasHealthScoreAiCopy } from "../lib/healthscore-readiness.ts";
const uri=new URL(process.env.TEST_DB_URL!);
assert.equal(uri.hostname,"127.0.0.1");assert.match(uri.pathname,/^\/prd_rehearsal_/);
const sql=getSql()!;assert.ok(sql);after(closeSqlPool);
async function fixtures(){
 const rows=await sql`select a.plan_id,a.locale,a.health_score from assessments a where a.input_revision=0 and a.input_hash is null and a.status='ready'
 and exists(select 1 from payments p where p.plan_id=a.plan_id and p.status='paid')
 and exists(select 1 from tasks t join formulations f on f.plan_id=t.plan_id and f.generated_at between t.created_at and t.completed_at where t.plan_id=a.plan_id and t.task_type='generate_supplement_guidance' and t.status='completed' and t.payload->'answers'=a.answers and f.assessment_revision is null)`;
 assert.equal(rows.length,2,"Both fresh restored historical paid journeys are required");return rows;
}
async function unchangedRows(){return sql`select 'assessment' kind,plan_id::text id,row_to_json(a)::text body from assessments a union all select 'formulation',plan_id::text||':'||version,row_to_json(f)::text from formulations f union all select 'finance',id::text,row_to_json(f)::text from finance_transactions f union all select 'payment',id::text,row_to_json(p)::text from payments p union all select 'task',id::text,row_to_json(t)::text from tasks t order by kind,id`;}
test("PRD-READ-01 proven completed historical paid journeys open HealthScore and reveal without writes",async()=>{const before=await unchangedRows();for(const f of await fixtures()){const locale=f.locale as Locale;const ready=await getFunnelReadiness(f.plan_id,locale);assert.equal(ready?.fulfillmentStatus,"complete");assert.equal(ready?.readyForHealthScore,true);assert.equal(ready?.readyForReveal,true);assert.deepEqual(await getRevisionHealthScore(f.plan_id,locale),f.health_score);assert.ok(hasHealthScoreAiCopy(f.health_score,locale));const count=await getRevisionFormulationNutrientCount(f.plan_id,locale,0);assert.ok(count!>0);for(const includeProducts of [false,true]){const result=await getStoredFormulationRead(f.plan_id,{locale,includeProducts});assert.equal(result?.status,"ready");assert.equal(result?.result.supplementBreakdown.length,count);if(includeProducts)assert.ok(result!.result.recommendations.length>0);}}assert.deepEqual(await unchangedRows(),before);});
test("PRD-READ-02 changed answers cannot inherit historical results",async()=>{const [f]=await fixtures();const rollback=new Error("rollback");await assert.rejects(withDatabaseTransaction(sql,async tx=>{await tx`update assessments set answers=answers||'{"activity":"changed"}'::jsonb where plan_id=${f.plan_id}::uuid`;assert.equal((await getFunnelReadiness(f.plan_id,f.locale,tx))?.readyForReveal,false);throw rollback;}),e=>e===rollback);});
test("PRD-READ-03 a current revision never falls back to pre-revision output",async()=>{const [f]=await fixtures();const rollback=new Error("rollback");await assert.rejects(withDatabaseTransaction(sql,async tx=>{await tx`update assessments set input_revision=1,input_hash='changed' where plan_id=${f.plan_id}::uuid`;assert.equal((await getFunnelReadiness(f.plan_id,f.locale,tx))?.readyForReveal,false);throw rollback;}),e=>e===rollback);});
test("PRD-READ-04 missing historical completion evidence stays pending",async()=>{const [f]=await fixtures();const rollback=new Error("rollback");await assert.rejects(withDatabaseTransaction(sql,async tx=>{await tx`update tasks set status='failed' where plan_id=${f.plan_id}::uuid and task_type='generate_supplement_guidance'`;assert.equal((await getFunnelReadiness(f.plan_id,f.locale,tx))?.readyForReveal,false);throw rollback;}),e=>e===rollback);});
test("PRD-READ-05 historical copy is never invented for another locale",async()=>{for(const f of await fixtures()){const locale=f.locale==='en'?'th':'en';assert.equal((await getFunnelReadiness(f.plan_id,locale))?.readyForHealthScore,false);assert.equal(await getRevisionHealthScore(f.plan_id,locale),null);}});
