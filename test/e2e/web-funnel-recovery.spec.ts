import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { expect, test, type Page } from "../helpers/offline-browser";
const execute = promisify(execFile);
const databaseUrl = process.env.TEST_DB_URL;
assert.ok(databaseUrl, "Requires the isolated PostgreSQL funnel fixture database and matching app server");
// Fixture process startup is outside the product's 90-second foreground wait.
// Keep each fixture bounded while allowing the complete multi-stage journey.
test.setTimeout(240_000);
async function fixture(input: Record<string, unknown>) {
  const { stdout } = await execute(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "--import", "./test/helpers/offline-network.mjs", "test/helpers/web-funnel-fixture.ts", JSON.stringify(input)], {
    env: { ...process.env, TEST_DB_URL: databaseUrl }, maxBuffer: 1024 * 1024,
    timeout: 60_000, killSignal: "SIGKILL"
  });
  return JSON.parse(stdout.split("\n").find(line => line.startsWith("FIXTURE:"))!.slice(8));
}
async function fill(page: Page) {
  await expect(page.getByTestId("questionnaire-welcome")).toBeVisible();
  const captured = page.waitForResponse(r => /\/api\/assessment$/.test(r.url()) && r.request().method() === "POST");
  await page.getByTestId("dev-fill-questionnaire").click();
  const response = await captured;
  expect(response.status()).toBe(200);
  return response.json();
}
async function preferenceFixture(locale: string) {
  const directory = await mkdtemp(join(tmpdir(), "anna-browser-preference-"));
  try {
    const output = join(directory, "fixture.json");
    await execute(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "--import", "./test/helpers/offline-network.mjs",
      "scripts/seed-browser-fixtures.ts", output, JSON.stringify({ scenario: "numeric_preferences", locale })], {
      env: { ...process.env, TEST_DB_URL: databaseUrl }, maxBuffer: 1024 * 1024, timeout: 60_000, killSignal: "SIGKILL"
    });
    return JSON.parse(await readFile(output, "utf8"));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
test("fresh browser resumes server answers; unrelated drafts and previous contact are ignored", async ({ page }) => {
  const resumed = await fixture({ action: "resume" });
  await page.addInitScript(() => {
    localStorage.setItem("mn_healthscore_delivery_email", "previous@funnel-fixture.test");
    localStorage.setItem("mn_state_v6_en", JSON.stringify({ answers: { firstName: "Wrong Visitor" } }));
    localStorage.setItem("mn-questionnaire:v1:unrelated", JSON.stringify({ answers: { firstName: "Wrong Visitor" } }));
  });
  await page.goto(`/en/nutrition/quiz?resume=${resumed.token}&source=fixture&selectedPlan=precision`);
  await expect(page.getByTestId("chat-questionnaire")).toBeVisible();
  const drafts = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("mn-questionnaire:v1:")).map(k => JSON.parse(localStorage.getItem(k)!)));
  const current = drafts.find(d => d.state?.answers?.firstName === "Resume Fixture");
  expect(current.contactEmail).toBe("resume@funnel-fixture.test");
  expect(current.state.planId).toBe(resumed.planId);
  const zhLink = page.locator('.mn-language-switcher a[href^="/zh-CN/"]');
  expect(await zhLink.getAttribute("href")).toContain(`resume=${resumed.token}`);
  expect(await zhLink.getAttribute("href")).toContain("selectedPlan=precision");
  await zhLink.click();
  await expect(page.getByTestId("chat-questionnaire")).toBeVisible();
  await page.goto("/en/nutrition/quiz");
  const captured = await fill(page);
  const stored = await fixture({ action: "state", planId: captured.planId });
  expect(stored.contact_email).toBeNull();
  expect(stored.answers.firstName).not.toBe("Wrong Visitor");
});

