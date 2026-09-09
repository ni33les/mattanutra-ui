import { measureDatabaseTraffic } from "./database-traffic.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function openMeasuredDatabase(load) {
  const { default: postgres } = await load("node_modules/postgres/src/index.js");
  const url = new URL(process.env.TEST_DB_URL); assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/);
  const raw = postgres(url.href, { max: 3, prepare: false });
  const traffic = measureDatabaseTraffic(raw), sql = traffic.sql, db = await load("lib/db.ts");
  const old = db.getSql(); await old?.end(); globalThis.mattanutraSql = sql;
  return { ...traffic, raw, close: async () => { await db.closeSqlPool(); await raw.end(); } };
}
export function comparableStatus(value) {
  const result = { ...value }; delete result.planId; delete result.planHandle; delete result.resultVersion; return result;
}
export async function seedPlanReader(load, sql) {
  const { createPostgresStore } = await load("lib/agentic/store/postgres.ts");
  const { issueCapability } = await load("lib/agentic/capabilities.ts");
  const { internalFixture } = await load("test/mcp-conversation-pack/helpers.ts");
  const { handleJsonRpc } = await load("lib/agentic/mcp/dispatcher.ts");
  const { runtime } = await load("test/ax-refinement/helpers.ts");
  const store = createPostgresStore(sql), app = runtime("eff-benchmark", store), planId = randomUUID(), input = internalFixture();
  await store.insertPlan({ id: planId, currentRevision: 1, ...app.scope, createdAt: app.now, updatedAt: app.now });
  await store.insertPlanRevision({ planId, revision: 1, result: input, requestSnapshot: input.requestSnapshot, status: input.status,
    createdAt: app.now, availabilityAsOf: app.now, catalogueVersion: "fixture", guidanceRulesVersion: "unchanged" });
  const { handle } = await issueCapability({ config: app.config, store, scope: app.scope, now: app.now, resourceId: planId, resourceType: "plan", allowedActions: ["plan.read"] });
  let version;
  return { input, poll: async () => {
    const reply = await handleJsonRpc(app, { id: 1, method: "tools/call", params: { name: "plan", arguments: { operation: "get", planHandle: handle, responseView: "status", ...(version ? { knownResultVersion: version } : {}) } } });
    const value = reply?.result?.structuredContent; assert.equal(value?.ok, true); version = value.resultVersion; return value;
  } };
}
export async function seedFunnelReader(load, sql, hash) {
  const { persistAssessmentSubmission, toJsonValue } = await load("lib/assessment-store.ts");
  const { createAssessmentSnapshot } = await load("lib/assessment-snapshot.ts");
  const { completeHealthScoreFixture } = await load("test/fixtures/healthscore.ts");
  const { FUNNEL_GENERATOR_VERSION } = await load("lib/assessment-revisions.ts");
  const { getFunnelReadiness } = await load("lib/funnel-readiness.ts");
  const planId = randomUUID(), score = completeHealthScoreFixture("en"), answers = { firstName: "Efficiency fixture", sex: "male", age: "36-45", goals: ["energy"], activity: "light" };
  await persistAssessmentSubmission({ answers, locale: "en", status: "captured", selectedPlan: "precision", snapshot: createAssessmentSnapshot({ planId, healthScore: score }) });
  await sql`insert into public.assessment_healthscore_results(plan_id,revision,locale,generator_version,result,read_projection)
    values(${planId}::uuid,1,'en',${FUNNEL_GENERATOR_VERSION},${sql.json(toJsonValue(score))},${sql.json({ version: 1, resultHash: hash(score), ready: { en: true, th: false, "zh-CN": false } })})`;
  // Freeze the same admitted pending work before either implementation polls.
  const { recoverMissingFunnelGeneration } = await load("lib/funnel-generation-recovery.ts");
  await recoverMissingFunnelGeneration({ planId, locale: "en", healthScoreMissing: false, formulationMissing: true });
  return { input: { answers, score }, poll: async () => { const value = await getFunnelReadiness(planId, "en", sql); assert.ok(value?.copyReady); return value; } };
}
