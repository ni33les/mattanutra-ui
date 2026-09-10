import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createSnapshotMemoryStore } from './agentic/value/snapshot-store.ts';
import { fixtureSnapshot } from '../lib/agentic/catalogue/fixtures.ts';
import { runWithCatalogueSnapshot } from '../lib/agentic/catalogue/snapshot.ts';
import { installGoldCatalogue, uninstallGoldCatalogue } from './helpers/gold-catalogue.ts';
import { loadAgenticConfig } from '../lib/agentic/config.ts';
import { planTool, runAdmittedPlanOperation } from '../lib/agentic/plan/service.ts';
import { completedPlanTool } from './helpers/completed-mcp-client.ts';
import { captureMatcherSafetySnapshot } from '../lib/matcher/safety-ceilings.ts';
import { runWithMatcherSafetySnapshot } from '../lib/matcher/safety-ceilings-server.ts';
import { canonicalHash } from '../lib/agentic/value/canonical.ts';
import { readPlanStatus } from '../lib/agentic/presentation/plan-read.ts';
import { createAgenticRuntime } from '../lib/agentic/runtime.ts';

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

it('V5-CV-STORE-02: snapshot publication is nonlocking while stale selection retains the commercial fence', async () => {
  installGoldCatalogue();
  const snapshot = { ...fixtureSnapshot(), runtimeRevision: 41 };
  const config = loadAgenticConfig();
  const payload = { operation: 'create' as const, idempotencyKey: 'cv-snapshot-fence-0001', request: {
    destinationCountry: 'TH', locale: 'en', optimization: 'balanced', profile: { ageYears: 38, lifeStage: 'adult' },
    requirements: {}, medicationCodes: [], currentSupplements: [], targets: [{ name: 'Vitamin D3', amount: 1000, unit: 'IU' }] } };
  const captured = captureMatcherSafetySnapshot();
  const references = { ...captured, identity: { runtimeRevision: 41, fingerprint: canonicalHash(captured.ceilings) } };
  const within = <T>(work: () => T) => runWithMatcherSafetySnapshot(references, () => runWithCatalogueSnapshot(snapshot, work));
  try {
    for (const epoch of [undefined, 40, 41]) {
      const store = createSnapshotMemoryStore({ runtimeRevision: epoch });
      const runtime = createAgenticRuntime({ config, store, now: '2026-09-01T00:00:00Z',
        scope: { environment: 'dev', tenantScope: 'mattanutra', principalScope: `cv-fence-${epoch}` } });
      const current = await within(() => completedPlanTool({ ...runtime, now: runtime.now!, payload }));
      assert.equal(current.ok, true); if (!current.ok) throw new Error('Missing completed fixture');
      assert.equal(current.status, 'no_purchase'); assert.equal(current.revision, 1);
      const status = await readPlanStatus(runtime, current.planHandle);
      assert.equal(status.ok, true); if (!status.ok) throw new Error('Missing status');
      assert.equal(status.refreshRequired, epoch !== 41);
      assert.equal(status.status, epoch === 41 ? 'no_purchase' : 'needs_input');
      const purchase = current.options?.find(option => option.purchaseEligible && option.basket.length > 0);
      assert.ok(purchase, 'A valid above-target purchase must remain selectable');
      const selection = { operation: 'select' as const, idempotencyKey: `cv-select-${epoch}-0001`, planHandle: current.planHandle, expectedRevision: 1, optionId: purchase.optionId };
      const admission = await planTool({ ...runtime, now: runtime.now!, payload: selection }); assert.equal(admission.ok, true);
      const op = await store.getPlanOperationByKey(`dev:mattanutra:${runtime.scope.principalScope}`, selection.idempotencyKey); assert.ok(op);
      const selected = await within(() => runAdmittedPlanOperation({ store, config, operationId: op.id }));
      assert.equal(selected.ok, epoch === 41);
      if (!selected.ok) assert.equal(selected.error.reasonCode, 'availability_changed');
      const saved = await store.getPlanRevision(op.planId, 1); assert.equal(saved?.status, 'no_purchase', 'A stale selection cannot change the saved result');
    }
  } finally { uninstallGoldCatalogue(); }
});
