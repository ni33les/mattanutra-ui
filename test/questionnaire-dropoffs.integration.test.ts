import assert from "node:assert/strict";
import { before, after, it } from "node:test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { emptyAdminDashboardFilters } from "../lib/admin-dashboard-filters.ts";
import { getSql, closeSqlPool } from "../lib/db.ts";
import { getQuestionnaireDropoffs, loadQuestionnaireReport } from "../lib/admin-questionnaire-data.ts";

const connection = process.env.QUESTIONNAIRE_TEST_DB;
const name = `mattanutra_lock_review_dropoffs_${randomUUID().slice(0,8)}`;
let admin: postgres.Sql, sql: postgres.Sql;
const campaign = `questionnaire-${randomUUID()}`;
const generatedAt = "2026-10-08T02:00:00.000Z";
const filters = {...emptyAdminDashboardFilters,campaign};
const id = (n:number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
before(async()=>{
  assert.ok(connection,"QUESTIONNAIRE_TEST_DB must be an isolated localhost PostgreSQL administrator connection");
  const url=new URL(connection); assert.equal(url.hostname,"127.0.0.1"); assert.notEqual(url.port,"5432");
  admin=postgres(connection,{max:1}); await admin`create database ${admin(name)}`;
  url.pathname=`/${name}`; process.env.DB_URL=url.toString();
  sql=getSql()!;
  await sql.unsafe(`create table public.bpm (
    id uuid primary key,ray uuid not null,plan_id uuid,email_hash text,locale text,selected_plan text,
    utm_source text,traffic_source text,source_channel text,source_detail text,utm_campaign text,campaign_name text,
    utm_medium text,campaign_id text,affiliate_id text,affiliate_ref text,affiliate_sub_id text,promo_code text,
    device_type text,event_name text,event_type text,event_status text,occurred_at timestamptz,
    path text default '/en/nutrition/quiz',route text,user_agent text,emitted_by text,properties jsonb default '{}');
    create table public.assessments(plan_id uuid primary key,contact_email text,answers jsonb default '{}');
    create table public.assessment_resume_drafts(plan_id uuid,email_hash text,contact_email text,updated_at timestamptz,questionnaire_state jsonb);
  `);
  await sql`insert into public.bpm(id,ray,event_name,event_type,event_status,occurred_at,utm_campaign,traffic_source,locale,properties)
    select gen_random_uuid(),('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'chat_question_viewed','funnel','observed',
      '2026-10-08T00:00:00Z'::timestamptz,${campaign},'direct','en',
      jsonb_build_object('attemptId','attempt-'||n,'sessionId','session-'||n,'questionnaireVersion','v6-conversational','turnKey','firstName','displayId','display-'||n)
    from generate_series(1,1210) n`;
  // Completion deliberately has no campaign and lies outside the question-view cohort.
  await sql`insert into public.bpm(id,ray,event_name,event_type,occurred_at,properties)
    values(gen_random_uuid(),${id(1210)}::uuid,'assessment_captured','funnel','2026-10-08T01:00:00Z',
    ${sql.json({attemptId:"attempt-1210",questionnaireVersion:"v6-conversational"})})`;
  await sql`insert into public.assessment_resume_drafts(contact_email,updated_at,questionnaire_state)
    values('Case.Fragment@Example.test',now(),${sql.json({sessionId:"session-1205"})})`;
  for(const [n,source] of [[2001,"in_store"],[2002,"business_card"]] as const) await sql`
    insert into public.bpm(id,ray,event_name,event_type,occurred_at,utm_campaign,traffic_source,source_channel,source_detail,properties)
    values(gen_random_uuid(),${id(n)}::uuid,'chat_question_viewed','funnel','2026-10-08T00:00:00Z',${campaign},'pharmacy','fixture-shop',${source},
    ${sql.json({attemptId:`attempt-${n}`,questionnaireVersion:"v6-conversational",turnKey:"firstName",displayId:`display-${n}`})})`;
  for(const [n,extra] of [[3001,{user_agent:"HeadlessChrome"}],[3002,{emitted_by:"dev_campaign_seed"}],[3003,{properties:{mocked:true}}]] as const) {
    await sql`insert into public.bpm ${sql({id:randomUUID(),ray:id(n),event_name:"chat_question_viewed",event_type:"funnel",
      occurred_at:new Date("2026-10-08T00:00:00Z"),utm_campaign:campaign,
      properties:{attemptId:`attempt-${n}`,questionnaireVersion:"v6-conversational",turnKey:"firstName",displayId:`display-${n}`, ...("properties" in extra ? extra.properties : {})},
      user_agent:"user_agent" in extra ? extra.user_agent : null,emitted_by:"emitted_by" in extra ? extra.emitted_by : null})}`;
  }
});
after(async()=>{await closeSqlPool();if(admin){await admin`drop database if exists ${admin(name)} with (force)`;await admin.end();}});

const request = {range:"all" as const,filters,generatedAt,journey:"web" as const,bucket:"dropped" as const,
  question:"firstName",version:"v6-conversational",q:"",cursor:0,limit:100,locale:"en" as const};
it("full SQL report and every drill-down page agree beyond 1000 attempts",async()=>{
  const {report}=await loadQuestionnaireReport("all",filters,generatedAt);
  const web=report.groups.find(g=>g.journey==="web")!;
  assert.equal(web.questions[0].reached,1210);
  assert.equal(web.questions[0].dropped,1209);
  const keys=new Set<string>();let page;
  for(let cursor=0;cursor<1209;cursor+=100){
    page=await getQuestionnaireDropoffs({...request,cursor});assert.equal(page.total,1209);
    for(const row of page.rows){assert.ok(!keys.has(row.key));keys.add(row.key);}
  }
  assert.equal(keys.size,1209);assert.equal(page!.pagination.nextCursor,null);
  assert.equal(keys.has("attempt-1210"),false);
  assert.ok(!JSON.stringify(report).includes("session-"));
  assert.ok(!JSON.stringify(report).includes("@"));
});
it("partial email matching and lead timelines retain the question context",async()=>{
  const page=await getQuestionnaireDropoffs({...request,q:"e.FRaGmENT@exAMP",attempt:"attempt-1205"});
  assert.equal(page.total,1);assert.equal(page.rows[0].key,"attempt-1205");
  assert.equal(page.lead!.contactEmail,"Case.Fragment@Example.test");
  assert.ok(page.lead!.events[0].question);
  assert.equal((await getQuestionnaireDropoffs({...request,q:"%"})).total,0);
});
it("pharmacy drill-down respects both pharmacy and acquisition source",async()=>{
  const page=await getQuestionnaireDropoffs({...request,journey:"retail",pharmacy:"fixture-shop",source:"business_card"});
  assert.equal(page.total,1);assert.equal(page.rows[0].key,"attempt-2002");
  assert.equal((await getQuestionnaireDropoffs({...request,journey:"retail",pharmacy:"different"})).total,0);
});
it("the report timestamp fixes period boundaries and excludes future events",async()=>{
  assert.equal((await loadQuestionnaireReport("hour",filters,generatedAt)).attempts.length,0);
  const early=await loadQuestionnaireReport("all",filters,"2026-10-08T00:29:59Z");
  assert.equal(early.report.groups.find(g=>g.journey==="web")!.questions[0].dropped,0);
});
