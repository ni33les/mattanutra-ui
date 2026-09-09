import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, it } from 'node:test';
import { closeSqlPool } from '../lib/db.ts';
import postgres from 'postgres';
import { installGoldCatalogue, uninstallGoldCatalogue } from './helpers/gold-catalogue.ts';
import { fixtureSnapshot } from '../lib/agentic/catalogue/fixtures.ts';
import { replaceCatalogueSnapshot } from '../lib/agentic/catalogue/snapshot.ts';
import { createPostgresStore } from '../lib/agentic/store/postgres.ts';
import { loadAgenticConfig } from '../lib/agentic/config.ts';
import { planTool, runAdmittedPlanOperation } from '../lib/agentic/plan/service.ts';
import { fixtureDatabaseUrl } from './helpers/fixture-teardown.ts';
after(closeSqlPool);

it('V5-PUBLISH-PG-01: matching publishes without waiting for catalogue writers and later reads mark it stale', async () => {
  const databaseUrl = process.env.TEST_DB_URL;
  assert.ok(databaseUrl, 'The PostgreSQL gate must supply TEST_DB_URL');
  fixtureDatabaseUrl();
  const sql = postgres(databaseUrl, { max: 3, prepare: false, connection: { lock_timeout: "250ms", statement_timeout: "2000ms" } });
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
    replaceCatalogueSnapshot({ ...fixtureSnapshot(), catalogueVersion: principalScope, runtimeRevision: Number(epoch.revision) });
    const admitted=await planTool({config,now:new Date().toISOString(),payload,scope,store}); assert.ok(admitted.ok);
    const operation=await store.getPlanOperationByKey(`dev:mattanutra:${principalScope}`,payload.idempotencyKey); assert.ok(operation);
    let release!:()=>void, entered!:()=>void;
    const held=new Promise<void>(resolve=>{entered=resolve;}); const barrier=new Promise<void>(resolve=>{release=resolve;});
    const writer=sql.begin(async tx=>{await tx`update public.catalogue_runtime_revision set revision=revision+1 where singleton=true`; entered();await barrier;});
    await held;
    try {
      const completed=await runAdmittedPlanOperation({config,store,operationId:operation.id});
      assert.equal(completed.ok,true,JSON.stringify(completed));
      assert.equal((await store.getPlanOperation(operation.id))?.status,'complete');
    } finally {release();await writer;}
    const {readPlanStatus}=await import('../lib/agentic/presentation/plan-read.ts');
    const {createAgenticRuntime}=await import('../lib/agentic/runtime.ts');
    const status=await readPlanStatus(createAgenticRuntime({config,store,scope}),admitted.planHandle);
    assert.ok(status.ok && status.refreshRequired);assert.equal(status.status,'needs_input');
    const saved=await store.getPlanRevision(operation.planId,1);assert.equal(saved?.status,'ready');
    assert.equal(saved?.statusProjection?.catalogueRevision,Number(epoch.revision));
    const [counts]=await sql`select count(*)::integer as revisions from agentic_plan_revisions where plan_id=${operation.planId}::uuid`;
    assert.equal(counts!.revisions,1);
  } finally {
    uninstallGoldCatalogue();
    await store.deletePrincipalScope(principalScope);
    await sql`delete from public.agentic_catalogue_snapshots where snapshot_json->>'catalogueVersion'=${principalScope}`;
    await sql.end();
  }
});
