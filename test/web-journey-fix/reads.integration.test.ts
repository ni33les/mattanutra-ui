import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import postgres from 'postgres';
import { getRevisionFormulationNutrientCount, FUNNEL_GENERATOR_VERSION } from '../../lib/assessment-revisions.ts';
import { persistAssessmentSubmission } from '../../lib/assessment-store.ts';
import { createAssessmentSnapshot } from '../../lib/assessment-snapshot.ts';
import { computeHealthScore } from '../../lib/health-score.ts';
import { closeSqlPool } from '../../lib/db.ts';

assert.ok(process.env.TEST_DB_URL, 'An isolated PostgreSQL database is required');
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, '127.0.0.1'); assert.match(url.pathname, /^\/mattanutra_lock_review_/);
const sql = postgres(url.href, { max: 3, prepare: false, onnotice: () => {} });
after(async () => { await sql.end(); await closeSqlPool(); });

test('WEB-JOURNEY-PG-01 formula count is revision/locale aware and finishes while a writer remains locked', async () => {
  const id = randomUUID(), answers = { age: '36-45', sex: 'male', goals: ['energy'] };
  await persistAssessmentSubmission({ answers, locale: 'en', status: 'captured', snapshot: createAssessmentSnapshot({ planId: id, healthScore: computeHealthScore(answers, 'en') }) });
  assert.equal(await getRevisionFormulationNutrientCount(id, 'en', 1, sql), null);
  for (const [index, locale] of ['en', 'th', 'zh-CN'].entries()) {
    // The legacy JSON fallback and persisted lightweight projection agree.
    const formula = { supplementBreakdown: [...Array.from({ length: 10 }, (_, i) => ({ id: `nutrient-${i}` })), { id: 'hidden', safety: { visibility: 'hidden' } }] };
    const projection = locale === 'th' ? { version: 1, visibleCount: 10 } : null;
    await sql`insert into formulations(plan_id,version,assessment_revision,generation_locale,generator_version,formulation,read_projection)
      values(${id}::uuid,${index + 1},1,${locale},${FUNNEL_GENERATOR_VERSION},${sql.json(formula)},${projection ? sql.json(projection) : null})`;
    assert.equal(await getRevisionFormulationNutrientCount(id, locale as 'en' | 'th' | 'zh-CN', 1, sql), 10);
  }
  assert.equal(await getRevisionFormulationNutrientCount(id, 'en', 2, sql), null);
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(r => { enter = r; }), held = new Promise<void>(r => { release = r; });
  const writer = sql.begin(async tx => { await tx`update formulations set updated_at=now() where plan_id=${id}::uuid`; enter(); await held; });
  await entered;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { assert.equal(await Promise.race([getRevisionFormulationNutrientCount(id, 'en', 1, sql), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Ordinary count read waited for the writer')), 1000); })]), 10); }
    finally { clearTimeout(timer); }
  } finally { release(); await writer; }
  await sql`update assessments set input_revision=2 where plan_id=${id}::uuid`;
  assert.equal(await getRevisionFormulationNutrientCount(id, 'en', 1, sql), null);
  assert.equal(Number((await sql`select count(*)::int as n from tasks where plan_id=${id}::uuid`)[0].n), 0);
});
