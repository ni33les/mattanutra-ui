import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import postgres from 'postgres';
import { fixtureSnapshot } from '../../lib/agentic/catalogue/fixtures.ts';
import { replaceCatalogueSnapshot } from '../../lib/agentic/catalogue/snapshot.ts';
import { resetCataloguePins } from '../../lib/agentic/catalogue/pin.ts';
import { createPostgresStore } from '../../lib/agentic/store/postgres.ts';
import { closeSqlPool } from '../../lib/db.ts';
import { runAdmittedPlanOperation } from '../../lib/agentic/plan/service.ts';
import { setMatcherSafetyCeilings, resetMatcherSafetyCeilings } from '../../lib/matcher/safety-ceilings.ts';
import { rpc, runtime, uninstallRealCatalogue } from '../ax-refinement/helpers.ts';
import type { PlanResult } from '../../lib/agentic/plan/types.ts';

assert.ok(process.env.TEST_DB_URL, 'Configured-limit recovery requires isolated PostgreSQL');
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, '127.0.0.1'); assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/);
assert.notEqual(url.port, '5432');
const sql = postgres(url.href, { max: 3, prepare: false });
const originalCheckpoints = process.env.MATCHER_DURABLE_CHECKPOINTS_ENABLED;
const originalWorkers = process.env.AX_REFINEMENT_REAL_WORKERS;
after(async () => {
  if (originalCheckpoints === undefined) delete process.env.MATCHER_DURABLE_CHECKPOINTS_ENABLED;
  else process.env.MATCHER_DURABLE_CHECKPOINTS_ENABLED = originalCheckpoints;
  if (originalWorkers === undefined) delete process.env.AX_REFINEMENT_REAL_WORKERS;
  else process.env.AX_REFINEMENT_REAL_WORKERS = originalWorkers;
  uninstallRealCatalogue(); await sql.end(); await closeSqlPool();
});

test('CFG-LIMIT-PG-01 interrupted operation and durable replay preserve the original configured adjustment', { timeout: 60000 }, async () => {
  process.env.MATCHER_DURABLE_CHECKPOINTS_ENABLED = 'true';
  process.env.AX_REFINEMENT_REAL_WORKERS = '1';
  const [epoch] = await sql`select revision from catalogue_runtime_revision where singleton=true`;
  const snapshot = { ...fixtureSnapshot(), runtimeRevision: Number(epoch.revision) };
  replaceCatalogueSnapshot(snapshot);
  const nutrient = snapshot.supplements.find(row => row.name === 'Vitamin D3')!;
  const ceiling = { subjectId: nutrient.supplementId, name: nutrient.name, maxAmount: 50, maxUnit: 'mcg' as const,
    sourceScope: 'supplemental' as const, lifeStage: 'adult' as const, bandId: 'configured-pg-fixture', bandVersion: 1 };
  const fingerprint = 'a'.repeat(64);
  setMatcherSafetyCeilings([ceiling], { runtimeRevision: snapshot.runtimeRevision, fingerprint });
  const store = createPostgresStore(sql), principal = `configured-limits-pg-${randomUUID()}`;
  const app = runtime(principal, store);
  const key = randomUUID();
  const input = { locale: 'en', destinationCountry: 'TH', idempotencyKey: key, profile: { ageYears: 35, lifeStage: 'adult' },
    currentSupplements: [], intake: [{ name: 'D3', source: 'diet', certainty: 'known', amount: 0, unit: 'IU' }],
    targets: [{ name: 'D3', amount: 4000, unit: 'IU', basis: 'supplemental' }] };
  const admitted = await rpc(app, 'plan', input); assert.equal(admitted.status, 'processing');
  const operation = await store.getPlanOperationByKey(`dev:mattanutra:ax-refinement:${principal}`, key); assert.ok(operation);
  const patch = store.patchClaimedOperation!.bind(store);
  let interrupted = false;
  store.patchClaimedOperation = async (id, token, changes, now, expiry) => {
    const checkpoint = changes.checkpoint as { search?: { expansionAttempts: number } } | null;
    if (!interrupted && checkpoint?.search) {
      interrupted = true; throw new Error('Injected configured-limit worker interruption');
    }
    return patch(id, token, changes, now, expiry);
  };
  const failed = await runAdmittedPlanOperation({ config: app.config, store, operationId: operation.id });
  assert.ok(interrupted, 'Exercise the worker dispatch interruption'); assert.equal(failed.ok, false);
  const stopped = await store.getPlanOperation(operation.id); assert.equal(stopped?.status, 'retryable');
  assert.equal(stopped?.referenceIdentity, fingerprint);
  store.patchClaimedOperation = patch;
  resetCataloguePins(); resetMatcherSafetyCeilings();
  setMatcherSafetyCeilings([{ ...ceiling, maxAmount: 100, bandVersion: 2 }], {
    runtimeRevision: snapshot.runtimeRevision + 1, fingerprint: 'b'.repeat(64)
  });
  const recovered = await runAdmittedPlanOperation({ config: app.config, store, operationId: operation.id });
  assert.equal(recovered.ok, true, JSON.stringify(recovered));
  const saved = await store.getPlanRevision(operation.planId, 1); assert.ok(saved);
  const result = saved.result as PlanResult;
  assert.equal(result.requestSnapshot.targets[0].amount, 2000);
  assert.equal(result.requestSnapshot.originalRequest!.targets[0].amount, 4000);
  assert.equal(result.requestSnapshot.targetLimitAdjustments?.[0].bandVersion, 1);
  assert.equal(result.coverage[0].remainingGap, 0);
  // A new store instance reads only PostgreSQL JSON, after process caches were cleared.
  const restarted = runtime(principal, createPostgresStore(sql));
  const read = await rpc(restarted, 'plan', { planHandle: admitted.planHandle });
  assert.match(JSON.stringify(read.requestIssues), /4000 IU.*2000 IU/);
  assert.deepEqual(await rpc(restarted, 'plan', input), read);
});
