import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { expect, test } from '../helpers/offline-browser';
import { computeHealthScore, DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT, type HealthScoreResult } from '../../lib/health-score';
import { healthScoreV8Copy } from '../../components/nutrition-flow/healthscore-v8-copy';
const execute = promisify(execFile);
assert.ok(process.env.TEST_DB_URL, 'Isolated PostgreSQL is required');
const url = new URL(process.env.TEST_DB_URL); assert.equal(url.hostname, '127.0.0.1'); assert.match(url.pathname, /^\/mattanutra_lock_review_/);

for (const locale of ['en', 'th', 'zh-CN']) test(`HS-PAR-BROWSER-01 ${locale} opens HealthScore before product matching and keeps reveal waiting`, async ({ page }) => {
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
    await expect(page.getByTestId('healthscore')).toHaveCount(0);
    await sql`update assessment_healthscore_results set result=${sql.json(copy.result)} where plan_id=${fixture.planId}::uuid and locale=${locale}`;
    // Controlled fixture transition only: production recommendation versions remain append-only.
    await sql.begin(async tx => {
      await tx`set local session_replication_role = replica`;
      await tx`update product_recommendation_runs set catalogue_revision=-1 where id=${fixture.runId}::uuid`;
      await tx`update formulations set formulation=jsonb_set(formulation,'{sectionStatuses,supplements}','"pending"'),read_projection=null where plan_id=${fixture.planId}::uuid`;
    });
    await page.reload();
    await expect(page.getByTestId('healthscore')).toBeVisible();
    await expect(page.getByTestId('questionnaire-calculating')).toHaveCount(0);
    await page.goto(`/${locale}/nutrition/reveal?plan=${fixture.planId}`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/nutrition/progress\\?`));
    await expect(page.locator('.nutrient-card')).toHaveCount(0);
    await sql.begin(async tx => {
      await tx`set local session_replication_role = replica`;
      await tx`update product_recommendation_runs set catalogue_revision=(select revision from catalogue_runtime_revision where singleton=true) where id=${fixture.runId}::uuid`;
    });
    await page.goto(`/${locale}/nutrition/healthscore?plan=${fixture.planId}`);
    await expect(page.getByTestId('healthscore')).toBeVisible({ timeout: 10000 });
    const section = page.getByTestId('healthscore-shortlist'); await section.scrollIntoViewIfNeeded();
    const values = await section.locator('.stat strong').allTextContents();
    expect(values).toHaveLength(3);
    expect(Number(values[0])).toBeGreaterThan(Number(values[2]));
    expect(values[1]).toBe('✓');
    expect(Number(values[2])).toBe(2);
  } finally { await sql.end(); await rm(directory, { recursive: true, force: true }); }
});

for (const locale of ['en', 'th', 'zh-CN'] as const) {
  for (const width of [1280, 375]) {
    test(`HS-V8-BROWSER-01 ${locale} ${width}px preserves real results, localized controls and precision checkout`, async ({ page }, testInfo) => {
      const sql = postgres(url.href, { max: 1, prepare: false });
      const directory = await mkdtemp(join(tmpdir(), 'hs-v8-'));
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const output = join(directory, 'fixture.json');
        await execute(process.execPath, ['--experimental-strip-types', '--import', './scripts/register-ts-path-loader.mjs', 'scripts/seed-browser-fixtures.ts', output, JSON.stringify({ scenario: 'practical_advice', locale })], { env: process.env, timeout: 60_000, maxBuffer: 1024 * 1024 });
        const fixture = JSON.parse(await readFile(output, 'utf8'));
        const [assessment] = await sql`select answers from assessments where plan_id=${fixture.planId}::uuid`;
        const [catalogue] = await sql`select count(*)::int as count from supplements`;
        const expected = computeHealthScore(assessment.answers, locale, {
          chosenNutrients: 2,
          evaluatedIngredientCount: Math.max(DEFAULT_HEALTHSCORE_EVALUATED_INGREDIENT_COUNT, catalogue.count),
        });
        assert.ok(expected.pageContent);
        const [stored] = await sql`select result from assessment_healthscore_results where plan_id=${fixture.planId}::uuid and locale=${locale}`;
        const result = stored.result as HealthScoreResult;
        assert.ok(result.pageContent);
        const seeds = expected.pageContent.copySeeds;
        // Only the isolated fixture uses deterministic prose in place of an AI call.
        // Exercise locale-specific text, emphasis and personalized findings in the real page.
        const localized = (text: string) => ({ [locale]: text });
        const fixtureResult = { ...result, pageContent: { ...result.pageContent, aiCopy: {
          ...result.pageContent.aiCopy,
          heroTitle: localized(seeds.goalMirror),
          heroBody: localized(seeds.heroBody),
          bandLine: localized(seeds.bandLine),
          highestLeverageBody: localized(seeds.highestLeverage?.text ?? ''),
          strengthNote: localized(seeds.strengthNote ?? ''),
          subtractionBody: localized(seeds.subtraction.body),
          findings: seeds.findings.map(finding => ({ headline: localized(finding.headline), body: localized(finding.body) })),
        } } };
        await sql`update assessment_healthscore_results set result=${sql.json(fixtureResult)} where plan_id=${fixture.planId}::uuid and locale=${locale}`;

        await page.goto(`/${locale}/nutrition/healthscore?plan=${fixture.planId}`);
        const root = page.getByTestId('healthscore');
        const copy = healthScoreV8Copy[locale];
        await expect(root).toBeVisible();
        await expect(page.locator('.mn-titlebar')).toHaveCount(1);
        await expect(page.locator('.mn-site-footer')).toHaveCount(1);
        await expect(root.locator('header, footer, .profilePicker, [data-profile]')).toHaveCount(0);
        await expect(root.locator('.progress-nav [aria-current="step"]')).toHaveText(new RegExp(copy.steps[1]));
        await expect(root.locator('.score-num')).toHaveText(`${expected.score}/100`);
        await expect(root.locator('.pillar .value')).toHaveText(expected.pageContent.locked.pillars.map(pillar => `${pillar.value}%`));
        const widths = await root.locator('.pillar .fill').evaluateAll(elements => elements.map(element => (element as HTMLElement).style.width));
        expect(widths).toEqual(expected.pageContent.locked.pillars.map(pillar => `${pillar.value}%`));
        await expect(root.getByTestId('healthscore-shortlist').locator('.stat strong')).toHaveText([String(expected.pageContent.locked.subtraction.evaluated), '✓', '2']);
        await expect(root.locator('.findings .finding')).toHaveCount(Math.min(3, seeds.findings.length));
        await expect(root.locator('.hero-title')).toContainText('Browser Fixture');
        await expect(root.locator('[data-buy="hero"]')).toHaveText(`${copy.cta}→`);
        await expect(root.locator('.hero .price')).toHaveText('฿690');
        await expect(root.locator('.dock')).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: testInfo.outputPath('healthscore-hero.png') });

        const faq = root.locator('.faq details').first();
        await faq.locator('summary').click();
        await expect(faq).toHaveAttribute('open', '');
        await expect(faq.locator('p')).toBeVisible();
        await expect(faq.locator('p')).toHaveText(copy.faqs[0][1]);
        await faq.locator('summary').click();
        await expect(faq).not.toHaveAttribute('open', '');

        const video = root.locator('#sample-video');
        await video.scrollIntoViewIfNeeded();
        expect(await video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
        await expect(video).toHaveAttribute('preload', 'none');
        await expect(video.locator('source')).toHaveAttribute('src', `/healthscore/v8-4/sample-${locale === 'th' ? 'th' : 'en'}.mp4`);
        await root.getByRole('button', { name: copy.samplePlay, exact: true }).click();
        await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false);
        await root.getByRole('button', { name: copy.samplePause, exact: true }).click();
        await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
        await video.evaluate(element => { (element as HTMLVideoElement).currentTime = 5; });
        await root.getByRole('button', { name: copy.sampleReplay, exact: true }).click();
        await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeLessThan(2);

        await root.locator('#inside-title').evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 40));
        await expect(root.locator('.dock')).toBeVisible();
        await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({ path: testInfo.outputPath('healthscore-sticky.png') });
        await root.locator('[data-buy="closing"]').scrollIntoViewIfNeeded();
        await expect(root.locator('.dock')).toBeHidden();

        // Observe the existing checkout URL without entering a payment provider.
        await page.route(`**/${locale}/nutrition/payment/checkout?**`, route => route.fulfill({ contentType: 'text/html', body: '<main>Isolated checkout navigation verified</main>' }));
        const position = width === 375 ? (locale === 'th' ? 'closing' : 'dock') : locale === 'th' ? 'insights' : 'hero';
        if (position === 'dock') {
          await root.locator('#inside-title').evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 40));
          await expect(root.locator('.dock')).toBeVisible();
        }
        await root.locator(`[data-buy="${position}"]`).click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/nutrition/payment/checkout\\?`));
        const target = new URL(page.url());
        expect(Object.fromEntries(target.searchParams)).toEqual({ plan: 'precision', source: 'healthscore', planId: fixture.planId });
        expect(errors).toEqual([]);
      } finally {
        await sql.end();
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
}
