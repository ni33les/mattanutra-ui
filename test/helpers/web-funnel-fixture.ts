/** Isolated-database fixture CLI for browser tests. Never loads environment files. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../../lib/db.ts";
import { captureAssessment } from "../../lib/assessment-capture.ts";
import { createAssessmentResumeDraft } from "../../lib/assessment-resume-store.ts";
import { createInitialState, startQuestionnaire, applyAnswer } from "../../lib/questionnaire/engine.ts";
import { loadGenerationInput, FUNNEL_GENERATOR_VERSION } from "../../lib/assessment-revisions.ts";
import { insertFormulationVersion } from "../../lib/plan-version-writes.ts";
import { completeHealthScoreFixture } from "../fixtures/healthscore.ts";
import { fulfillWebPayment } from "../../lib/web-payment-fulfillment.ts";
import { requestHealthScoreDelivery, deliverHealthScore } from "../../lib/healthscore-delivery.ts";
import { isLocale } from "../../lib/i18n.ts";
import { applyTaskCompletionResult } from "../../lib/task-result-applier.ts";
import { getTaskBundle } from "../../lib/task-service.ts";

const connection = new URL(process.env.TEST_DB_URL!);
assert.equal(connection.hostname, "127.0.0.1");
assert.match(connection.pathname, /^\/mattanutra_lock_review/);
process.env.DB_URL = connection.href;
process.env.MATTANUTRA_ENV = "dev";
process.env.STRIPE_PAYMENT_MODE = "mock";
const input = JSON.parse(process.argv[2] || "{}");
const locale = isLocale(input.locale) ? input.locale : "en";
const sql = getSql()!;
const answers = { firstName: "Funnel Fixture", sex: "male", age: "36-45", goals: ["energy"], activity: "light" };
let output: unknown;
try {
  if (input.action === "capture") {
    output = await captureAssessment({ answers, locale, sessionId: randomUUID(), paymentId: input.paymentId }, { idempotencyKey: randomUUID() });
  } else if (input.action === "resume") {
    let state = startQuestionnaire(createInitialState({ locale, sessionId: randomUUID() })).state;
    const named = applyAnswer(state, "firstName", "Resume Fixture");
    if (named.ok) state = named.state;
    output = await createAssessmentResumeDraft({ locale, contactEmail: "resume@funnel-fixture.test", answers: { firstName: "Resume Fixture" },
      paymentId: input.paymentId, questionnaireState: state });
  } else if (input.action === "copy") {
    const [record] = await sql`select id from public.tasks where plan_id = ${input.planId}::uuid and task_type = 'analyze_healthscore'
      and payload #>> '{generation,generatorVersion}' = ${FUNNEL_GENERATOR_VERSION}
      and payload #>> '{generation,revision}' = (select input_revision::text from public.assessments where plan_id = ${input.planId}::uuid)
      and payload #>> '{generation,locale}' = ${locale} order by created_at desc limit 1`;
    assert.ok(record);
    const { task } = await getTaskBundle({ taskId: record.id });
    await withDatabaseTransaction(sql, async tx => {
      await applyTaskCompletionResult({ task, taskId: task.id, sql: tx, resultPayload: { healthScore: completeHealthScoreFixture(locale) } });
      await tx`update public.tasks set status = 'completed' where id = ${task.id}::uuid`;
    });
    output = { ready: true };
  } else if (input.action === "ready") {
    const generation = (await loadGenerationInput(sql, input.planId, locale))!;
    await insertFormulationVersion(sql, { planId: input.planId, generation, modelVersion: "browser-fixture", formulation: {
      supplementBreakdown: input.empty ? [] : [{ id: "vitamin-d", category: "vitamin", dailyDose: { [locale]: "1000 IU" }, effectivenessRank: 1,
        rationale: { [locale]: "Fixture rationale" }, status: "add", supplement: { [locale]: "Vitamin D" } }],
      sectionStatuses: { supplements: "ready", foods: "ready" }, foodGuidance: []
    } });
    await sql`insert into public.product_recommendation_runs (catalogue_revision, plan_id, assessment_revision, generation_locale, generator_version, selection_revision, diagnostics)
      values ((select revision from public.catalogue_runtime_revision where singleton=true), ${input.planId}::uuid, ${generation.revision}, ${locale}, ${FUNNEL_GENERATOR_VERSION},
        coalesce((select revision from public.assessment_product_preferences where plan_id = ${input.planId}::uuid), 0),
        '{"stackPreference":"balanced","matching":{"operationalStatus":"no_purchase","selectedOptionId":null,"options":[],"alternativeSearch":{"status":"not_needed","reason":"No purchase fixture"}}}')`;
    await sql`update public.tasks set status = 'completed' where plan_id = ${input.planId}::uuid and task_type in ('generate_supplement_guidance','generate_product_recommendations')`;
    output = { ready: true };
  } else if (input.action === "fulfill") {
    const [payment] = input.paymentId ? [{ id: input.paymentId }] : await sql`select id from public.payments where plan_id = ${input.planId}::uuid and status in ('paid', 'bound') order by created_at desc limit 1`;
    assert.ok(payment);
    output = await fulfillWebPayment(payment.id, { session: async () => null,
      rate: async () => ({ currency: "THB", fallbackUsed: false, fxRateId: null, provider: "fixture", source: "fixture", usdRate: 0.03 }) });
  } else if (input.action === "state") {
    const [row] = await sql`select a.answers, a.contact_email, a.input_revision, a.selected_plan,
      (select count(*)::int from public.payments p where p.plan_id = a.plan_id and status in ('paid','bound')) as payments,
      (select count(*)::int from public.finance_transactions f join public.payments p on f.source_ref = 'stripe:payment:' || p.id || ':nominal-revenue' where p.plan_id = a.plan_id) as revenues
      from public.assessments a where a.plan_id = ${input.planId}::uuid`;
    output = row ?? null;
  } else if (input.action === "email") {
    const request = await requestHealthScoreDelivery(input.planId, { locale, email: "sink@funnel-fixture.test" });
    const sink: unknown[] = [];
    await deliverHealthScore(request.id, async email => { sink.push(email); return { sent: true, outcome: "accepted", messageId: "fixture-sink" }; });
    output = { request, sink };
  } else throw new Error("Unknown fixture action");
  process.stdout.write(`FIXTURE:${JSON.stringify(output)}\n`);
} finally { await closeSqlPool(); }

// Required fixture work is committed; discard optional telemetry timers before starting the next browser step.
process.exit(0);
