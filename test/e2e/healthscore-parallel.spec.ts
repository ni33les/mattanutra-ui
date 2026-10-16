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
import { completeHealthScoreFixture } from '../fixtures/healthscore';
const execute = promisify(execFile);
assert.ok(process.env.TEST_DB_URL, 'Isolated PostgreSQL is required');
const url = new URL(process.env.TEST_DB_URL); assert.equal(url.hostname, '127.0.0.1'); assert.match(url.pathname, /^\/mattanutra_lock_review_/);

function compactScore(result: HealthScoreResult): HealthScoreResult {
  const page = result.pageContent, copy = page?.aiCopy;
  assert.ok(page && copy);
  return { ...result, pageContent: { ...page, aiCopy: {
    version: 2, bandLine: copy.bandLine, heroBody: copy.heroBody, heroTitle: copy.heroTitle,
    highestLeverageBody: copy.highestLeverageBody, strengthNote: copy.strengthNote,
    subtractionBody: copy.subtractionBody, findings: copy.findings, methodCards: copy.methodCards,
  } } };
}

for (const locale of ['en', 'th', 'zh-CN']) test(`HS-PAR-BROWSER-01 ${locale} opens score and checkout before the formula, then adds the real count`, async ({ page }, testInfo) => {
  const sql = postgres(url.href, { max: 1, prepare: false });
  const directory = await mkdtemp(join(tmpdir(), 'hs-parallel-'));
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const output = join(directory, 'fixture.json');
    await execute(process.execPath, ['--experimental-strip-types', '--import', './scripts/register-ts-path-loader.mjs', 'scripts/seed-browser-fixtures.ts', output, JSON.stringify({ scenario: 'practical_advice', locale })], { env: process.env, timeout: 60_000, maxBuffer: 1024 * 1024 });
    const fixture = JSON.parse(await readFile(output, 'utf8'));
    const generationRequests: string[] = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (request.method() === 'POST' && path.startsWith(`/api/assessment/${fixture.planId}/`) && path.endsWith('/retry')) generationRequests.push(path);
    });
    const [assessment] = await sql`select input_revision from assessments where plan_id=${fixture.planId}::uuid`;
    // These controlled versions are hidden only inside the disposable fixture.
    // Production formulation and recommendation versions remain append-only.
    await sql.begin(async tx => {
      await tx`set local session_replication_role = replica`;
      await tx`update formulations set assessment_revision=-1 where plan_id=${fixture.planId}::uuid`;
      await tx`update product_recommendation_runs set catalogue_revision=-1 where id=${fixture.runId}::uuid`;
    });
    const [copy] = await sql`select result from assessment_healthscore_results where plan_id=${fixture.planId}::uuid and locale=${locale}`; assert.ok(copy);
    await sql`update assessment_healthscore_results set result='{}'::jsonb where plan_id=${fixture.planId}::uuid and locale=${locale}`;
    await page.goto(`/${locale}/nutrition/healthscore?plan=${fixture.planId}`);
    await expect(page.getByTestId('questionnaire-calculating')).toBeVisible();
    await expect(page.getByTestId('healthscore')).toHaveCount(0);
    await sql`update assessment_healthscore_results set result=${sql.json(compactScore(copy.result))} where plan_id=${fixture.planId}::uuid and locale=${locale}`;
    const root = page.getByTestId('healthscore');
    await expect(root).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('questionnaire-calculating')).toHaveCount(0);
    await expect(root.getByTestId('healthscore-formula-pending')).toBeVisible();
    await expect(root.getByTestId('healthscore-shortlist')).toHaveCount(0);
    const retriesBeforeReading = generationRequests.length;
    const score = await root.locator('.score-num').textContent();
    expect(score).toMatch(/^\d+\/100$/);
    for (const button of await root.locator('[data-buy]').all()) await expect(button).toBeEnabled();
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await root.getByTestId('healthscore-formula-pending').scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`formula-pending-${width}.png`) });
    }
    // Open the actual isolated checkout page without submitting a payment.
    await root.locator('[data-buy="hero"]').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/nutrition/payment/checkout\\?`));
    const checkout = page.locator('form[action="/api/payments/mock-pay"]');
    await expect(checkout).toBeVisible();
    await expect(checkout.locator('input[name="planId"]')).toHaveValue(fixture.planId);
    await expect(checkout.locator('input[name="plan"]')).toHaveValue('precision');
    await expect(checkout.locator('input[name="sourceSurface"]')).toHaveValue('healthscore');
    const [stillPreparing] = await sql`select count(*)::int as count from formulations where plan_id=${fixture.planId}::uuid and assessment_revision=${assessment.input_revision}`;
    expect(stillPreparing.count).toBe(0);
    await page.goto(`/${locale}/nutrition/healthscore?plan=${fixture.planId}`);
    await expect(root.getByTestId('healthscore-formula-pending')).toBeVisible();
    await expect(root.getByTestId('healthscore-shortlist')).toHaveCount(0);
    // Formula completion changes this open page through its read-only observer.
    await sql.begin(async tx => {
      await tx`set local session_replication_role = replica`;
      await tx`update formulations set assessment_revision=${assessment.input_revision}, formulation=jsonb_set(formulation,'{sectionStatuses,supplements}','"pending"'),read_projection=null where plan_id=${fixture.planId}::uuid`;
    });
    const section = root.getByTestId('healthscore-shortlist');
    await expect(section).toBeVisible({ timeout: 15000 });
    await expect(section.locator('.stat strong').nth(2)).toHaveText('2');
    await expect(root.getByTestId('healthscore-formula-pending')).toHaveCount(0);
    await expect(root.locator('.score-num')).toHaveText(score!);
    expect(generationRequests).toHaveLength(retriesBeforeReading);
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await section.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`formula-ready-${width}.png`) });
    }
    await page.goto(`/${locale}/nutrition/reveal?plan=${fixture.planId}`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/nutrition/progress\\?`));
    await expect(page.locator('.nutrient-card')).toHaveCount(0);
    await sql.begin(async tx => {
      await tx`set local session_replication_role = replica`;
      await tx`update product_recommendation_runs set catalogue_revision=(select revision from catalogue_runtime_revision where singleton=true) where id=${fixture.runId}::uuid`;
    });
    await page.goto(`/${locale}/nutrition/healthscore?plan=${fixture.planId}`);
    await expect(page.getByTestId('healthscore')).toBeVisible({ timeout: 10000 });
    await section.scrollIntoViewIfNeeded();
    const values = await section.locator('.stat strong').allTextContents();
    expect(values).toHaveLength(3);
    expect(Number(values[0])).toBeGreaterThan(Number(values[2]));
    expect(values[1]).toBe('✓');
    expect(Number(values[2])).toBe(2);
  } finally { await sql.end(); await rm(directory, { recursive: true, force: true }); }
});