test("capture failure, persistence failure, reload and analysis retry remain separate", async ({ page }) => {
  await page.clock.install();
  let captures = 0;
  await page.route("**/api/assessment", route => {
    if (route.request().method() !== "POST") return route.continue();
    captures += 1;
    return captures === 1 ? route.fulfill({ status: 500, json: { message: "fixture capture interruption" } }) : route.continue();
  });
  await page.goto("/en/nutrition/quiz");
  await page.getByTestId("dev-fill-questionnaire").click();
  await expect(page.getByTestId("retry-capture")).toBeVisible();
  await expect(page.getByTestId("retry-analysis")).toHaveCount(0);
  await expect(page.getByTestId("calc-emailbox")).toHaveCount(0);
  const capturedResponse = page.waitForResponse(r => /\/api\/assessment$/.test(r.url()) && r.status() === 200);
  await page.getByTestId("retry-capture").click();
  const captured = await (await capturedResponse).json();
  // Reload after the successful receipt, before AI advice is ready: no new capture request.
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("mn-questionnaire:v1:") && JSON.parse(localStorage.getItem(k)!).captured))).toBe(true);
  await page.reload();
  await expect(page.getByTestId("questionnaire-calculating")).toBeVisible();
  await page.route("**/journey?locale=*", route => route.fulfill({ json: { copyReady: false, copyFailed: true, healthScorePageFailed: true, readyForHealthScore: false } }));
  await expect(page.getByTestId("retry-analysis")).toBeVisible();
  await expect(page.getByTestId("retry-capture")).toHaveCount(0);
  expect(captures).toBe(2);
  await expect(page.getByTestId("calc-emailbox")).toHaveCount(0);
  await page.clock.fastForward(120_000);
  await expect(page.getByTestId("calc-emailbox")).toBeVisible();
  await page.route("**/healthscore-delivery", route => route.fulfill({ status: 500, json: { message: "fixture delivery persistence failure" } }));
  await page.locator('[data-testid="calc-emailbox"] input').fill("sink@funnel-fixture.test");
  await page.locator('[data-testid="calc-emailbox"] button').click();
  await expect(page.getByTestId("questionnaire-calculating").getByRole("alert")).toContainText("fixture delivery persistence failure");
  await page.unroute("**/healthscore-delivery");
  await page.locator('[data-testid="calc-emailbox"] button').click();
  await expect(page.getByTestId("calc-emailbox")).toHaveCount(0);
  await fixture({ action: "copy", planId: captured.planId });
  await fixture({ action: "ready", planId: captured.planId });
  await page.unroute("**/journey?locale=*");
  await page.getByTestId("retry-analysis").click();
  expect(captures).toBe(2);
  await expect(page).toHaveURL(new RegExp(`healthscore\\?plan=${captured.planId}`));
  await expect(page.locator(".mn-healthscore-v7")).toBeVisible();
});

