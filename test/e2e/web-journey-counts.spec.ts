import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { expect, test } from '../helpers/offline-browser';
const execute = promisify(execFile);
assert.ok(process.env.TEST_DB_URL, 'Browser checks require isolated PostgreSQL');
const database = new URL(process.env.TEST_DB_URL);
assert.equal(database.hostname, '127.0.0.1'); assert.match(database.pathname, /^\/mattanutra_lock_review_/);

for (const locale of ['en', 'th', 'zh-CN']) test(`WEB-JOURNEY-BROWSER-01 ${locale} HealthScore and reveal share the actual nutrient count`, async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'web-counts-'));
  const sql = postgres(database.href, { max: 1, prepare: false });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const output = join(directory, 'fixture.json');
    await execute(process.execPath, ['--experimental-strip-types', '--import', './scripts/register-ts-path-loader.mjs', 'scripts/seed-browser-fixtures.ts', output, JSON.stringify({ scenario: 'practical_advice', locale })], { env: process.env, timeout: 60_000, maxBuffer: 1024 * 1024 });
    const fixture = JSON.parse(await readFile(output, 'utf8'));
    // Reproduce real completed-task history before the visitor opens HealthScore.
    await execute(process.execPath, ['--experimental-strip-types', '--import', './test/helpers/offline-network.mjs', '--import', './scripts/register-ts-path-loader.mjs', '--input-type=module', '-e', `
      import {getSql,closeSqlPool} from './lib/db.ts';
      import {enqueueAssessmentPregenerationTasks} from './lib/task-worker.ts';
      const sql=getSql(),id=process.argv[1],locale=process.argv[2];
      try {const [a]=await sql\`select answers from assessments where plan_id=\${id}::uuid\`;
        await enqueueAssessmentPregenerationTasks({planId:id,locale,answers:a.answers});
        await sql\`update tasks set status='completed',completed_at=now() where plan_id=\${id}::uuid\`;
      }finally{await closeSqlPool();}
    `, fixture.planId, locale], { env: process.env, timeout: 60_000, maxBuffer: 1024 * 1024 });
    const before = await sql`select id from tasks where plan_id=${fixture.planId}::uuid and task_type='generate_supplement_guidance' order by id`;
    expect(before.length).toBe(1);
    const response = await page.request.get(`/api/assessment/${fixture.planId}/formulation?locale=${locale}`);
    expect(response.status()).toBe(200);
    const formulation = await response.json();
    const count = formulation.supplementBreakdown.length;
    expect(count).toBeGreaterThan(0);
    await page.goto(`/${locale}/nutrition/healthscore?plan=${fixture.planId}`);
    const section = page.locator('.mn-hs-shortlist-section');
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator('.n')).toHaveCount(3);
    await expect(section.locator('.n').nth(2)).toHaveText(String(count));
    const totals = (await section.locator('.n').allTextContents()).map(Number);
    expect(totals[0] - totals[1]).toBe(totals[2]);
    const retry = await page.request.post(`/api/assessment/${fixture.planId}/healthscore/retry`, { data: { locale } });
    expect(retry.status()).toBe(200);
    expect(await sql`select id from tasks where plan_id=${fixture.planId}::uuid and task_type='generate_supplement_guidance' order by id`).toEqual(before);
    await page.goto(`/${locale}/nutrition/reveal?plan=${fixture.planId}`);
    await expect(page.locator('.nutrient-card')).toHaveCount(count);
  } finally { await sql.end(); await rm(directory, { recursive: true, force: true }); }
});