for (const outcome of ['zero', 'failed', 'stale-revision', 'stale-locale'] as const) {
  test(`HS-PAR-BROWSER-02 ${outcome} never substitutes an invented or stale nutrient count`, async ({ page }) => {
    const sql = postgres(url.href, { max: 1, prepare: false });
    const directory = await mkdtemp(join(tmpdir(), 'hs-formula-status-'));
    try {
      const output = join(directory, 'fixture.json');
      await execute(process.execPath, ['--experimental-strip-types', '--import', './scripts/register-ts-path-loader.mjs', 'scripts/seed-browser-fixtures.ts', output, JSON.stringify({ scenario: 'practical_advice', locale: 'en' })], { env: process.env, timeout: 60_000, maxBuffer: 1024 * 1024 });
      const fixture = JSON.parse(await readFile(output, 'utf8'));
      const [assessment] = await sql`select input_revision from assessments where plan_id=${fixture.planId}::uuid`;
      await sql.begin(async tx => {
        await tx`set local session_replication_role = replica`;
        await tx`update formulations set assessment_revision=-1 where plan_id=${fixture.planId}::uuid`;
      });
      let reads = 0, refreshed = false;
      page.on('response', response => {
        const target = new URL(response.url());
        // RSC responses may keep streaming after the refresh is accepted.
        // Its HTTP response proves the stale-value handler requested a refresh.
        if (response.status() === 200 && target.pathname === '/en/nutrition/healthscore' && target.searchParams.has('_rsc')) refreshed = true;
      });
      await page.route(`**/api/assessment/${fixture.planId}/journey?**`, route => {
        reads++;
        return route.fulfill({ json: {
          planId: fixture.planId, locale: outcome === 'stale-locale' ? 'th' : 'en',
          revision: Number(assessment.input_revision) + (outcome === 'stale-revision' ? 1 : 0),
          copyReady: true, readyForHealthScore: true, copyFailed: false, healthScorePageFailed: false,
          preparedNutrientCount: outcome.startsWith('stale') ? 99 : outcome === 'zero' ? 0 : null,
          preparedFormulaFailed: outcome === 'failed',
        } });
      });
      await page.goto(`/en/nutrition/healthscore?plan=${fixture.planId}`);
      const root = page.getByTestId('healthscore');
      await expect(root).toBeVisible();
      await expect.poll(() => reads).toBeGreaterThan(0);
      await expect(root.getByTestId('healthscore-shortlist')).toHaveCount(0);
      if (outcome.startsWith('stale')) {
        await expect.poll(() => refreshed).toBe(true);
        await expect(root.getByTestId('healthscore-shortlist')).toHaveCount(0);
        await expect(root.getByTestId('healthscore-formula-pending')).toBeVisible();
      } else {
        await expect(root.getByTestId('healthscore-formula-pending')).toHaveCount(0);
      }
      await expect(root.locator('[data-buy="hero"]')).toBeEnabled();
      await expect(root.locator('.score-num')).toHaveText(/^\d+\/100$/);
      await expect(page.getByTestId('questionnaire-calculating')).toHaveCount(0);
    } finally { await sql.end(); await rm(directory, { recursive: true, force: true }); }
  });
}

