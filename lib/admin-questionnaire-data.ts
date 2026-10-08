import { getSql } from "@/lib/db";
import { funnelBpmSource } from "@/lib/admin-funnel-events";
import { adminDashboardFilterSql, type AdminDashboardFilters } from "@/lib/admin-dashboard-filters";
import { adminDashboardRangeStart, type AdminDashboardRange } from "@/lib/admin-dashboard-data";
import { buildQuestionnaireReport, questionnaireEventNames, questionLabel, type QuestionnaireEventRow,
  type QuestionnaireFunnelReport, type QuestionnaireAttempt, type QuestionnaireDropoffPage,
  type QuestionnaireBucket, type QuestionnaireJourney } from "@/lib/questionnaire-dropoffs";
import type { AdminLeadRow } from "@/lib/admin-query-data";
import type { Locale } from "@/lib/i18n";

export async function loadQuestionnaireReport(range: AdminDashboardRange, filters: AdminDashboardFilters,
  generatedAt = new Date().toISOString(), contacts = false) {
  const sql = getSql();
  if (!sql) throw new Error("Database is not configured");
  const start = adminDashboardRangeStart(range, new Date(generatedAt));
  // Select a cohort using period/acquisition filters, then read its full history.
  // No row cap: a cap here silently changes both denominators and terminal states.
  const rows = await sql<QuestionnaireEventRow[]>`
    with event_history as materialized (
      select id::text, event_name as "eventName", occurred_at as "occurredAt",
        coalesce(nullif(properties->>'attemptId',''), 'legacy:' || coalesce(nullif(ray::text,id::text),plan_id::text,id::text)) as "attemptKey",
        jsonb_strip_nulls(jsonb_build_object('attemptId',properties->>'attemptId', 'sessionId',properties->>'sessionId',
          'questionnaireVersion',properties->>'questionnaireVersion','turnKey',properties->>'turnKey',
          'displayId',properties->>'displayId','clientAt',properties->'clientAt',
          'telemetryEventId',properties->>'telemetryEventId','postCompletionReview',properties->'postCompletionReview')) as properties,
        ((${start}::timestamptz is null or occurred_at >= ${start}) and ${adminDashboardFilterSql(sql, filters)}) as "inScope",
        journey_channel as journey,
        case when journey_channel='retail' then coalesce(nullif(source_channel,''),'unknown') else '' end as pharmacy,
        case when journey_channel='retail' then coalesce(nullif(source_detail,''),'unknown')
          else coalesce(nullif(utm_source,''),nullif(traffic_source,''),nullif(source_channel,''),'unknown') end as source,
        nullif(ray::text,id::text) as ray, plan_id::text as "planId", nullif(email_hash,'') as "emailHash",
        locale, coalesce(nullif(utm_campaign,''),nullif(campaign_name,'')) as campaign, coalesce(path,route) as path
      from ${funnelBpmSource(sql)}
      where journey_channel in ('web','retail') and occurred_at <= ${generatedAt}::timestamptz
        and event_name=any(${questionnaireEventNames}::text[])
    ), cohort as (
      select distinct "attemptKey" from event_history where "inScope"
        and ("eventName" in ('chat_question_viewed','chat_start') or properties->>'attemptId' is null)
    )
    select history.*, ${contacts ? sql`coalesce(
      (select a.contact_email from public.assessments a where a.plan_id::text=history."planId"),
      (select d.contact_email from public.assessment_resume_drafts d where d.contact_email is not null
        and (d.plan_id::text=history."planId" or d.email_hash=history."emailHash"
          or d.questionnaire_state->>'sessionId'=history.properties->>'sessionId')
        order by d.updated_at desc limit 1))` : sql`null::text`} as "contactEmail"
    from event_history history join cohort using ("attemptKey")
    order by history."occurredAt", history.id
  `;
  return buildQuestionnaireReport({ rows: rows.map(row => ({ ...row, occurredAt: new Date(row.occurredAt).toISOString() })), generatedAt, range, filters });
}

export async function getQuestionnaireFunnelReport(range: AdminDashboardRange, filters: AdminDashboardFilters): Promise<QuestionnaireFunnelReport> {
  const generatedAt = new Date().toISOString();
  try { return (await loadQuestionnaireReport(range, filters, generatedAt)).report; }
  catch (error) {
    console.error("Unable to load questionnaire funnel", error);
    return { databaseAvailable: false, generatedAt, range, filters, groups: [] };
  }
}

function attemptLead(attempt: QuestionnaireAttempt, locale: Locale): AdminLeadRow {
  return {
    subject: attempt.key, ray: attempt.ray, planId: attempt.planId, emailHash: attempt.emailHash, contactEmail: attempt.contactEmail,
    campaign: attempt.campaign, source: attempt.source, locale: attempt.locale, currentStage: attempt.bucket,
    lastEvent: attempt.events.at(-1)?.eventName ?? "", firstSeenAt: attempt.firstSeenAt, lastSeenAt: attempt.lastSeenAt,
    selectedPlan: null, pendingReviews: 0, communicationIssues: 0,
    events: attempt.events.map(event => ({ id: event.id, eventName: event.eventName, occurredAt: event.occurredAt,
      eventType: "funnel", eventStatus: "observed", actorType: "visitor", severity: "low", source: event.source,
      campaign: event.campaign, path: event.path, route: event.path, ray: event.ray, planId: event.planId,
      emailHash: event.emailHash, errorMessage: null,
      question: questionLabel(event.properties.turnKey ?? null, event.properties.questionnaireVersion ?? "", locale)?.question ?? null }))
  };
}

export async function getQuestionnaireDropoffs(input: {
  range: AdminDashboardRange; filters: AdminDashboardFilters; generatedAt: string;
  journey: QuestionnaireJourney; pharmacy?: string; source?: string; question?: string; version?: string;
  bucket: QuestionnaireBucket; q: string; cursor: number; limit: number; locale: Locale; attempt?: string;
}): Promise<QuestionnaireDropoffPage> {
  const { attempts } = await loadQuestionnaireReport(input.range, input.filters, input.generatedAt, true);
  const query = input.q.trim().toLocaleLowerCase();
  const matches = attempts.filter(a => a.journey === input.journey && a.bucket === input.bucket
    && (!input.pharmacy || a.pharmacy === input.pharmacy) && (!input.source || a.source === input.source)
    && (!input.question || a.questionKey === input.question) && (!input.version || a.version === input.version)
    && (!query || [a.key, a.ray, a.planId, a.emailHash, a.contactEmail, a.campaign, a.source,
      questionLabel(a.lastAnsweredKey, a.version, input.locale)?.question].filter(Boolean).join(" ").toLocaleLowerCase().includes(query)))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.key.localeCompare(b.key));
  const selected = input.attempt ? matches.find(a => a.key === input.attempt) : undefined;
  return {
    generatedAt: input.generatedAt, total: matches.length,
    rows: matches.slice(input.cursor, input.cursor + input.limit).map(({ events, ...row }) => { void events; return row; }),
    pagination: { cursor: input.cursor, limit: input.limit, nextCursor: input.cursor + input.limit < matches.length ? input.cursor + input.limit : null },
    ...(selected ? { lead: attemptLead(selected, input.locale) } : {})
  };
}
