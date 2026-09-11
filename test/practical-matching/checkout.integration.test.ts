import { cleanupFixtureRelationships, fixtureDatabaseUrl } from "../helpers/fixture-teardown.ts";
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import postgres from 'postgres';
import { currentWebCheckoutRecommendations } from '../../lib/retail-product-checkout.ts';
import { MATCHER_VERSION } from '../../lib/matcher/config.ts';
import { FUNNEL_GENERATOR_VERSION } from '../../lib/assessment-revisions.ts';

it('PRACTICAL-CHECKOUT-PG-01 preview reads complete under a held catalogue writer and preserve eight selection rows', async () => {
  const databaseUrl = process.env.TEST_DB_URL;
  assert.ok(databaseUrl, 'The maintained PostgreSQL gate must provide an isolated TEST_DB_URL');
  fixtureDatabaseUrl();
  const sql = postgres(databaseUrl, { max: 3, connection: { lock_timeout: '250ms', statement_timeout: '3000ms' } });
  const planId = randomUUID(), runId = randomUUID();
  let release!: () => void;
  let holding: Promise<unknown> | undefined;
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
    let ready!: () => void;
    const entered = new Promise<void>(resolve => { ready = resolve; });
    const barrier = new Promise<void>(resolve => { release = resolve; });
    holding = sql.begin(async tx => {
      await tx`update public.catalogue_runtime_revision set revision = revision + 1 where singleton = true`;
      ready(); await barrier; throw rollback;
    }).catch(error => { if (error !== rollback) throw error; });
    await Promise.race([entered, holding.then(() => { throw new Error('Writer ended before the barrier'); })]);
    const rows = await currentWebCheckoutRecommendations(sql, input);
    assert.deepEqual(rows.map(row => row.product_id), productIds);
  } finally {
    release?.();
    await holding?.catch(() => {});
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
