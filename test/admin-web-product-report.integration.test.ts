import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, it, mock } from "node:test";
import type postgres from "postgres";
import { fixtureDatabaseUrl } from "./helpers/fixture-teardown.ts";
import { emptyAdminDashboardFilters } from "../lib/admin-dashboard-filters.ts";

fixtureDatabaseUrl();
const db = await import("../lib/db.ts"), sql = db.getSql()!;
let scoped: postgres.Sql | postgres.TransactionSql = sql;
mock.module("../lib/db.ts", { namedExports: { ...db, getSql: () => scoped } });
const { getWebProductReport } = await import("../lib/admin-web-product-report.ts");
const { getAdminExternalQueryData } = await import("../lib/admin-query-data.ts");
after(db.closeSqlPool);

async function transaction(test: (tx: postgres.TransactionSql) => Promise<void>) {
  const rollback = new Error("rollback fixture");
  try { await sql.begin(async tx => { scoped = tx; await test(tx); throw rollback; }); }
  catch (error) { if (error !== rollback) throw error; }
  finally { scoped = sql; }
}

it("composes the report through the instrumented pool used by the dashboard", async () => {
  // Transaction-scoped fixtures bypass the pool's executable-query wrapper.
  // Exercise the real pool so nested SELECT fragments cannot become parameters.
  assert.equal(scoped, sql);
  const report = await getWebProductReport(null, { ...emptyAdminDashboardFilters, campaign: `fixture-empty-${randomUUID()}` });
  assert.ok(report);
  assert.deepEqual(report.generation.map(({ tasks }) => tasks), [0, 0]);
  assert.equal(report.sales.paidPayments, 0);
  assert.deepEqual(report.campaigns, []);
});

it("reports formula and product task lifecycle, retry/error counts, and elapsed percentiles independently", async () => transaction(async tx => {
  const campaign = `fixture-generation-${randomUUID()}`, planId = randomUUID();
  const [organisation] = await tx`select id from public.organisations where slug='mattanutra'`;
  await tx`insert into public.assessments(plan_id,locale,answers,acquisition_attribution)
    values(${planId}::uuid,'en','{}',${tx.json({ attribution: { utmCampaign: campaign, utmSource: "meta" } })})`;
  async function task(type: string, status: string, seconds: number, attempts = 1, created = "2026-10-18T00:00:00Z") {
    const id = randomUUID();
    await tx`insert into public.tasks(id,organisation_id,plan_id,task_group_id,task_type,title,status,attempts,created_at,completed_at)
      values(${id}::uuid,${organisation.id}::uuid,${planId}::uuid,${id}::uuid,${type},'Fixture',${status},${attempts},
        ${created}::timestamptz,case when ${status}='completed' then ${created}::timestamptz+${seconds}*interval '1 second' else null end)`;
    return id;
  }
  await task("generate_supplement_guidance", "completed", 10);
  await task("generate_supplement_guidance", "completed", 30);
  const failed = await task("generate_supplement_guidance", "failed", 0, 3);
  await task("generate_supplement_guidance", "queued", 0, 0);
  await task("generate_product_recommendations", "completed", 60);
  await task("generate_product_recommendations", "running", 0);
  await task("generate_product_recommendations", "completed", 999, 1, "2026-09-01T00:00:00Z");
  for (let index = 0; index < 2; index++) await tx`insert into public.task_events(id,task_id,event_type,event_status)
    values(${randomUUID()}::uuid,${failed}::uuid,'task_attempt_failed','failed')`;
  const report = await getWebProductReport("2026-10-01", { ...emptyAdminDashboardFilters, campaign });
  assert.ok(report);
  assert.deepEqual(report.generation, [
    { stage: "formula", tasks: 4, queued: 1, running: 0, completed: 2, failed: 1, review: 0, cancelled: 0,
      retries: 2, errorEvents: 2, timedCompletions: 2, medianSeconds: 20, p90Seconds: 28 },
    { stage: "products", tasks: 2, queued: 0, running: 1, completed: 1, failed: 0, review: 0, cancelled: 0,
      retries: 0, errorEvents: 0, timedCompletions: 1, medianSeconds: 60, p90Seconds: 60 }
  ]);
  assert.equal((await getWebProductReport(null, { ...emptyAdminDashboardFilters, campaign, locale: "th" }))?.generation[0].tasks, 0);
}));