for (const locale of ["en", "th", "zh-CN"] as const) {
  test(`ANNA-BROWSER-06 concise reveal, unknown pills and exclusion binding in ${locale}`, async ({ page }) => {
    const seeded = await preferenceFixture(locale);
    const scenario = seeded.preferenceScenario;
    expect(scenario.selectedProductCount).toBe(2);
    expect(scenario.selectedDailyPills).toBe(2);
    const reveal = `/${locale}/nutrition/reveal?plan=${seeded.planId}`;
    await page.goto(reveal);
    await expect(page.locator(".mn-reveal-final")).toBeVisible();
    const preferences = page.getByTestId("selected-matching-preferences");
    await expect(preferences).toHaveCount(0);
    await expect(page.getByTestId("matching-option")).toHaveCount(0);

    // A declared response fixture exercises incomplete physical metadata in the
    // browser. The real stored purchase option and monetary facts remain intact.
    let unknownResponses = 0;
    await page.route("**/formulation?locale=*&products=1", async route => {
      const response = await route.fetch();
      const payload = await response.json();
      const visit = (value: unknown) => {
        if (Array.isArray(value)) { value.forEach(visit); return; }
        if (!value || typeof value !== "object") return;
        const row = value as Record<string, unknown>;
        if (row.candidateKey && Array.isArray(row.productIds) && Array.isArray(row.preferences)) {
          row.dailyPills = null;
          for (const preference of row.preferences as Array<Record<string, unknown>>) {
            if (preference.kind === "daily_pills") Object.assign(preference, { actual: null, complete: false, delta: null,
              percent: null, status: "unknown", prominent: false, messageKey: "plan.preference.unknown" });
          }
          unknownResponses += 1;
        }
        Object.values(row).forEach(visit);
      };
      visit(payload);
      await route.fulfill({ response, json: payload });
    });
    await page.reload();
    const unknown = { en: "total unknown", th: "ไม่ทราบจำนวนรวม", "zh-CN": "总数未知" }[locale]!;
    await expect(page.locator("#products")).toContainText(unknown);
    await expect(preferences).toHaveCount(0);
    expect(unknownResponses).toBeGreaterThan(0);
    await expect(page.getByTestId("matching-option")).toHaveCount(0);
    // Previously issued checkout URLs remain valid even though reveal no longer lists alternatives.
    const params = new URLSearchParams({ plan: seeded.planId, selected: scenario.alternative.productIds.join(","),
      option: scenario.alternative.candidateKey, run: seeded.runId, revision: "1", selectionRevision: "0" });
    await expect(page.getByRole("checkbox", { name: /acknowledge|รับทราบ|确认风险/i })).toHaveCount(0);
    await page.goto(`/${locale}/basket/checkout?${params}`);
    await expect(page).toHaveURL(/\/basket\/checkout\?/);
    await expect(page.locator('input[name="customerName"]').first()).toBeVisible();
    const selection = { action: "checkoutSelection", locale, planId: seeded.planId, runId: seeded.runId,
      candidateKey: scenario.alternative.candidateKey, selectedItemIds: scenario.alternative.productIds, assessmentRevision: 1, selectionRevision: 0 };
    expect(await fixture(selection)).toEqual({ allowed: true, productIds: scenario.alternative.productIds });

    await page.unroute("**/formulation?locale=*&products=1");
    await page.goto(reveal);
    await expect(page.locator("#products .product-card")).toHaveCount(2);
    const remove = page.locator("#products .product-card .product-remove-btn");
    await remove.nth(0).click();
    await remove.nth(1).click();
    const replanLabel = { en: "Exclude removed products and replan", th: "ยกเว้นสินค้าที่นำออกและจัดแผนใหม่", "zh-CN": "排除已移除的商品并重新规划" }[locale]!;
    const revisedResponse = page.waitForResponse(response => response.url().endsWith(`/api/assessment/${seeded.planId}/product-recommendations`) && response.request().method() === "POST");
    await page.getByRole("button", { name: replanLabel, exact: true }).click();
    const response = await revisedResponse;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toMatchObject({ locale, assessmentRevision: 1, selectionRevision: 0,
      excludeProductIds: expect.arrayContaining(scenario.selectedProductIds) });
    expect((await response.json()).selectionRevision).toBe(1);
    await expect(page.locator('#products a[href*="/basket/checkout?"]')).toHaveCount(0);
    expect(await fixture(selection)).toEqual({ allowed: false, code: "stale_product_selection", status: 409 });
  });
  test(`ordinary checkout and pending reveal recover in ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/nutrition/quiz`);
    const capture = await fill(page);
    await fixture({ action: "copy", locale, planId: capture.planId });
    await expect(page.getByTestId("questionnaire-calculating")).toBeVisible();
    const formula = await fixture({ action: "formula", locale, planId: capture.planId });
    await expect(page).toHaveURL(new RegExp(`healthscore\\?plan=${capture.planId}`), { timeout: 15_000 });
    await expect(page.getByTestId("reveal-hero-name")).toBeVisible();
    await page.goto(`/${locale}/nutrition/payment/checkout?plan=precision&planId=${capture.planId}&source=healthscore`);
    const switchHref = await page.locator('.mn-language-switcher a[href^="/th/"]').getAttribute("href");
    expect(switchHref).toContain(`planId=${capture.planId}`);
    expect(switchHref).toContain("plan=precision");
    await page.locator('form[action="/api/payments/mock-pay"] button').click();
    await expect(page).toHaveURL(/nutrition\/progress/);
    await page.goto(`/${locale}/nutrition/reveal?plan=${capture.planId}`);
    await expect(page).toHaveURL(/nutrition\/progress/);
    const responses = await Promise.all([0, 1].map(products => page.request.get(`/api/assessment/${capture.planId}/formulation?locale=${locale}&products=${products}`)));
    expect(responses.map(r => r.status())).toEqual([202, 202]);
    await fixture({ action: "fulfill", planId: capture.planId });
    const prepared = await Promise.all([0, 1].map(products => page.request.get(`/api/assessment/${capture.planId}/formulation?locale=${locale}&products=${products}`)));
    expect(prepared.map(r => r.status())).toEqual([200, 200]);
    expect((await prepared[0].json()).supplementBreakdown).toHaveLength(1);
    expect((await prepared[1].json()).productRecommendations.status).toBe("pending");
    const completed = await fixture({ action: "ready", locale, planId: capture.planId });
    expect(completed.formulaVersion).toBe(formula.formulaVersion);
    await expect(page.locator(".mn-reveal-final")).toBeVisible({ timeout: 30_000 });
    const persisted = await fixture({ action: "state", planId: capture.planId });
    expect(persisted.payments).toBe(1); expect(persisted.revenues).toBe(1); expect(persisted.formulations).toBe(1);
  });
  test(`prepaid reservation survives resume and language context in ${locale}`, async ({ page }) => {
    const paymentResponse = await page.request.post("/api/payments/mock-pay", { data: { locale, plan: "precision", sourceSurface: "landing", attemptId: randomUUID() } });
    expect(paymentResponse.ok()).toBe(true);
    const payment = await paymentResponse.json();
    const paymentId = payment.payment.id;
    const resume = await fixture({ action: "resume", locale, paymentId });
    await page.goto(`/${locale}/nutrition/quiz?resume=${resume.token}&payment=${paymentId}&source=landing&selectedPlan=precision`);
    const href = await page.locator('.mn-language-switcher a[href^="/en/"]').getAttribute("href");
    expect(href).toContain(`payment=${paymentId}`); expect(href).toContain(`resume=${resume.token}`);
    // Resume state arrives in a new browser, then the DEV fixture CTA completes the real capture transport.
    const captureResponse = page.waitForResponse(r => r.url().includes(`/api/assessment/${resume.planId}`) && r.request().method() === "PATCH");
    await page.getByTestId("dev-fill-questionnaire").click();
    expect((await captureResponse).status()).toBe(200);
    expect((await fixture({ action: "state", planId: resume.planId })).payments).toBe(1);
    await fixture({ action: "copy", locale, planId: resume.planId });
    await fixture({ action: "fulfill", paymentId });
    await fixture({ action: "ready", locale, planId: resume.planId });
    await page.goto(`/${locale}/nutrition/reveal?plan=${resume.planId}`);
    await expect(page.locator(".mn-reveal-final")).toBeVisible({ timeout: 30_000 });
    const email = await fixture({ action: "email", locale, planId: resume.planId });
    expect(email.sink).toHaveLength(1);
    expect(JSON.stringify(email.sink)).not.toContain("Resume Fixture");
  });
}