test('HS-PAR-BROWSER-03 pharmacy keeps products and ordering gated until matching finishes', async ({ page }) => {
  const seed = async (ready: boolean, existing: unknown = null) => {
    const { stdout } = await execute(process.execPath, ['--experimental-strip-types', '--import', './test/helpers/offline-network.mjs', '--import', './scripts/register-ts-path-loader.mjs', '--input-type=module', '-e',
      `import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';import {warmLiveRetailSnapshot} from './lib/agentic/catalogue/live.ts';import {warmSupplementEffectiveAvailability} from './lib/supplement-country-availability.ts';try{const fixture=await seedPharmacyFixture('en',process.argv[1]==='true',JSON.parse(process.argv[2]));await Promise.all([warmLiveRetailSnapshot('TH'),warmSupplementEffectiveAvailability('TH')]);console.log('FIXTURE:'+JSON.stringify(fixture));}finally{await closeSqlPool();}`, String(ready), JSON.stringify(existing)], { env: process.env, timeout: 30000 });
    return JSON.parse(stdout.split('\n').find(line => line.startsWith('FIXTURE:'))!.slice(8));
  };
  const sql = postgres(url.href, { max: 1, prepare: false });
  try {
    const saved = await seed(false);
    await page.goto(`/en/retail/${saved.slug}/reveal?plan=${saved.planId}`);
    await expect(page.getByTestId('pharmacy-combined')).toBeVisible();
    await expect(page.getByTestId('healthscore')).toHaveCount(0);
    await expect(page.getByTestId('pharmacy-order')).toHaveCount(0);
    await expect(page.locator('.mn-products .mn-product')).toHaveCount(0);
    await seed(true, saved);
    const compact = compactScore(completeHealthScoreFixture('en'));
    const methodTitles = ['Saved compact method one', 'Saved compact method two', 'Saved compact method three'];
    const compactAnalysis = { ...compact, pageContent: { ...compact.pageContent!, aiCopy: {
      ...compact.pageContent!.aiCopy,
      methodCards: methodTitles.map(headline => ({ headline: { en: headline }, body: { en: 'Saved personalised plan explanation.' } })),
    } } };
    await sql`insert into assessment_healthscore_results (plan_id,revision,locale,generator_version,result)
      values (${saved.planId}::uuid,${saved.revision},'en','web-funnel-v3-flexible',${sql.json(compactAnalysis)})`;
    const [formulaBefore] = await sql`select formulation from formulations where plan_id=${saved.planId}::uuid order by version desc limit 1`;
    await sql.begin(async tx => {
      await tx`set local session_replication_role = replica`;
      await tx`update product_recommendation_runs set catalogue_revision=-1 where plan_id=${saved.planId}::uuid`;
    });
    await page.reload();
    await expect(page.getByTestId('pharmacy-combined')).toBeVisible();
    await expect(page.getByTestId('pharmacy-order')).toHaveCount(0);
    await expect(page.locator('.mn-products .mn-product')).toHaveCount(0);
    await sql.begin(async tx => {
      await tx`set local session_replication_role = replica`;
      await tx`update product_recommendation_runs set catalogue_revision=(select revision from catalogue_runtime_revision where singleton=true) where plan_id=${saved.planId}::uuid`;
    });
    await expect(page.getByTestId('pharmacy-order')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.mn-products .mn-product')).toHaveCount(1);
    await expect(page.getByTestId('healthscore')).toHaveCount(0);
    await page.getByTestId('pharmacy-deep-dive-link').click();
    const deepDive = page.getByTestId('pharmacy-deep-dive');
    await expect(deepDive).toBeVisible();
    await expect(deepDive.locator('#s03 .method h3')).toHaveText(methodTitles);
    await expect(deepDive.getByTestId('deep-dive-product')).toHaveCount(1);
    const [formulaAfter] = await sql`select formulation from formulations where plan_id=${saved.planId}::uuid order by version desc limit 1`;
    expect(formulaAfter.formulation).toEqual(formulaBefore.formulation);
  } finally { await sql.end(); }
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
