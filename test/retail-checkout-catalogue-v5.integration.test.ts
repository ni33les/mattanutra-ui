import { cleanupFixtureRelationships, fixtureDatabaseUrl } from "./helpers/fixture-teardown.ts";
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import postgres from 'postgres';
import { currentWebCheckoutSelection, validateCurrentWebCheckoutRecommendations } from '../lib/retail-product-checkout.ts';
import { MATCHER_VERSION } from '../lib/matcher/config.ts';
import { FUNNEL_GENERATOR_VERSION } from '../lib/assessment-revisions.ts';

it('V5-CHECKOUT-PG-01: new checkout validates its snapshot without fencing unrelated catalogue writers', async () => {
  const databaseUrl = process.env.TEST_DB_URL;
  assert.ok(databaseUrl, 'The maintained PostgreSQL gate must provide an isolated TEST_DB_URL');
  fixtureDatabaseUrl();
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
        ${sql.json({ algorithmVersion: MATCHER_VERSION, matching: { selectedCandidateKey: 'eight', options: [{ candidateKey: 'eight', productIds, recommendations: [] }] } })}::jsonb)`;
    for (const [rank, productId] of productIds.entries()) await sql`insert into public.product_recommendation_items (run_id, product_id, rank, url_used, price_amount)
      values (${runId}::uuid, ${productId}::uuid, ${rank + 1}, ${`https://fixture.invalid/${productId}`}, ${rank + 10})`;
    const input = { planId, locale: 'en' as const, selectedItemIds: productIds, recommendationRunId: runId, candidateKey: 'eight', assessmentRevision: 1, selectionRevision: 0 };
    const prepared = await currentWebCheckoutSelection(sql, input);
    let ready!: () => void;
    const checkoutReady = new Promise<void>(resolve => { ready = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    holding = sql.begin(async tx => {
      const rows = await validateCurrentWebCheckoutRecommendations(tx, input, prepared);
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
    await updaterReady;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const finished = await Promise.race([updating.then(() => true), new Promise<false>(resolve => { timer=setTimeout(() => resolve(false),1000); })]);
      assert.equal(finished, true, 'An unrelated catalogue writer must finish before the checkout transaction commits');
    } finally { if (timer) clearTimeout(timer); }
    release(); await holding; await updating;
    const [after] = await sql<Array<{ revision: string }>>`select revision::text from public.catalogue_runtime_revision where singleton = true`;
    assert.equal(after!.revision, epoch.revision, 'The concurrency probe never commits a catalogue mutation');
    await sql.begin(async tx => {
      await tx`update public.catalogue_runtime_revision set revision = revision + 1 where singleton = true`;
      await assert.rejects(validateCurrentWebCheckoutRecommendations(tx, input, prepared), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'stale_product_selection');
      throw rollback;
    }).catch(error => { if (error !== rollback) throw error; });
    for (const change of ['assessment', 'exclusions', 'new-run']) {
      await sql.begin(async tx => {
        if (change === 'assessment') await tx`update public.assessments set input_revision=input_revision+1 where plan_id=${planId}::uuid`;
        if (change === 'exclusions') await tx`insert into public.assessment_product_preferences (plan_id, revision, excluded_product_ids)
          values (${planId}::uuid, 1, ${productIds}::uuid[])`;
        if (change === 'new-run') await tx`insert into public.product_recommendation_runs
          (id, plan_id, assessment_revision, generation_locale, generator_version, selection_revision, catalogue_revision, diagnostics, generated_at)
          select ${randomUUID()}::uuid, plan_id, assessment_revision, generation_locale, generator_version, selection_revision, catalogue_revision, diagnostics, generated_at + interval '1 second'
          from public.product_recommendation_runs where id=${runId}::uuid`;
        await assert.rejects(validateCurrentWebCheckoutRecommendations(tx, input, prepared), { code: 'stale_product_selection' }, change);
        throw rollback;
      }).catch(error => { if (error !== rollback) throw error; });
    }
  } finally {
    release?.();
    await holding?.catch(() => {}); await updating?.catch(() => {});
    try {
      await sql.begin(async tx => {
        // Isolated test cleanup only: preserve append-only protection in every
        // exercised runtime operation, including the stale-run assertion.
        await tx`set local session_replication_role = replica`;
        await cleanupFixtureRelationships(tx, { planIds: [planId] });
        await tx`delete from public.product_recommendation_items where run_id = ${runId}::uuid`;
        await tx`delete from public.product_recommendation_runs where id = ${runId}::uuid`;
        await tx`delete from public.assessment_versions where plan_id = ${planId}::uuid`;
        await tx`delete from public.assessment_version_counters where plan_id = ${planId}::uuid`;
        await tx`delete from public.assessments where plan_id = ${planId}::uuid`;
      });
    } finally { await sql.end(); }
  }
});
