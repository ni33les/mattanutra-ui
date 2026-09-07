import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { installGoldCatalogue, uninstallGoldCatalogue } from './helpers/gold-catalogue.ts';
import { fixtureSnapshot } from '../lib/agentic/catalogue/fixtures.ts';
import { replaceCatalogueSnapshot } from '../lib/agentic/catalogue/snapshot.ts';
import { createMemoryStore } from '../lib/agentic/store/memory.ts';
import type { AgenticStore } from '../lib/agentic/store/types.ts';
import { loadAgenticConfig } from '../lib/agentic/config.ts';
import { planTool, setMatcherEnteredForTests, setMatcherGateForTests } from '../lib/agentic/plan/service.ts';

it('V5-PUBLISH-01: a catalogue change during matching cannot publish ready; retry resumes the same assessment revision', async () => {
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
    const work = planTool({ config, now: '2026-09-07T00:00:00Z', payload, scope, store });
    await Promise.race([ready, work.then(() => { throw Error('Matching ended before the catalogue-change gate'); })]);
    epoch += 1; release();
    const stale = await work;
    assert.equal(stale.ok, false);
    assert.equal('error' in stale && stale.error.reasonCode, 'availability_changed');
    assert.equal('error' in stale && stale.error.retryable, true);
    const ids = await store.listPlanIdsByPrincipal(principalScope);
    assert.equal(ids.length, 1);
    assert.equal((await store.getPlanRevision(ids[0]!, 1))?.status, 'processing');
    setMatcherGateForTests(null); setMatcherEnteredForTests(null);
    replaceCatalogueSnapshot({ ...fixtureSnapshot(), runtimeRevision: epoch });
    const recovered = await planTool({ config, now: '2026-09-07T00:00:01Z', payload, scope, store });
    assert.equal(recovered.ok, true);
    assert.equal('status' in recovered && recovered.status, 'ready');
    assert.equal('revision' in recovered && recovered.revision, 1);
    assert.deepEqual(await store.listPlanIdsByPrincipal(principalScope), ids);
  } finally {
    release?.(); setMatcherGateForTests(null); setMatcherEnteredForTests(null); uninstallGoldCatalogue();
  }
});
