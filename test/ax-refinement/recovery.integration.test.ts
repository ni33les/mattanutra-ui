import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import postgres from "postgres";
import { closeSqlPool } from "../../lib/db.ts";
import { createPostgresStore } from "../../lib/agentic/store/postgres.ts";
import { runAdmittedPlanOperation, resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { replaceCatalogueSnapshot } from "../../lib/agentic/catalogue/snapshot.ts";
import { useLiveServiceClock } from "../../lib/agentic/qa/service-clock.ts";
import { setMatcherSafetyCeilings } from "../../lib/matcher/safety-ceilings.ts";
import { profile, runtime, rpc, installRealCatalogue, uninstallRealCatalogue } from "./helpers.ts";

assert.ok(process.env.TEST_DB_URL, "An isolated database is required; never skip recovery");
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/);
assert.ok(url.port && url.port !== "5432");
const sql = postgres(url.href, { max: 3, prepare: false });
after(async () => { resetPlanCreateInflightForTests(); uninstallRealCatalogue(); await sql.end(); await closeSqlPool(); });

test("AXR-REL-03 expanded PostgreSQL refinement resumes a lost checkpoint at a refreshed observation clock", { timeout: 90000 }, async () => {
  process.env.AX_REFINEMENT_REAL_WORKERS = "1";
  const frozen = await installRealCatalogue("dev"); useLiveServiceClock();
  const [epoch] = await sql`select revision from public.catalogue_runtime_revision where singleton=true`;
  assert.ok(epoch);
  const snapshot = { ...frozen.snapshot, runtimeRevision: Number(epoch.revision) };
  replaceCatalogueSnapshot(snapshot);
  setMatcherSafetyCeilings(frozen.ceilings, { runtimeRevision: snapshot.runtimeRevision, fingerprint: String(frozen.provenance.reconstructedReferenceFingerprint) });
  const store = createPostgresStore(sql), principal = `pg-recovery-${randomUUID()}`;
  const instance = runtime(principal, store), ownerScope = `dev:mattanutra:ax-refinement:${principal}`;
  await rpc(instance, "plan", { operation: "create", idempotencyKey: "ax-pg-recovery-create", request: profile("A6") });
  const created = await store.getPlanOperationByKey(ownerScope, "ax-pg-recovery-create"); assert.ok(created);
  const first = await runAdmittedPlanOperation({ store, config: instance.config, operationId: created.id });
  assert.equal(first.ok, true, JSON.stringify(first)); assert.equal(first.revision, 1);
  const previous = await store.getPlanRevision(created.planId, 1);
  const patch = store.patchClaimedOperation!.bind(store);
  let interrupted = false;
  // Checkpoints now use the atomic conditional write directly. Interrupt that
  // same durable boundary; retain the historical 24k + 4k recovery assertion.
  store.patchClaimedOperation = async (id, token, changes, now, expiry) => {
    const checkpoint = changes.checkpoint as { search?: { cursor?: string | Uint8Array; expansionAttempts: number } } | null;
    if (!interrupted && checkpoint?.search?.cursor && checkpoint.search.expansionAttempts === 28000) {
      interrupted = true; throw new Error("Injected checkpoint statement_timeout");
    }
    return patch(id, token, changes, now, expiry);
  };
  const args = { operation: "revise", responseView: "full", planHandle: first.planHandle, expectedRevision: 1,
    idempotencyKey: "ax-pg-recovery-expanded", searchEffort: "expanded", request: profile("A2") };
  await rpc(instance, "plan", args);
  const admitted = await store.getPlanOperationByKey(ownerScope, args.idempotencyKey); assert.ok(admitted);
  const failed = await runAdmittedPlanOperation({ store, config: instance.config, operationId: admitted.id });
  assert.equal(interrupted, true); assert.equal(failed.ok, false);
  assert.equal((await store.getPlanOperation(admitted.id))?.status, "retryable");
  assert.deepEqual(await store.getPlanRevision(created.planId, 1), previous);
  const checkpoint = (await store.getPlanOperation(admitted.id))?.checkpoint as { reservedAttempts: number; search: { expansionAttempts: number } };
  assert.equal(checkpoint.reservedAttempts, 4000); assert.equal(checkpoint.search.expansionAttempts, 24000);
  store.patchClaimedOperation = patch;
  replaceCatalogueSnapshot({ ...snapshot, availabilityAsOf: "2026-09-08T03:29:00Z" });
  await rpc(instance, "plan", args);
  const recovered = await runAdmittedPlanOperation({ store, config: instance.config, operationId: admitted.id });
  assert.equal(recovered.ok, true, JSON.stringify(recovered)); assert.equal(recovered.revision, 2);
  assert.equal(recovered.searchSummary.effort, "expanded"); assert.equal(recovered.searchSummary.expansionAttempts, 64000);
  assert.equal(recovered.searchSummary.expansionBudget, 64000);
  assert.equal((await store.getPlanOperationByKey(ownerScope, args.idempotencyKey))?.id, admitted.id);
  assert.deepEqual(await rpc(instance, "plan", args), recovered);
  assert.equal((await store.getPlan(created.planId))?.currentRevision, 2);
});
