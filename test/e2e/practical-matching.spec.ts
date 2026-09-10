import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '../helpers/offline-browser';
const execute = promisify(execFile);
assert.ok(process.env.TEST_DB_URL, 'Practical browser cases require isolated PostgreSQL; missing prerequisites fail');
for (const locale of ['en', 'th', 'zh-CN']) test(`PRACTICAL-BROWSER-01 ${locale} concise reveal and existing alternate checkout preserve advisory purchase`, async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'practical-browser-'));
  let seeded;
  try {
    const output = join(directory, 'fixture.json');
    await execute(process.execPath, ['--experimental-strip-types', '--import', './scripts/register-ts-path-loader.mjs', 'scripts/seed-browser-fixtures.ts', output, JSON.stringify({ scenario: 'practical_advice', locale })], {
      env: process.env, timeout: 60000, maxBuffer: 1024 * 1024, killSignal: 'SIGKILL'
    });
    seeded = JSON.parse(await readFile(output, 'utf8'));
  } finally { await rm(directory, { recursive: true, force: true }); }
  expect(seeded.preferenceScenario.selectedProductCount).toBe(2);
  await page.goto(`/${locale}/nutrition/reveal?plan=${seeded.planId}`);
  const cautions = page.getByTestId('medical-cautions');
  await expect(cautions).toHaveCount(1);
  await expect(cautions.locator('[data-advice-code="medication_interaction"]')).toHaveCount(1);
  await expect(cautions).toContainText('Selected fixture nutrient');
  await expect(cautions.locator('[data-advice-code="intake_unknown"]')).toHaveCount(0);
  const details = page.getByTestId('matching-advice-details').first();
  await expect(details).not.toHaveAttribute('open'); await details.locator('summary').click();
  await expect(details.locator('[data-advice-code="intake_unknown"]')).toBeVisible();
  const alternative = page.locator(`[data-option-id="${seeded.preferenceScenario.alternative.optionId}"]`);
  await expect(alternative).toHaveCount(0);
  await expect(page.getByTestId('selected-matching-preferences')).toHaveCount(0);
  // Removing reveal's alternative cards does not invalidate existing option checkout links.
  const params = new URLSearchParams({ plan: seeded.planId, run: seeded.runId,
    option: seeded.preferenceScenario.alternative.optionId, selected: seeded.preferenceScenario.alternative.productIds.join(','),
    revision: '1', selectionRevision: '0' });
  await page.goto(`/${locale}/basket/checkout?${params}`);
  await expect(page).toHaveURL(/\/basket\/checkout\?/);
  await expect(page.getByTestId('medical-cautions')).toContainText('Alternative fixture nutrient');
  await expect(page.getByTestId('medical-cautions')).not.toContainText('Selected fixture nutrient');
  await expect(page.locator('input[name="customerName"]').first()).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /acknowledge|รับทราบ|确认风险/i })).toHaveCount(0);
});
