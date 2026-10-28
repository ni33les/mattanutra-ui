import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { after, before, describe, it } from "node:test";
import { fixtureDatabaseUrl, cleanupFixtureRelationships } from "./helpers/fixture-teardown.ts";
import { captureAssessment, updateAssessmentContact } from "../lib/assessment-capture.ts";
import { closeSqlPool, getSql, withDatabaseTransaction } from "../lib/db.ts";
import { listCommunicationChannels } from "../lib/communications-dispatch.ts";
import { selectBestCommunicationChannel } from "../lib/communication-channel-utils.ts";
import { metaContactMatching } from "../lib/meta-matching.ts";
import { setMetaConsent } from "../lib/meta-tracking.ts";
import { deliverSavedPlan, requestSavedPlanDelivery, savedPlanDeliveryEmail } from "../lib/saved-plan-delivery.ts";
register("../scripts/matcher-http-loader.mjs", import.meta.url);
const { PATCH: updateContactRoute } = await import("../app/api/assessment/[planId]/contact/route.ts");

fixtureDatabaseUrl();
describe("saved web and pharmacy plan email delivery", () => {
  const plans: string[] = [], contexts: string[] = [];
  before(async () => {
    Object.assign(process.env, { DB_URL: process.env.TEST_DB_URL, WEB_PRODUCT_JOURNEY_ENABLED: "1", MATTANUTRA_ENV: "dev",
      META_TRACKING_ENABLED: "true", FACEBOOK_PIXEL_ID_DEV: "123456789012345", FACEBOOK_CAPI_ACCESS_TOKEN_DEV: "fixture-not-a-real-token" });
    await getSql()!.unsafe(readFileSync(new URL("../db-rollout/saved-plan-delivery.sql", import.meta.url), "utf8"));
  });
  after(async () => {
    await withDatabaseTransaction(getSql()!, async sql => {
      await sql`set local session_replication_role=replica`;
      const identities = (await sql`select identity_id from public.plan_communication_identities where plan_id=any(${plans}::uuid[])`).map(row => row.identity_id);
      const eventTasks = (await sql`select task_id from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`).map(row => row.task_id).filter(Boolean);
      const taskIds = (await sql`select id from public.tasks where plan_id=any(${plans}::uuid[]) or id=any(${eventTasks}::uuid[])`).map(row => row.id);
      await cleanupFixtureRelationships(sql, { planIds: plans, taskIds });
      await sql`delete from public.communication_messages where plan_id=any(${plans}::uuid[])`;
      await sql`delete from public.communication_channels where identity_id=any(${identities}::uuid[])`;
      await sql`delete from public.communication_identities where id=any(${identities}::uuid[])`;
      await sql`delete from public.meta_conversion_events where context_id=any(${contexts}::uuid[])`;
      await sql`delete from public.meta_tracking_bindings where context_id=any(${contexts}::uuid[])`;
      await sql`delete from public.meta_tracking_contexts where id=any(${contexts}::uuid[])`;
      await sql`delete from public.task_events where task_id=any(${taskIds}::uuid[])`;
      await sql`delete from public.task_comments where task_id=any(${taskIds}::uuid[])`;
      await sql`delete from public.tasks where id=any(${taskIds}::uuid[])`;
      await sql`delete from public.saved_plan_delivery_requests where plan_id=any(${plans}::uuid[])`;
      await sql`delete from public.assessment_inputs where plan_id=any(${plans}::uuid[])`;
      await sql`delete from public.assessment_versions where plan_id=any(${plans}::uuid[])`;
      await sql`delete from public.assessment_version_counters where plan_id=any(${plans}::uuid[])`;
      await sql`delete from public.funnel_requests where resource_id=any(${plans}::uuid[])`;
      await sql`delete from public.assessments where plan_id=any(${plans}::uuid[])`;
    });
    await closeSqlPool();
  });
  const request = (context?: string, granted = true) => new Request("https://dev.mattanutra.com/en/nutrition/quiz", {
    headers: context ? { cookie: `mn_marketing=${granted ? "granted" : "denied"}; mn_marketing_context=${context}` } : {}
  });
  const body = (email?: string, locale = "en") => ({ locale, contactEmail: email,
    answers: { firstName: "Private fixture", age: "36-45", sex: "male", goals: ["energy"] } });
  async function capture(email?: string, locale = "en", req?: Request) {
    const input = body(email, locale), options = { idempotencyKey: randomUUID(), request: req };
    const result = await captureAssessment(input, options); plans.push(result.planId);
    return { ...result, input, options };
  }
  async function seed(email: string, journey: string | null = "web-products-v1", answers = {}) {
    const planId = randomUUID(); plans.push(planId);
    await getSql()!`insert into public.assessments(plan_id,locale,contact_email,answers,answer_summary,health_score,journey_version)
      values (${planId}::uuid,'en',${email},${getSql()!.json(answers)},'{}','{}',${journey})`;
    return planId;
  }
  async function requested(email = "recipient@fixture.test") {
    const planId = await seed(email);
    return { planId, receipt: (await requestSavedPlanDelivery(planId, { email, locale: "en" }))! };
  }
  async function capturePharmacy(source: "in_store" | "business_card", email?: string, locale = "en") {
    const [pharmacy] = await getSql()!`select id::text,slug from public.organisations
      where slug='matcher-v5-isolated-fixture-retailer' and status='active' and organisation_type='tenant'`;
    assert.ok(pharmacy, "Controlled pharmacy fixture is required");
    const input = { ...body(email, locale), pharmacyId: pharmacy.slug,
      bpm: { ray: randomUUID(), attribution: { trafficSource: "pharmacy", sourceChannel: pharmacy.slug, sourceDetail: source } } };
    const options = { idempotencyKey: randomUUID() };
    const result = await captureAssessment(input, options); plans.push(result.planId);
    return { ...result, input, options, pharmacy };
  }
  const messageLink = (html: string) => {
    const href = html.match(/href="([^"]+)"/)?.[1]; assert.ok(href);
    return new URL(href.replaceAll("&amp;", "&"));
  };
  it("captures an optional email, plan contact and consented Meta identity atomically without duplicate sends", async () => {
    const context = await setMetaConsent(request(), true, "/en"); contexts.push(context);
    const p = await capture(" OWNER@fixture.test ", "th", request(context)), sql = getSql()!;
    assert.equal(p.savedPlanDelivery?.status, "queued");
    const replay = await captureAssessment(p.input, p.options);
    assert.equal(replay.savedPlanDelivery?.id, p.savedPlanDelivery?.id);
    const [contact] = await sql`select a.contact_email,c.address,c.channel_type from public.assessments a
      join public.plan_communication_identities i on i.plan_id=a.plan_id and i.is_primary
      join public.communication_channels c on c.identity_id=i.identity_id where a.plan_id=${p.planId}::uuid`;
    assert.deepEqual(contact, { contact_email: "owner@fixture.test", address: "owner@fixture.test", channel_type: "email" });
    const events = await sql`select event_name,matching from public.meta_conversion_events where context_id=${context}::uuid order by event_name`;
    assert.deepEqual(events.map(row => row.event_name), ["EmailCapture", "Lead"]);
    for (const event of events) assert.deepEqual(event.matching.em, metaContactMatching({ email: "owner@fixture.test" }).em);
    assert.doesNotMatch(JSON.stringify(events), /owner@fixture|Private fixture|36-45/);
    assert.equal((await sql`select count(*)::int as n from public.saved_plan_delivery_requests where plan_id=${p.planId}::uuid`)[0].n, 1);
    assert.equal((await sql`select count(*)::int as n from public.tasks where plan_id=${p.planId}::uuid and task_type='send_saved_plan_email'`)[0].n, 1);
    const noEmail = await capture();
    assert.equal(noEmail.savedPlanDelivery, null);
    assert.equal((await sql`select count(*)::int as n from public.plan_communication_identities where plan_id=${noEmail.planId}::uuid`)[0].n, 0);
  });
  it("keeps email delivery independent of advertising refusal", async () => {
    const context = await setMetaConsent(request(), false, "/en"); contexts.push(context);
    const p = await capture("private@fixture.test", "en", request(context, false));
    assert.equal(p.savedPlanDelivery?.status, "queued");
    assert.equal((await getSql()!`select consent_granted from public.meta_tracking_contexts where id=${context}::uuid`)[0].consent_granted, false);
    assert.equal((await getSql()!`select count(*)::int as n from public.meta_conversion_events where context_id=${context}::uuid`)[0].n, 0);
    assert.equal((await getSql()!`select count(*)::int as n from public.meta_tracking_bindings where resource_type='plan' and resource_id=${p.planId}`)[0].n, 0);
  });
  for (const source of ["in_store", "business_card"] as const) {
    it(`captures and emails the saved ${source} pharmacy plan without changing its generation or source`, async () => {
      const p = await capturePharmacy(source, " PHARMACY@fixture.test ", "th"), sql = getSql()!;
      assert.equal(p.journeyVersion, null); assert.equal(p.skipHealthScore, true);
      assert.equal(p.savedPlanDelivery?.status, "queued");
      const [saved] = await sql`select answers,locale,input_revision,input_hash,contact_email from public.assessments where plan_id=${p.planId}::uuid`;
      assert.equal(saved.contact_email, "pharmacy@fixture.test");
      assert.equal(saved.answers.inStorePharmacy.organisationId, p.pharmacy.id);
      assert.deepEqual(saved.answers.inStorePharmacy.acquisition, { source, ray: p.input.bpm.ray });
      const channels = await listCommunicationChannels({ planId: p.planId });
      assert.equal(selectBestCommunicationChannel(channels, "email")?.address, "pharmacy@fixture.test");
      assert.equal(channels.filter(channel => channel.channelType === "line").length, 0);
      const beforeTasks = await sql`select id,task_type from public.tasks where plan_id=${p.planId}::uuid order by id`;
      assert.equal((await captureAssessment(p.input, p.options)).savedPlanDelivery?.id, p.savedPlanDelivery!.id);
      assert.equal((await requestSavedPlanDelivery(p.planId, { email: "pharmacy@fixture.test", locale: "en" }))?.locale, "th");
      let sends = 0;
      assert.equal((await deliverSavedPlan(p.savedPlanDelivery!.id, async input => {
        sends++; assert.equal(input.to, "pharmacy@fixture.test");
        const link = messageLink(input.html);
        assert.equal(link.pathname, `/th/retail/${p.pharmacy.slug}/reveal`);
        assert.equal(link.searchParams.get("plan"), p.planId); assert.equal(link.searchParams.get("source"), source);
        return { sent: true, outcome: "accepted", messageId: `${source}-fixture` };
      })).status, "sent");
      await deliverSavedPlan(p.savedPlanDelivery!.id, async () => { assert.fail("Already delivered"); });
      assert.equal(sends, 1);
      assert.deepEqual(await sql`select id,task_type from public.tasks where plan_id=${p.planId}::uuid order by id`, beforeTasks);
      assert.deepEqual((await sql`select answers,locale,input_revision,input_hash,contact_email from public.assessments where plan_id=${p.planId}::uuid`)[0], saved);
    });
  }
  it("adds pharmacy contact through PATCH without changing calculation locale, answers, source or generation", async () => {
    const p = await capturePharmacy("business_card"), sql = getSql()!;
    assert.equal(p.savedPlanDelivery, null);
    assert.equal((await sql`select count(*)::int n from public.saved_plan_delivery_requests where plan_id=${p.planId}::uuid`)[0].n, 0);
    const [saved] = await sql`select answers,locale,input_revision,input_hash,health_score from public.assessments where plan_id=${p.planId}::uuid`;
    const beforeTasks = await sql`select id,task_type from public.tasks where plan_id=${p.planId}::uuid order by id`;
    const response = await updateContactRoute(new Request(`https://dev.mattanutra.com/api/assessment/${p.planId}/contact`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactEmail: "returning@fixture.test", locale: "zh-CN",
        pharmacyId: "another-pharmacy", source: "in_store" })
    }), { params: Promise.resolve({ planId: p.planId }) });
    assert.equal(response.status, 200);
    const updated = await response.json(); assert.equal(updated.savedPlanDelivery.locale, "zh-CN");
    assert.equal((await updateAssessmentContact(p.planId, "returning@fixture.test", undefined, "th")).savedPlanDelivery?.id, updated.savedPlanDelivery.id);
    await deliverSavedPlan(updated.savedPlanDelivery.id, async input => {
      const link = messageLink(input.html);
      assert.equal(link.pathname, `/zh-CN/retail/${p.pharmacy.slug}/reveal`);
      assert.equal(link.searchParams.get("plan"), p.planId); assert.equal(link.searchParams.get("source"), "business_card");
      return { sent: true, outcome: "accepted", messageId: "corrected-pharmacy-fixture" };
    });
    assert.deepEqual((await sql`select answers,locale,input_revision,input_hash,health_score from public.assessments where plan_id=${p.planId}::uuid`)[0], saved);
    assert.deepEqual(await sql`select id,task_type from public.tasks where plan_id=${p.planId}::uuid and task_type<>'send_saved_plan_email' order by id`, beforeTasks);
  });
  it("contact PATCH uses display locale without changing calculation inputs, locale or generation tasks", async () => {
    const p = await capture(), sql = getSql()!;
    const [before] = await sql`select answers,input_revision,input_hash,locale,health_score from public.assessments where plan_id=${p.planId}::uuid`;
    const beforeTasks = await sql`select id,task_type from public.tasks where plan_id=${p.planId}::uuid order by id`;
    const response = await updateContactRoute(new Request(`https://dev.mattanutra.com/api/assessment/${p.planId}/contact`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactEmail: "saved@fixture.test", locale: "zh-CN" })
    }), { params: Promise.resolve({ planId: p.planId }) });
    assert.equal(response.status, 200);
    const updated = await response.json(); assert.equal(updated.savedPlanDelivery.locale, "zh-CN");
    const repeated = await updateAssessmentContact(p.planId, "SAVED@fixture.test", undefined, "th");
    assert.equal(repeated.savedPlanDelivery?.id, updated.savedPlanDelivery.id);
    assert.equal(repeated.savedPlanDelivery?.locale, "zh-CN", "First delivery locale stays frozen");
    assert.deepEqual((await sql`select answers,input_revision,input_hash,locale,health_score from public.assessments where plan_id=${p.planId}::uuid`)[0], before);
    assert.deepEqual(await sql`select id,task_type from public.tasks where plan_id=${p.planId}::uuid and task_type<>'send_saved_plan_email' order by id`, beforeTasks);
    await assert.rejects(updateAssessmentContact(p.planId, "other@fixture.test", undefined, "xx"), { code: "invalid_locale" });
    assert.equal((await sql`select contact_email from public.assessments where plan_id=${p.planId}::uuid`)[0].contact_email, "saved@fixture.test");
  });
  it("deduplicates concurrent delivery requests across language and answer revisions", async () => {
    const planId = await seed("same@fixture.test"), sql = getSql()!;
    const receipts = await Promise.all(["en", "th", "zh-CN"].map(locale => requestSavedPlanDelivery(planId, { email: " SAME@fixture.test ", locale })));
    assert.equal(new Set(receipts.map(row => row!.id)).size, 1);
    await sql`update public.assessments set input_revision=input_revision+1 where plan_id=${planId}::uuid`;
    assert.equal((await requestSavedPlanDelivery(planId, { email: "same@fixture.test", locale: "th" }))?.id, receipts[0]!.id);
    assert.equal((await sql`select count(*)::int as n from public.tasks where plan_id=${planId}::uuid`)[0].n, 1);
    assert.equal((await sql`select count(*)::int as n from public.communication_channels c join public.plan_communication_identities i on i.identity_id=c.identity_id where i.plan_id=${planId}::uuid`)[0].n, 1);
  });
  it("supersedes an unsent old address and delivers the exact new address without choosing another channel", async () => {
    const { planId, receipt: old } = await requested("old@fixture.test");
    const updated = await updateAssessmentContact(planId, "new@fixture.test", undefined, "th");
    const channels = await listCommunicationChannels({ planId });
    assert.equal(selectBestCommunicationChannel(channels, "email")?.address, "new@fixture.test");
    assert.equal(channels.find(channel => channel.address === "old@fixture.test")?.status, "disabled");
    let sends = 0;
    assert.equal((await deliverSavedPlan(old.id, async () => { throw new Error("Superseded delivery must not send"); })).status, "superseded");
    const delivered = await deliverSavedPlan(updated.savedPlanDelivery!.id, async input => {
      sends++; assert.equal(input.to, "new@fixture.test"); assert.match(input.html, new RegExp(`/th/nutrition/reveal\\?plan=${planId}`));
      assert.doesNotMatch(input.html, /nutrition\/healthscore|nutrition\/quiz|Private fixture|36-45/);
      assert.equal((await getSql()!`select status from public.saved_plan_delivery_requests where id=${updated.savedPlanDelivery!.id}::uuid`)[0].status, "sending");
      return { sent: true, outcome: "accepted", messageId: "fixture-message" };
    });
    assert.equal(delivered.status, "sent");
    assert.equal((await deliverSavedPlan(delivered.id, async () => { sends++; throw new Error("Already sent"); })).status, "sent");
    assert.equal(sends, 1);
    const [message] = await getSql()!`select status,metadata from public.communication_messages where plan_id=${planId}::uuid and message_type='saved_plan_link'`;
    assert.equal(message.status, "sent"); assert.equal(message.metadata.acceptance, "sent");
    const restored = await updateAssessmentContact(planId, "old@fixture.test", undefined, "zh-CN");
    assert.equal(restored.savedPlanDelivery?.id, old.id); assert.equal(restored.savedPlanDelivery?.locale, "en");
    assert.equal(restored.savedPlanDelivery?.status, "queued");
  });
  it("bounds definite rejection and never retries unknown or crashed SMTP acceptance", async () => {
    const rejected = await requested(); let attempts = 0;
    const reject = async () => { attempts++; return { sent: false, outcome: "rejected" as const, reason: "Mailbox rejected" }; };
    for (let n = 0; n < 3; n++) await assert.rejects(deliverSavedPlan(rejected.receipt.id, reject), /Mailbox rejected/);
    assert.equal((await deliverSavedPlan(rejected.receipt.id, reject)).status, "failed"); assert.equal(attempts, 3);
    for (const mode of ["unknown", "throw", "crashed"] as const) {
      const p = await requested(); let sends = 0;
      if (mode === "crashed") await getSql()!`update public.saved_plan_delivery_requests set status='sending',attempts=1 where id=${p.receipt.id}::uuid`;
      const uncertain = async () => { sends++; if (mode === "throw") throw new Error("Disconnected after DATA");
        return { sent: false, outcome: "unknown" as const, reason: "Acceptance unknown" }; };
      assert.equal((await deliverSavedPlan(p.receipt.id, uncertain)).status, "unknown");
      assert.equal((await deliverSavedPlan(p.receipt.id, uncertain)).status, "unknown");
      assert.equal(sends, mode === "crashed" ? 0 : 1);
    }
  });
  it("concurrent worker replays cannot send the same receipt twice", async () => {
    const p = await requested();
    let entered!: () => void, release!: () => void, sends = 0;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const first = deliverSavedPlan(p.receipt.id, async () => {
      sends++; entered(); await hold;
      return { sent: true, outcome: "accepted", messageId: "concurrent-fixture" };
    });
    try {
      await started;
      const replay = await deliverSavedPlan(p.receipt.id, async () => { sends++; throw new Error("Duplicate SMTP send"); });
      assert.equal(replay.status, "unknown");
    } finally { release(); }
    assert.equal((await first).status, "sent");
    assert.equal(sends, 1);
    assert.equal((await deliverSavedPlan(p.receipt.id, async () => { throw new Error("Already accepted"); })).status, "sent");
  });
  it("keeps the corrected address preferred when an earlier SMTP send completes afterward", async () => {
    const p = await requested("earlier@fixture.test");
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const first = deliverSavedPlan(p.receipt.id, async () => {
      entered(); await hold;
      return { sent: true, outcome: "accepted", messageId: "earlier-fixture" };
    });
    try {
      await started;
      await updateAssessmentContact(p.planId, "corrected@fixture.test");
      assert.equal(selectBestCommunicationChannel(await listCommunicationChannels({ planId: p.planId }), "email")?.address,
        "corrected@fixture.test");
    } finally { release(); }
    assert.equal((await first).status, "sent");
    const channels = await listCommunicationChannels({ planId: p.planId });
    assert.equal(channels.find(channel => channel.address === "earlier@fixture.test")?.status, "disabled");
    assert.equal(selectBestCommunicationChannel(channels, "email")?.address, "corrected@fixture.test");
  });
  it("does not admit invalid pharmacy bindings, legacy web or agentic plans and does not send an outdated recipient", async () => {
    for (const [journey, answers] of [[null, {}], ["web-products-v1", { inStorePharmacy: { id: randomUUID() } }], ["web-products-v1", { channel: "mcp" }],
      [null, { inStorePharmacy: { organisationId: randomUUID(), slug: "fixture-pharmacy" }, source: "mcp" }]] as const) {
      const planId = await seed("excluded@fixture.test", journey, answers);
      assert.equal(await requestSavedPlanDelivery(planId, { email: "excluded@fixture.test" }), null);
      assert.equal((await getSql()!`select count(*)::int as n from public.tasks where plan_id=${planId}::uuid`)[0].n, 0);
    }
    const p = await requested();
    await assert.rejects(requestSavedPlanDelivery(p.planId, { email: "outsider@fixture.test" }), { code: "contact_changed" });
    await getSql()!`update public.assessments set contact_email='corrected@fixture.test' where plan_id=${p.planId}::uuid`;
    assert.equal((await deliverSavedPlan(p.receipt.id, async () => { throw new Error("Old recipient must not send"); })).status, "superseded");
  });
  it("does not admit non-browser pharmacy channels or send them after a queued plan changes channel", async () => {
    const answers = { inStorePharmacy: { organisationId: randomUUID(), slug: "fixture-pharmacy" } };
    for (const channel of ["line", "agent", "api"]) {
      const planId = await seed("excluded@fixture.test", null, answers);
      await getSql()!`update public.assessments set questionnaire_state=${getSql()!.json({ channel })} where plan_id=${planId}::uuid`;
      assert.equal(await requestSavedPlanDelivery(planId, { email: "excluded@fixture.test" }), null);
    }
    const planId = await seed("queued@fixture.test", null, answers);
    const queued = await requestSavedPlanDelivery(planId, { email: "queued@fixture.test" }); assert.ok(queued);
    await getSql()!`update public.assessments set questionnaire_state='{"channel":"agent"}' where plan_id=${planId}::uuid`;
    assert.equal((await deliverSavedPlan(queued.id, async () => { assert.fail("Agentic plan must not send"); })).status, "superseded");
  });
  it("rolls back contact, communications identity, receipt and task together", async () => {
    const planId = await seed("before@fixture.test"), sql = getSql()!;
    await assert.rejects(withDatabaseTransaction(sql, async () => {
      await updateAssessmentContact(planId, "after@fixture.test");
      throw new Error("Interrupted contact transaction");
    }), /Interrupted contact transaction/);
    assert.equal((await sql`select contact_email from public.assessments where plan_id=${planId}::uuid`)[0].contact_email, "before@fixture.test");
    for (const table of ["saved_plan_delivery_requests", "plan_communication_identities", "tasks"] as const) {
      assert.equal((await sql`select count(*)::int as n from ${sql(table)} where plan_id=${planId}::uuid`)[0].n, 0);
    }
  });
  it("renders localized saved-plan links without claiming generation has finished", () => {
    for (const locale of ["en", "th", "zh-CN"] as const) {
      const message = savedPlanDeliveryEmail(locale, "fixture-plan");
      assert.match(message.html, new RegExp(`/${locale}/nutrition/reveal\\?plan=fixture-plan`));
      assert.ok(message.subject); assert.ok(message.body); assert.doesNotMatch(message.html, /HealthScore/);
    }
    assert.match(savedPlanDeliveryEmail("en", "fixture-plan").body, /still being prepared/);
    assert.match(savedPlanDeliveryEmail("th", "fixture-plan").subject, /ของคุณ/);
    assert.match(savedPlanDeliveryEmail("zh-CN", "fixture-plan").subject, /\p{Script=Han}/u);
    for (const locale of ["en", "th", "zh-CN"] as const) {
      const message = savedPlanDeliveryEmail(locale, "fixture-plan", { inStorePharmacy: { organisationId: randomUUID(), slug: "delight-pharmacy" } });
      const link = messageLink(message.html);
      assert.equal(link.pathname, `/${locale}/retail/delight/reveal`);
      assert.equal(link.searchParams.get("source"), "unknown", "Historical pharmacy links must not invent an in-store source");
    }
  });
});
