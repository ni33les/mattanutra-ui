import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import postgres from 'postgres';
import { closeSqlPool } from '../lib/db.ts';
import { createAdminBrowserSession, cleanupAdminBrowserSession, type AdminBrowserSession } from './helpers/admin-browser-fixture.ts';
import { fixtureDatabaseUrl, cleanupFixtureRelationships } from './helpers/fixture-teardown.ts';
import { isolatedValidationEnvironment } from '../scripts/run-dev-advisory-validation.mjs';

const execute = promisify(execFile);
type BrowserFixture = { planId: string; runId: string; orderId: string; paymentId: string; adminAgentId: string; ADMIN_E2E_TARGET_ORGANISATION_ID: string };

it('V5-BROWSER-PG-01 fixture provisioning and the real admin session lifecycle preserve the matched catalogue revision', async () => {
  const database = fixtureDatabaseUrl();
  const sql = postgres(database.href, { max: 1 });
  const directory = await mkdtemp(join(tmpdir(), 'browser-epoch-fixture-'));
  const seededFixtures: BrowserFixture[] = [];
  let fixture: BrowserFixture | undefined;
  let session: AdminBrowserSession | undefined;
  try {
    const output = join(directory, 'fixtures.json');
    const env = { ...isolatedValidationEnvironment(process.env), NODE_ENV: 'test' };
    // This subprocess exercises the real isolated catalogue, not Node's empty
    // unit-test snapshot shortcut inherited from its parent runner.
    delete env.NODE_TEST_CONTEXT;
    const seed = async (file: string) => {
      await execute(process.execPath, ['--experimental-strip-types', '--import', './scripts/register-ts-path-loader.mjs', 'scripts/seed-browser-fixtures.ts', file], { env, timeout: 60000, maxBuffer: 1024 * 1024 });
      const saved = JSON.parse(await readFile(file, 'utf8')) as BrowserFixture;
      seededFixtures.push(saved);
      return saved;
    };
    const first = await seed(output);
    const [beforeRefresh] = await sql<Array<{ count: number; epoch: string }>>`select count(*)::int as count,
      (select revision::text from public.catalogue_runtime_revision where singleton=true) as epoch from public.organisations`;
    fixture = await seed(join(directory, 'refreshed-fixtures.json'));
    const [afterRefresh] = await sql<Array<{ count: number; epoch: string }>>`select count(*)::int as count,
      (select revision::text from public.catalogue_runtime_revision where singleton=true) as epoch from public.organisations`;
    assert.equal(fixture.ADMIN_E2E_TARGET_ORGANISATION_ID, first.ADMIN_E2E_TARGET_ORGANISATION_ID, 'Full-gate refresh must reuse the same guarded admin target');
    assert.deepEqual(afterRefresh, beforeRefresh, 'Repeated seeding must not add a commercial organisation or stale earlier browser matches');
    const [run] = await sql<Array<{ catalogue_revision: string; current_revision: string; items: number }>>`
      select r.catalogue_revision::text,c.revision::text as current_revision,
        (select count(*)::int from public.product_recommendation_items i where i.run_id=r.id) as items
      from public.product_recommendation_runs r cross join public.catalogue_runtime_revision c where r.id=${fixture.runId}::uuid`;
    assert.ok(run);
    assert.ok(run.items > 0, 'The fixture must retain real matched product quantities');
    assert.equal(run.catalogue_revision, run.current_revision, 'Seed-time admin provisioning must precede matching');
    session = await createAdminBrowserSession(fixture.ADMIN_E2E_TARGET_ORGANISATION_ID);
    assert.equal(session.ownsTestOrganisation, false);
    assert.equal(session.testOrganisationId, fixture.ADMIN_E2E_TARGET_ORGANISATION_ID);
    await sql`insert into public.organisation_memberships (organisation_id,agent_id,principal_type,role,status)
      values (${session.testOrganisationId}::uuid,${fixture.adminAgentId}::uuid,'agent','retail_agent','active')`;
    await cleanupAdminBrowserSession(session);
    const [after] = await sql<Array<{ revision: string; organisation: number; memberships: number; revoked: boolean }>>`
      select c.revision::text,
        (select count(*)::int from public.organisations where id=${session.testOrganisationId}::uuid) as organisation,
        (select count(*)::int from public.organisation_memberships where organisation_id=${session.testOrganisationId}::uuid and principal_type='agent') as memberships,
        (select revoked_at is not null from public.admin_sessions where id=${session.sessionId}::uuid) as revoked
      from public.catalogue_runtime_revision c`;
    assert.equal(after!.revision, run.catalogue_revision, 'Actual admin association setup and cleanup must not stale later reveal tests');
    assert.equal(after!.organisation, 1);
    assert.equal(after!.memberships, 0);
    assert.equal(after!.revoked, true);
    await assert.rejects(createAdminBrowserSession(fixture.orderId), /preprovisioned browser fixture/);
  } finally {
    if (session) await cleanupAdminBrowserSession(session);
    for (const saved of seededFixtures) await sql.begin(async tx => {
      // Fixture-only append-only cleanup; every deleted record is scoped to
      // this generated plan/order/agent. Runtime fencing remains exercised above.
      await tx`set local session_replication_role=replica`;
      await cleanupFixtureRelationships(tx, { planIds: [saved.planId] });
      await tx`delete from public.product_recommendation_items where run_id=${saved.runId}::uuid`;
      await tx`delete from public.retail_customer_order_lines where customer_order_id=${saved.orderId}::uuid`;
      await tx`delete from public.retail_customer_orders where id=${saved.orderId}::uuid`;
      const tables = await tx<Array<{ table_name: string }>>`
        select c.table_name from information_schema.columns c join information_schema.tables t on (c.table_schema,c.table_name)=(t.table_schema,t.table_name)
        where c.table_schema='public' and c.column_name='plan_id' and t.table_type='BASE TABLE'`;
      for (const { table_name } of tables) {
        assert.match(table_name, /^[a-z_]+$/);
        await tx.unsafe(`delete from public."${table_name}" where plan_id=$1`, [saved.planId]);
      }
      if (session) await tx`delete from public.admin_sessions where id=${session.sessionId}::uuid`;
      await tx`delete from public.agents where id=${saved.adminAgentId}::uuid`;
      // The shared preprovisioned target belongs to the gate, not this case.
    });
    await closeSqlPool();
    await sql.end();
    await rm(directory, { recursive: true, force: true });
  }
});
