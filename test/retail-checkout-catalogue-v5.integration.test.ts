import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import postgres from 'postgres';
import { currentWebCheckoutRecommendations } from '../lib/retail-product-checkout.ts';
import { FUNNEL_GENERATOR_VERSION } from '../lib/assessment-revisions.ts';

it('V5-CHECKOUT-PG-01: new checkout holds catalogue epoch stable until its short intent transaction commits', async () => {
  const databaseUrl = process.env.TEST_DB_URL;
  assert.ok(databaseUrl, 'The maintained PostgreSQL gate must provide an isolated TEST_DB_URL');
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55436'); assert.equal(url.pathname, '/mattanutra_lock_review');
  const sql = postgres(databaseUrl, { max: 3 });
  const planId = randomUUID(), runId = randomUUID();
  let release!: () => void;
  let holding: Promise<unknown> | undefined;
  let updating: Promise<unknown> | undefined;
  const rollback = new Error('Rollback-only catalogue concurrency fixture');
  try {
    const products = await sql<Array<{ id: string }>>`select id::text from public.products order by id limit 8`;
    assert.equal(products.length, 8, 'Eight controlled catalogue references are required; an empty fixture is a failure');
    const productIds = products.map(row => row.id);
    const [epoch] = await sql<Array<{ revision: string }>>`select revision::text from public.catalogue_runtime_revision where singleton = true`;
    assert.ok(epoch);
    await sql`insert into public.assessments (plan_id, locale, answers, answer_summary, health_score, input_revision)
      values (${planId}::uuid, 'en', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 1)`;
    await sql`insert into public.product_recommendation_runs (id, plan_id, assessment_revision, generation_locale, generator_version, selection_revision, catalogue_revision, diagnostics)
      values (${runId}::uuid, ${planId}::uuid, 1, 'en', ${FUNNEL_GENERATOR_VERSION}, 0, ${epoch.revision}::bigint,
        ${sql.json({ matching: { selectedOptionId: 'eight', options: [{ optionId: 'eight', productIds, recommendations: [] }] } })}::jsonb)`;
    for (const [rank, productId] of productIds.entries()) await sql`insert into public.product_recommendation_items (run_id, product_id, rank, url_used, price_amount)
      values (${runId}::uuid, ${productId}::uuid, ${rank + 1}, ${`https://fixture.invalid/${productId}`}, ${rank + 10})`;
    const input = { planId, locale: 'en' as const, selectedItemIds: productIds, recommendationRunId: runId, optionId: 'eight', assessmentRevision: 1, selectionRevision: 0 };
    let ready!: () => void;
    const checkoutReady = new Promise<void>(resolve => { ready = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    holding = sql.begin(async tx => {
      const rows = await currentWebCheckoutRecommendations(tx, input);
      assert.equal(rows.length, 8);
      ready(); await hold;
    });
    await Promise.race([checkoutReady, holding.then(() => { throw new Error("Checkout transaction ended before readiness"); })]);
    let backendReady!: (pid: number) => void;
    const updaterReady = new Promise<number>(resolve => { backendReady = resolve; });
    updating = sql.begin(async tx => {
      const [backend] = await tx<Array<{ pid: number }>>`select pg_backend_pid() as pid`;
      backendReady(backend!.pid);
      await tx`update public.catalogue_runtime_revision set revision = revision + 1 where singleton = true`;
      throw rollback;
    }).catch(error => { if (error !== rollback) throw error; });
    const pid = await updaterReady;
    let blocked = false;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const [row] = await sql<Array<{ blockers: number[] }>>`select pg_blocking_pids(${pid}) as blockers`;
      if (row!.blockers.length) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(blocked, true, 'A concurrent catalogue update must wait for the new checkout intent transaction');
    release(); await holding; await updating;
    const [after] = await sql<Array<{ revision: string }>>`select revision::text from public.catalogue_runtime_revision where singleton = true`;
    assert.equal(after!.revision, epoch.revision, 'The concurrency probe never commits a catalogue mutation');
    await sql.begin(async tx => {
      await tx`update public.catalogue_runtime_revision set revision = revision + 1 where singleton = true`;
      await assert.rejects(currentWebCheckoutRecommendations(tx, input), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'stale_product_selection');
      throw rollback;
    }).catch(error => { if (error !== rollback) throw error; });
  } finally {
    release?.();
    await holding?.catch(() => {}); await updating?.catch(() => {});
    try {
      await sql.begin(async tx => {
        // Isolated test cleanup only: preserve append-only protection in every
        // exercised runtime operation, including the stale-run assertion.
        await tx`set local session_replication_role = replica`;
        await tx`delete from public.product_recommendation_items where run_id = ${runId}::uuid`;
        await tx`delete from public.product_recommendation_runs where id = ${runId}::uuid`;
        await tx`delete from public.assessment_versions where plan_id = ${planId}::uuid`;
        await tx`delete from public.assessment_version_counters where plan_id = ${planId}::uuid`;
        await tx`delete from public.assessments where plan_id = ${planId}::uuid`;
      });
    } finally { await sql.end(); }
  }
});