test("progress and reveal expose working recovery actions without another capture or charge", async ({ page }) => {
  const capture = await fixture({ action: "capture" });
  await fixture({ action: "copy", planId: capture.planId });
  const payment = await page.request.post("/api/payments/mock-pay", { data: { locale: "en", plan: "precision", planId: capture.planId, sourceSurface: "healthscore", attemptId: randomUUID() } });
  expect(payment.ok()).toBe(true);
  await fixture({ action: "fulfill", planId: capture.planId });
  let journeyFailed = true, fullFailed = true, recoveries = 0, refreshes = 0;
  page.on("request", request => {
    if (request.url().endsWith("/journey/retry")) recoveries += 1;
    if (request.url().endsWith("/formulation/refresh")) refreshes += 1;
  });
  await page.route("**/journey?locale=*", async route => {
    const response = await route.fetch(); const state = await response.json();
    await route.fulfill({ json: journeyFailed ? { ...state, failed: true, readyForReveal: false } : state });
  });
  await page.route("**/formulation?locale=*&products=1", route => fullFailed
    ? route.fulfill({ status: 404, json: { message: "fixture reveal read failure" } }) : route.continue());
  await page.goto(`/en/nutrition/reveal?plan=${capture.planId}`);
  await expect(page.getByTestId("journey-progress-retry")).toBeVisible();
  await page.getByTestId("journey-progress-retry").click();
  await expect.poll(() => recoveries).toBe(2);
  await fixture({ action: "ready", planId: capture.planId });
  journeyFailed = false;
  await page.getByTestId("journey-progress-retry").click();
  await expect(page.getByTestId("formulation-retry")).toBeVisible({ timeout: 15_000 });
  fullFailed = false;
  await page.getByTestId("formulation-retry").click();
  await expect(page.locator(".mn-reveal-final")).toBeVisible();
  expect(refreshes).toBeGreaterThanOrEqual(2);
  const stored = await fixture({ action: "state", planId: capture.planId });
  expect(stored.payments).toBe(1); expect(stored.revenues).toBe(1); expect(Number(stored.input_revision)).toBe(1);
  await page.goto(`/en/nutrition/quiz?plan=${capture.planId}&reassessment=1`);
  await expect(page.locator(".mn-chat-q__review-edit").first()).toBeVisible();
});


test("a completed no-purchase formulation opens reveal without an endless analysis loop", async ({ page }) => {
  const capture = await fixture({ action: "capture" });
  await fixture({ action: "copy", planId: capture.planId });
  const payment = await page.request.post("/api/payments/mock-pay", { data: { locale: "en", plan: "precision", planId: capture.planId, sourceSurface: "healthscore", attemptId: randomUUID() } });
  expect(payment.ok()).toBe(true);
  await fixture({ action: "fulfill", planId: capture.planId });
  await fixture({ action: "ready", planId: capture.planId, empty: true });
  await page.goto(`/en/nutrition/reveal?plan=${capture.planId}`);
  await expect(page.locator(".mn-reveal-final")).toBeVisible({ timeout: 30_000 });
  expect((await fixture({ action: "state", planId: capture.planId })).payments).toBe(1);
});
