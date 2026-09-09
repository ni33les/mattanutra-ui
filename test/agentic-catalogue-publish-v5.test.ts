import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { installGoldCatalogue, uninstallGoldCatalogue } from './helpers/gold-catalogue.ts';
import { fixtureSnapshot } from '../lib/agentic/catalogue/fixtures.ts';
import { replaceCatalogueSnapshot } from '../lib/agentic/catalogue/snapshot.ts';
import { createMemoryStore } from '../lib/agentic/store/memory.ts';
import type { AgenticStore } from '../lib/agentic/store/types.ts';
import { loadAgenticConfig } from '../lib/agentic/config.ts';
import { planTool, runAdmittedPlanOperation, setMatcherEnteredForTests, setMatcherGateForTests } from '../lib/agentic/plan/service.ts';

it('V5-PUBLISH-01: a catalogue-only change preserves the completed snapshot and marks its read as stale', async () => {
  installGoldCatalogue();
  let epoch = 11;
  const base = createMemoryStore();
  const wrap = (store: AgenticStore): AgenticStore => ({ ...store,
    transaction: work => store.transaction(tx => work(wrap(tx))),
    async isCatalogueRevisionCurrent(expected: number) { return expected === epoch; }
  });
  const store = wrap(base);
  const principalScope = `publish-v5:${randomUUID()}`;
  const config = { ...loadAgenticConfig(), capabilitySecret: 'publish-fence-fixture-secret-0001', paymentProvider: 'mock' as const, thailandRetailerAdapter: 'mock_thailand' as const };
  const scope = { environment: 'dev' as const, tenantScope: 'mattanutra', principalScope };
  const payload = { operation: 'create' as const, idempotencyKey: `publish-${randomUUID()}`, request: { destinationCountry: 'TH', locale: 'en', optimization: 'balanced', profile: { ageYears: 38, lifeStage: 'adult' }, requirements: {}, targets: [{ name: 'Vitamin D3', amount: 1000, unit: 'IU' }] } };
  let release!: () => void, entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  setMatcherGateForTests(new Promise<void>(resolve => { release = resolve; }));
  setMatcherEnteredForTests(entered);
  try {
    replaceCatalogueSnapshot({ ...fixtureSnapshot(), runtimeRevision: epoch });
    const admitted = await planTool({ config, now: '2026-09-07T00:00:00Z', payload, scope, store });
    assert.equal(admitted.ok, true);
    const operation = await store.getPlanOperationByKey(`dev:mattanutra:${principalScope}`, payload.idempotencyKey); assert.ok(operation);
    const work = runAdmittedPlanOperation({ config, store, operationId: operation.id });
    await Promise.race([ready, work.then(() => { throw Error('Matching ended before the catalogue-change gate'); })]);
    epoch += 1; release();
    const stale = await work;
    assert.equal(stale.ok, true, JSON.stringify(stale));
    const ids = await store.listPlanIdsByPrincipal(principalScope);
    assert.equal(ids.length, 1);
    const revision = await store.getPlanRevision(ids[0]!, 1); assert.equal(revision?.status, 'ready');
    assert.equal((await store.getPlanOperation(operation.id))?.status, 'complete');
    const {readPlanStatus}=await import('../lib/agentic/presentation/plan-read.ts');
    const {createAgenticRuntime}=await import('../lib/agentic/runtime.ts');
    const read = store.getPlanReadState.bind(store);
    store.getPlanReadState = async (...args) => { const state=await read(...args); return state ? {...state,catalogueRevision:epoch}:state; };
    const status=await readPlanStatus(createAgenticRuntime({config,store,scope,now:'2026-09-07T00:00:01Z'}), admitted.ok ? admitted.planHandle : '');
    assert.ok(status.ok && status.refreshRequired); assert.equal(status.status,'needs_input');
    assert.equal(status.nextActions[0],'change_request');
    assert.equal((await store.getPlanRevision(ids[0]!,1))?.status,'ready','Reading stale data must not overwrite the saved result');
  } finally {
    release?.(); setMatcherGateForTests(null); setMatcherEnteredForTests(null); uninstallGoldCatalogue();
  }
});
