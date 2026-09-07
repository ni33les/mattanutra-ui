import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import postgres from 'postgres';
import { installGoldCatalogue, uninstallGoldCatalogue } from './helpers/gold-catalogue.ts';
import { fixtureSnapshot } from '../lib/agentic/catalogue/fixtures.ts';
import { replaceCatalogueSnapshot } from '../lib/agentic/catalogue/snapshot.ts';
import { createPostgresStore } from '../lib/agentic/store/postgres.ts';
import { loadAgenticConfig } from '../lib/agentic/config.ts';
import { planTool } from '../lib/agentic/plan/service.ts';

it('V5-PUBLISH-PG-01: PostgreSQL rejects a stale completed match and the same request recovers one saved revision', async () => {
  const databaseUrl = process.env.TEST_DB_URL;
  assert.ok(databaseUrl, 'The PostgreSQL gate must supply TEST_DB_URL');
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55436'); assert.equal(url.pathname, '/mattanutra_lock_review');
  const sql = postgres(databaseUrl, { max: 3 });
  const store = createPostgresStore(sql);
  const principalScope = `publish-fence-pg:${randomUUID()}`;
  installGoldCatalogue();
  try {
    const [epoch] = await sql<Array<{ revision: string }>>`select revision::text from public.catalogue_runtime_revision where singleton=true`;
    assert.ok(epoch);
    assert.ok(store.isCatalogueRevisionCurrent, 'Production PostgreSQL store must implement the publication fence');
    await assert.rejects(store.isCatalogueRevisionCurrent(Number(epoch.revision)), /require a transaction/);
    const config = { ...loadAgenticConfig(), capabilitySecret: 'publish-pg-fixture-secret-0001', paymentProvider: 'mock' as const, thailandRetailerAdapter: 'mock_thailand' as const };
    const scope = { environment: 'dev' as const, tenantScope: 'mattanutra', principalScope };
    const payload = { operation: 'create' as const, idempotencyKey: `publish-pg-${randomUUID()}`, request: { destinationCountry: 'TH', locale: 'en', optimization: 'balanced', profile: { ageYears: 38, lifeStage: 'adult' }, requirements: {}, targets: [{ name: 'Vitamin D3', amount: 1000, unit: 'IU' }] } };
    replaceCatalogueSnapshot({ ...fixtureSnapshot(), catalogueVersion: principalScope, runtimeRevision: Number(epoch.revision) - 1 });
    const stale = await planTool({ config, now: '2026-09-07T00:00:00Z', payload, scope, store });
    assert.equal(stale.ok, false);
    assert.equal('error' in stale && stale.error.reasonCode, 'availability_changed');
    const ids = await store.listPlanIdsByPrincipal(principalScope);
    assert.equal(ids.length, 1);
    assert.equal((await store.getPlanRevision(ids[0]!, 1))?.status, 'processing');
    const receipt = await store.getIdempotency('plan', `dev:mattanutra:${principalScope}`, payload.idempotencyKey);
    assert.ok(receipt); assert.equal(JSON.parse(receipt.responseJson).status, 'processing');
    replaceCatalogueSnapshot({ ...fixtureSnapshot(), catalogueVersion: principalScope, runtimeRevision: Number(epoch.revision) });
    const recovered = await planTool({ config, now: '2026-09-07T00:00:01Z', payload, scope, store });
    assert.equal(recovered.ok, true);
    assert.equal('status' in recovered && recovered.status, 'ready');
    assert.equal('revision' in recovered && recovered.revision, 1);
    assert.deepEqual(await store.listPlanIdsByPrincipal(principalScope), ids);
    const [counts] = await sql`select (select count(*)::integer from public.agentic_plan_revisions where plan_id=${ids[0]}::uuid) as revisions,
      (select count(*)::integer from public.agentic_orders where plan_id=${ids[0]}::uuid) as orders`;
    assert.equal(counts!.revisions, 1); assert.equal(counts!.orders, 0);
  } finally {
    uninstallGoldCatalogue();
    await store.deletePrincipalScope(principalScope);
    await sql`delete from public.agentic_catalogue_snapshots where snapshot_json->>'catalogueVersion'=${principalScope}`;
    await sql.end();
  }
});
