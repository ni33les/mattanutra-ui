import { randomUUID } from "node:crypto";
import { getSql, closeSqlPool } from "../../lib/db.ts";
import { fixtureDatabaseUrl } from "./fixture-teardown.ts";
import { createAdminBrowserSession } from "./admin-browser-fixture.ts";

fixtureDatabaseUrl();
const sql=getSql()!;
try {
  for(const [code,label] of [["en","English"],["th","Thai"],["zh-CN","Chinese"]]) await sql`
    insert into public.site_locales(code,label,native_label,html_lang,is_public) values(${code},${label},${label},${code},true) on conflict(code) do nothing`;
  await sql`insert into public.organisations(slug,name,organisation_type,status) values('questionnaire-fixture-platform','Questionnaire fixture','platform','active'),
    ('questionnaire-fixture-shop','Questionnaire fixture pharmacy','tenant','active') on conflict do nothing`;
  await sql`insert into public.people(email,display_name,status) values('questionnaire-owner@example.test','Questionnaire fixture owner','active') on conflict do nothing`;
  await sql`insert into public.organisation_memberships(organisation_id,person_id,role,status)
    select o.id,p.id,'platform_owner','active' from public.organisations o, public.people p
    where o.slug='questionnaire-fixture-platform' and p.email='questionnaire-owner@example.test' on conflict do nothing`;
  const campaign="questionnaire-browser-fixture";
  await sql`delete from public.bpm where utm_campaign=${campaign}`;
  await sql`insert into public.bpm(id,ray,event_name,event_type,occurred_at,utm_campaign,traffic_source,path,locale,properties)
    select gen_random_uuid(),('11000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,event,'funnel',
      now()-interval '2 hours'+case when event='chat_question_viewed' then interval '1 second' else interval '0 second' end,
      ${campaign},'direct','/en/nutrition/quiz','en',
      jsonb_build_object('attemptId','browser-attempt-'||n,'sessionId','browser-session-'||n,'questionnaireVersion','v6-conversational','turnKey','firstName','displayId','browser-display-'||n)
    from generate_series(1,1005) n cross join unnest(array['chat_start','chat_question_viewed']) event`;
  await sql`insert into public.assessment_resume_drafts(id,plan_id,locale,contact_email,email_hash,token_hash,expires_at,questionnaire_state)
    values(${randomUUID()}::uuid,${randomUUID()}::uuid,'en','browser.fragment@example.test','browser-fixture-email',${randomUUID()},now()+interval '1 day',
      ${sql.json({sessionId:'browser-session-17'})})`;
  for(const source of ["in_store","business_card"]) {
    const ray=randomUUID(),attempt=randomUUID();
    for(const event of ["chat_start","chat_question_viewed"]) await sql`
      insert into public.bpm(id,ray,event_name,event_type,occurred_at,utm_campaign,traffic_source,source_channel,source_detail,path,locale,properties)
      values(gen_random_uuid(),${ray}::uuid,${event},'funnel',now()-interval '2 hours',${campaign},'pharmacy',
        'questionnaire-fixture-shop',${source},'/en/retail/questionnaire-fixture-shop/quiz','en',
        ${sql.json({attemptId:attempt,sessionId:attempt,questionnaireVersion:'v6-conversational',turnKey:'firstName',displayId:attempt})})`;
  }
  const session=await createAdminBrowserSession();
  console.log(`QUESTIONNAIRE_FIXTURE:${JSON.stringify({session,campaign})}`);
} finally {await closeSqlPool();}
