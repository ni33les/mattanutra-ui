import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, after } from "node:test";
import postgres from "postgres";
import { createPostgresStore } from "../../lib/agentic/store/postgres.ts";
import { runtime, rpc } from "../ax-refinement/helpers.ts";
import { issueCapability } from "../../lib/agentic/capabilities.ts";
import { closeSqlPool, withDatabaseTransaction } from "../../lib/db.ts";
import { fixtureDatabaseUrl } from "../helpers/fixture-teardown.ts";
import { internalFixture } from "../mcp-conversation-pack/helpers.ts";
import { pinCatalogueSnapshot, resetCataloguePins } from "../../lib/agentic/catalogue/pin.ts";
import { businessError } from "../../lib/agentic/contract/errors.ts";
const url = fixtureDatabaseUrl();
const sql = postgres(url.href, { max: 2, prepare: false });
after(async () => { resetCataloguePins(); await sql.end(); await closeSqlPool(); });

test("PAY-POLL-03 PostgreSQL freshness and pending failure versions use the durable store and preserve the committed result", async () => {
  const rollback = new Error("Restore isolated polling fixture");
  await assert.rejects(withDatabaseTransaction(sql, async tx => {
  const store = createPostgresStore(tx), app = runtime("payload-postgres", store), planId = randomUUID(), operationId = randomUUID();
  const now = "2026-09-07T00:00:00Z";
  const pinned = pinCatalogueSnapshot({ runtimeRevision: 99, products: [], supplements: [], catalogueVersion: "frozen-payload", availabilityAsOf: now }, "6.0.0");
  const snapshotId = pinned.snapshotId;
  await tx`insert into public.catalogue_runtime_revision values (true,99) on conflict(singleton) do update set revision=99`;
  await store.insertCatalogueSnapshot(snapshotId, { runtimeRevision: 99, products: [], supplements: [], catalogueVersion: "frozen-payload", availabilityAsOf: now });
  await store.insertPlan({ id: planId, currentRevision: 1, createdAt: now, updatedAt: now, ...app.scope });
  const original = internalFixture();
  const result = { ...original, summary: "Last committed plan", selected: { ...original.selected!, snapshotId }, matcherTelemetry: { ...original.matcherTelemetry!, snapshotId } };
  const revision = { planId, revision: 1, status: "ready" as const, result, requestSnapshot: result.requestSnapshot, catalogueVersion: "frozen-payload", guidanceRulesVersion: "6.0.0", availabilityAsOf: now, createdAt: now };
  await store.insertPlanRevision(revision);
  const { handle } = await issueCapability({ allowedActions: ["plan.read"], config: app.config, now, resourceId: planId, resourceType: "plan", scope: app.scope, store });
  const args = { planHandle: handle };
  const initial = await rpc(app, "plan", args); assert.equal(initial.ok, true); assert.equal(initial.refreshRequired ?? false, false, JSON.stringify(initial));
  await tx`update public.catalogue_runtime_revision set revision=100 where singleton=true`;
  const stale = await rpc(app, "plan", args);
  assert.equal(stale.ok, true); assert.equal(stale.refreshRequired, true);
  const failed = { id: operationId, planId, ownerScope: "payload-postgres", key: "failed-refinement", requestHash: "frozen", expectedRevision: 1, revision: 2, taskId: randomUUID(), status: "failed", version: 2, leaseToken: null, leaseExpiresAt: null, createdAt: now, updatedAt: now, command: { payload: {}, prepared: {}, scope: app.scope }, checkpoint: null, catalogueIdentity: null, referenceIdentity: null, response: null, error: businessError({ reasonCode: "temporarily_unavailable", message: "Isolated dependency failure" }) };
  await tx`insert into public.agentic_plan_operations(id,plan_id,owner_scope,idempotency_key,status,version,record_json,created_at,updated_at) values (${operationId},${planId},${failed.ownerScope},${failed.key},'failed',2,${tx.json(failed)},${now},${now})`;
  const polls = await Promise.all([rpc(app, "plan", args), rpc(app, "plan", args)]);
  for (const poll of polls) { assert.equal(poll.ok, true); assert.equal(poll.status, "failed"); assert.equal(poll.nextAction, "change_request"); assert.match(String(poll.summary), /scoring/); }
  assert.deepEqual(polls[0], polls[1]);
  assert.equal((await store.getPlanOperation(operationId))?.error?.error.message, "Isolated dependency failure");
  assert.deepEqual((await store.getPlanRevision(planId, 1))?.result, result);
  const unauthorized = runtime("postgres-other-owner", store);
  assert.equal((await rpc(unauthorized, "plan", args)).ok, false);
  throw rollback;
  }), error => { if (error !== rollback) throw error; return true; });
});
