import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { expect, test } from '../helpers/offline-browser';
const execute = promisify(execFile);
assert.ok(process.env.TEST_DB_URL, 'Isolated PostgreSQL is required');
const url = new URL(process.env.TEST_DB_URL); assert.equal(url.hostname, '127.0.0.1'); assert.match(url.pathname, /^\/mattanutra_lock_review_/);

for (const locale of ['en', 'th', 'zh-CN']) test(`HS-PAR-BROWSER-01 ${locale} keeps the original page hidden until both branches finish`, async ({ page }) => {
  const sql = postgres(url.href, { max: 1, prepare: false });
  const directory = await mkdtemp(join(tmpdir(), 'hs-parallel-'));
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const output = join(directory, 'fixture.json');
    await execute(process.execPath, ['--experimental-strip-types', '--import', './scripts/register-ts-path-loader.mjs', 'scripts/seed-browser-fixtures.ts', output, JSON.stringify({ scenario: 'practical_advice', locale })], { env: process.env, timeout: 60_000, maxBuffer: 1024 * 1024 });
    const fixture = JSON.parse(await readFile(output, 'utf8'));
    const [copy] = await sql`select result from assessment_healthscore_results where plan_id=${fixture.planId}::uuid and locale=${locale}`; assert.ok(copy);
    await sql`update assessment_healthscore_results set result='{}'::jsonb where plan_id=${fixture.planId}::uuid and locale=${locale}`;
    await page.goto(`/${locale}/nutrition/healthscore?plan=${fixture.planId}`);
    await expect(page.getByTestId('questionnaire-calculating')).toBeVisible();
    await expect(page.locator('.mn-healthscore-v7')).toHaveCount(0);
    await sql`update assessment_healthscore_results set result=${sql.json(copy.result)} where plan_id=${fixture.planId}::uuid and locale=${locale}`;
    // Controlled fixture transition only: production recommendation versions remain append-only.
    await sql.begin(async tx => {
      await tx`set local session_replication_role = replica`;
      await tx`update product_recommendation_runs set catalogue_revision=-1 where id=${fixture.runId}::uuid`;
    });
    await page.reload();
    await expect(page.getByTestId('questionnaire-calculating')).toBeVisible();
    await expect(page.locator('.mn-healthscore-v7')).toHaveCount(0);
    await sql.begin(async tx => {
      await tx`set local session_replication_role = replica`;
      await tx`update product_recommendation_runs set catalogue_revision=(select revision from catalogue_runtime_revision where singleton=true) where id=${fixture.runId}::uuid`;
    });
    await expect(page.locator('.mn-healthscore-v7')).toBeVisible({ timeout: 10000 });
    const section = page.locator('.mn-hs-shortlist-section'); await section.scrollIntoViewIfNeeded();
    await expect(section.locator('.n')).toHaveCount(3);
    const numbers = (await section.locator('.n').allTextContents()).map(Number);
    expect(numbers[0]).toBeGreaterThan(numbers[2]); expect(numbers[0] - numbers[1]).toBe(numbers[2]);
    await expect(section.locator('.subn.a')).toHaveCount(1); await expect(section.locator('.subn.b')).toHaveCount(1); await expect(section.locator('.subn.c')).toHaveCount(1);
  } finally { await sql.end(); await rm(directory, { recursive: true, force: true }); }
});
