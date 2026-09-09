import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import postgres from "postgres";
import { getAssessmentProductPreferences } from "../../lib/assessment-product-preferences.ts";
assert.ok(process.env.TEST_DB_URL,"Isolated PostgreSQL is mandatory");
const url=new URL(process.env.TEST_DB_URL);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/mattanutra_lock_review_ax_/);
const queries:string[]=[];
const sql=postgres(url.href,{max:3,prepare:false,connection:{lock_timeout:"100ms"},debug:(_id,q)=>queries.push(q)});after(()=>sql.end());
test("LOCK-PREF-01 existing preference reads do not reacquire the writer fence or issue no-op inserts",async()=>{
  const id=randomUUID();await sql`insert into public.assessments(plan_id,answers,locale) values(${id}::uuid,'{}','en')`;
  await sql`insert into public.assessment_product_preferences(plan_id) values(${id}::uuid)`;
  let release!:()=>void,ready!:()=>void;
  const entered=new Promise<void>(resolve=>{ready=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const held=sql.begin(async tx=>{await tx`select plan_id from public.assessment_product_preferences where plan_id=${id}::uuid for update`;ready();await gate;});await entered;
  try{
    queries.length=0;
    assert.deepEqual(await getAssessmentProductPreferences(sql,id,true),{revision:0,excludedProductIds:[],searchEffort:"standard"});
    assert.equal(queries.length,1);assert.match(queries[0],/^\s*select/i);assert.doesNotMatch(queries[0],/for update|insert|delete/);
  }finally{release();await held;await sql`delete from public.assessment_product_preferences where plan_id=${id}::uuid`;await sql`delete from public.assessments where plan_id=${id}::uuid`;}
});
