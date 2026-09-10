import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '../helpers/offline-browser';
const execute = promisify(execFile);
assert.ok(process.env.TEST_DB_URL, 'Browser checks require isolated PostgreSQL');

for (const locale of ['en', 'th', 'zh-CN']) test(`WEB-JOURNEY-BROWSER-01 ${locale} HealthScore and reveal share the actual nutrient count`, async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'web-counts-'));
  try {
    const output = join(directory, 'fixture.json');
    await execute(process.execPath, ['--experimental-strip-types', '--import', './scripts/register-ts-path-loader.mjs', 'scripts/seed-browser-fixtures.ts', output, JSON.stringify({ scenario: 'practical_advice', locale })], { env: process.env, timeout: 60_000, maxBuffer: 1024 * 1024 });
    const fixture = JSON.parse(await readFile(output, 'utf8'));
    const response = await page.request.get(`/api/assessment/${fixture.planId}/formulation?locale=${locale}`);
    expect(response.status()).toBe(200);
    const formulation = await response.json();
    const count = formulation.supplementBreakdown.length;
    expect(count).toBeGreaterThan(0);
    await page.goto(`/${locale}/nutrition/healthscore?plan=${fixture.planId}`);
    const section = page.locator('.mn-hs-shortlist-section');
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator('.n')).toHaveCount(1);
    await expect(section.locator('.n')).toHaveText(String(count));
    await expect(section).not.toContainText('Shortlisted for your score');
    await page.goto(`/${locale}/nutrition/reveal?plan=${fixture.planId}`);
    await expect(page.locator('.nutrient-card')).toHaveCount(count);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
