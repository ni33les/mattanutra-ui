import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createSnapshotMemoryStore } from './agentic/value/snapshot-store.ts';
import { createMemoryStore } from '../lib/agentic/store/memory.ts';
import { fixtureSnapshot } from '../lib/agentic/catalogue/fixtures.ts';
import { runWithCatalogueSnapshot } from '../lib/agentic/catalogue/snapshot.ts';
import { installGoldCatalogue, uninstallGoldCatalogue } from './helpers/gold-catalogue.ts';
import { loadAgenticConfig } from '../lib/agentic/config.ts';
import { planTool } from '../lib/agentic/plan/service.ts';

it('V5-CV-STORE-01: frozen memory fixtures validate their exact epoch only inside a transaction', async () => {
  const snapshot = { runtimeRevision: 12 };
  const store = createSnapshotMemoryStore(snapshot);
  await assert.rejects(store.isCatalogueRevisionCurrent!(12), /require a transaction/);
  await store.transaction(async tx => {
    assert.equal(await tx.isCatalogueRevisionCurrent!(12), true);
    assert.equal(await tx.isCatalogueRevisionCurrent!(13), false);
    assert.equal(await tx.isCatalogueRevisionCurrent!(-1), false);
  });
  snapshot.runtimeRevision = 13;
  await store.transaction(async tx => assert.equal(await tx.isCatalogueRevisionCurrent!(13), false, 'The captured epoch cannot silently change'));
  const missing = createSnapshotMemoryStore({});
  await missing.transaction(async tx => assert.equal(await tx.isCatalogueRevisionCurrent!(0), false));
});

it('V5-CV-STORE-02: the fixture adapter supports current publication without bypassing the application fence', async () => {
  installGoldCatalogue();
  const snapshot = { ...fixtureSnapshot(), runtimeRevision: 41 };
  const config = loadAgenticConfig();
  const payload = { operation: 'create' as const, idempotencyKey: 'cv-snapshot-fence-0001', request: {
    destinationCountry: 'TH', locale: 'en', optimization: 'balanced', profile: { ageYears: 38, lifeStage: 'adult' },
    requirements: {}, medicationCodes: [], currentSupplements: [], targets: [{ name: 'Vitamin D3', amount: 1000, unit: 'IU' }] } };
  const run = (store: ReturnType<typeof createMemoryStore>, principalScope: string) => runWithCatalogueSnapshot(snapshot, () => planTool({
    config, store, now: '2026-09-01T00:00:00Z', payload, scope: { environment: 'dev', tenantScope: 'mattanutra', principalScope }
  }));
  try {
    const missing = await run(createMemoryStore(), 'cv-fence-missing');
    assert.equal(missing.ok, false);
    assert.equal('error' in missing && missing.error.reasonCode, 'availability_changed');
    const stale = await run(createSnapshotMemoryStore({ runtimeRevision: 40 }), 'cv-fence-stale');
    assert.equal(stale.ok, false);
    assert.equal('error' in stale && stale.error.reasonCode, 'availability_changed');
    const current = await run(createSnapshotMemoryStore(snapshot), 'cv-fence-current');
    assert.equal(current.ok, true);
    assert.equal('status' in current && current.status, 'ready');
    assert.equal('revision' in current && current.revision, 1);
  } finally { uninstallGoldCatalogue(); }
});