it("reconciles persisted live sales without events, deduplicates orders, and excludes mock/internal/non-web evidence", async () => transaction(async tx => {
  const campaign = `fixture-sales-${randomUUID()}`, planId = randomUUID(), legacy = randomUUID();
  const [organisation] = await tx`select id from public.organisations where slug='mattanutra'`;
  const acquisition = { attribution: { utmSource: "meta", utmMedium: "paid_social", utmCampaign: campaign }, ray: randomUUID() };
  for (const id of [planId, legacy]) await tx`insert into public.assessments(plan_id,locale,answers,acquisition_attribution)
    values(${id}::uuid,'en','{}',${tx.json(id === planId ? acquisition : {})})`;
  await tx`insert into public.bpm(id,ray,plan_id,event_name,event_type,event_status,utm_source,utm_medium,utm_campaign)
    values(${randomUUID()}::uuid,${randomUUID()}::uuid,${legacy}::uuid,'assessment_captured','funnel','observed','meta','paid_social',${campaign})`;
  const orderId = randomUUID();
  await tx`insert into public.retail_customer_orders(id,organisation_id,order_number,source,status,currency)
    values(${orderId}::uuid,${organisation.id}::uuid,${`FIXTURE-${orderId}`},'checkout','delivered','THB')`;
  async function payment(input: { mode?: string; metadata?: Record<string, unknown>; paid?: boolean; status?: string; plan?: string; order?: string } = {}) {
    const id = randomUUID();
    await tx`insert into public.retail_checkout_payments(id,plan_id,locale,status,amount,currency,stripe_mode,idempotency_key,metadata,paid_at,retail_customer_order_id)
      values(${id}::uuid,${input.plan ?? planId}::uuid,'en',${input.status ?? "paid"},100000000,'THB',${input.mode ?? "live"},${id},
        ${tx.json(input.metadata ?? {})},case when ${input.paid !== false} then now() else null end,${input.order ?? null}::uuid)`;
    return id;
  }
  const paid = await payment({ order: orderId });
  await payment({ status: "fulfillment_failed" });
  await payment({ plan: legacy });
  await payment({ mode: "test" }); await payment({ mode: "mock" });
  await payment({ metadata: { internal_test: true } }); await payment({ metadata: { internal_test: "1" } });
  await payment({ metadata: { channel: "mcp" } });
  await payment({ paid: false });
  const testOrder = randomUUID();
  await tx`insert into public.retail_customer_orders(id,organisation_id,order_number,source,status,currency,metadata)
    values(${testOrder}::uuid,${organisation.id}::uuid,${`FIXTURE-${testOrder}`},'checkout','delivered','THB','{"internal_test":true}')`;
  await payment({ order: testOrder });
  await payment({ metadata: { acquisitionAttribution: { attribution: { utmCampaign: "different-campaign" } } } });
  async function event(paymentId: string, extra: Record<string, unknown> = {}) {
    await tx`insert into public.bpm(id,ray,plan_id,event_name,event_type,event_status,utm_source,utm_medium,utm_campaign,properties)
      values(${randomUUID()}::uuid,${randomUUID()}::uuid,${planId}::uuid,'retail_product_payment_succeeded','payment','paid','meta','paid_social',${campaign},
        ${tx.json({ checkoutPaymentId: paymentId, stripeMode: "live", ...extra })})`;
  }
  await event(paid); await event(paid); await event(randomUUID()); await event(randomUUID(), { stripeMode: "test" });
  const report = await getWebProductReport(null, { ...emptyAdminDashboardFilters, campaign });
  assert.ok(report);
  assert.deepEqual(report.sales, { paidPayments: 3, paidJourneys: 2, orders: 1, shipped: 1, delivered: 1,
    cancelled: 0, returned: 0, fulfillmentFailed: 1, paidWithoutOrder: 2, paymentsWithEvent: 1, paymentsMissingEvent: 2,
    revenue: [{ currency: "THB", amountMicros: "300000000" }], paymentEvents: 3, eventPaymentIds: 2, eventsWithoutPaidPayment: 1 });
  assert.equal(report.campaigns.length, 1);
  assert.equal(report.campaigns[0].paidPayments, 3);
  assert.equal(report.campaigns[0].source, "meta");
  assert.equal((await getWebProductReport(null, { ...emptyAdminDashboardFilters, campaign, planId: legacy }))?.sales.paidPayments, 1);
  const campaignQuery = await getAdminExternalQueryData("campaigns", new URLSearchParams({ range: "all", campaign }));
  const campaignData = campaignQuery.data as { summary: { paidProductPayments: number; paidProductOrders: number }; rows: Array<{ paidProductPayments?: number }> };
  assert.equal(campaignData.summary.paidProductPayments, 3);
  assert.equal(campaignData.summary.paidProductOrders, 1);
  assert.equal(campaignData.rows.reduce((total, row) => total + (row.paidProductPayments ?? 0), 0), 3);
  const eventless = await getAdminExternalQueryData("campaigns", new URLSearchParams({ range: "all", campaign: "different-campaign" }));
  const eventlessData = eventless.data as { summary: { paidProductPayments: number }; rows: Array<{ paidProductPayments?: number; landed: number }> };
  assert.equal(eventlessData.summary.paidProductPayments, 1);
  assert.equal(eventlessData.rows[0].paidProductPayments, 1, "A campaign with no BPM events still has its durable sale row");
  assert.equal(eventlessData.rows[0].landed, 0, "A payment must not manufacture a visit");
}));
