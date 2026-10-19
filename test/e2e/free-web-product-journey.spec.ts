import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "../helpers/offline-browser";
const execute = promisify(execFile);
test.setTimeout(180_000);
async function fixture(input: Record<string, unknown>) {
  const { stdout } = await execute(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "--import", "./test/helpers/offline-network.mjs", "test/helpers/web-funnel-fixture.ts", JSON.stringify(input)], {
    env: process.env, timeout: 60_000, maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout.split("\n").find(line => line.startsWith("FIXTURE:"))!.slice(8));
}

for (const locale of ["en", "th", "zh-CN"]) {
  test(`${locale}: free reveal stays on one page, exposes formula before matching and survives reload`, async ({ page }, testInfo) => {
    const captured = await fixture({ action: "capture", locale });
    const rationale = locale === "th" ? "เหตุผลเฉพาะคุณสำหรับข้อมูลทดสอบ" : locale === "zh-CN" ? "适合您的测试推荐理由" : "Fixture rationale";
    let paidCheckouts = 0, generationRequests = 0;
    const formulationReads: string[] = [];
    page.on("request", request => {
      if (request.method() === "POST" && request.url().includes("/api/payments/checkout-session")) paidCheckouts++;
      if (request.method() === "POST" && /\/(journey\/retry|formulation\/refresh)$/.test(new URL(request.url()).pathname)) generationRequests++;
      if (request.method() === "GET" && new URL(request.url()).pathname.endsWith("/formulation")) formulationReads.push(new URL(request.url()).searchParams.get("products") ?? "");
    });
    const url = `/${locale}/nutrition/reveal?plan=${captured.planId}`;
    await page.goto(url);
    await expect(page.getByTestId("web-product-journey")).toHaveAttribute("data-stage", "formula");
    await expect(page.getByTestId("web-preparation-detail")).toHaveAttribute("data-card", "goals");
    await fixture({ action: "formula", planId: captured.planId, locale, rationale });
    await expect(page.getByTestId("web-product-journey")).toHaveAttribute("data-stage", "products", { timeout: 20_000 });
    await expect(page.locator(".mn-reveal-formula")).toContainText("1000");
    await expect(page.locator(".mn-reveal-formula")).toContainText(rationale);
    expect(formulationReads).toContain("0");
    await page.locator(".mn-reveal-formula-card").scrollIntoViewIfNeeded();
    await expect(page.locator(".mn-reveal-formula-card")).toHaveCSS("opacity", "1");
    await expect(page.locator(".nutrient-body")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${locale}-formula-before-products.png`) });
    const previousHeight = await page.getByTestId("web-product-journey").evaluate(element => element.getBoundingClientRect().height);
    if (locale !== "en") {
      await page.reload();
      await expect(page.getByTestId("web-product-journey")).toHaveAttribute("data-stage", "products");
    }
    await fixture({ action: "ready", planId: captured.planId, locale });
    await expect(page.getByTestId("web-product-journey")).toHaveAttribute("data-stage", "ready", { timeout: 20_000 });
    await expect(page.locator(".nutrient-toggle")).toBeChecked();
    expect(await page.getByTestId("web-product-journey").evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(previousHeight);
    await page.reload();
    await expect(page.getByTestId("web-product-journey")).toHaveAttribute("data-stage", "ready");
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId("payment-confirmed")).toHaveCount(0);
    expect(paidCheckouts).toBe(0);
    expect(generationRequests).toBe(0);
    const state = await fixture({ action: "state", planId: captured.planId });
    expect(state.selected_plan).toBeNull(); expect(state.payments).toBe(0);
  });
}

test("details rotate every six seconds, stop on interaction/reduced motion, and show a slow notice after two minutes", async ({ page }) => {
  const captured = await fixture({ action: "capture", locale: "en" });
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/en/nutrition/reveal?plan=${captured.planId}`);
  const card = page.getByTestId("web-preparation-detail");
  await expect(card).toHaveAttribute("data-card", "goals");
  await page.getByRole("button", { name: "Next detail" }).click();
  await page.getByRole("button", { name: "Previous detail" }).click();
  await page.getByRole("button", { name: "Previous detail" }).evaluate(element => (element as HTMLElement).blur());
  await page.mouse.move(0, 0);
  await page.clock.fastForward(6100);
  await expect(card).toHaveAttribute("data-card", "diet");
  await page.getByRole("button", { name: "Next detail" }).click();
  await expect(card).toHaveAttribute("data-card", "supplements");
  await page.clock.fastForward(12_000);
  await expect(card).toHaveAttribute("data-card", "supplements");
  await page.getByRole("button", { name: "Next detail" }).evaluate(element => (element as HTMLElement).blur());
  await page.mouse.move(0, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.fastForward(120_000);
  await expect(card).toHaveAttribute("data-card", "supplements");
  await expect(page.getByText("This is taking a little longer.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy private plan link" })).toBeVisible();
  await expect(page.getByTestId("formulation-retry")).toHaveCount(0);
});

test("an existing unfinished web assessment is adopted once and matching failure keeps its formula visible", async ({ page }) => {
  const { stdout } = await execute(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "--import", "./test/helpers/offline-network.mjs", "test/helpers/web-funnel-fixture.ts", JSON.stringify({ action: "capture", locale: "en" })], {
    env: { ...process.env, WEB_PRODUCT_JOURNEY_ENABLED: "0" }, timeout: 60_000,
  });
  const captured = JSON.parse(stdout.split("\n").find(line => line.startsWith("FIXTURE:"))!.slice(8));
  let retries = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/journey/retry")) retries++; });
  await page.goto(`/en/nutrition/healthscore?plan=${captured.planId}`);
  await expect(page).toHaveURL(`/en/nutrition/reveal?plan=${captured.planId}`);
  await expect.poll(() => retries).toBe(1);
  await fixture({ action: "formula", planId: captured.planId });
  await expect(page.locator(".mn-reveal-formula")).toContainText("1000", { timeout: 20_000 });
  await page.route(`**/api/assessment/${captured.planId}/journey?*`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), failed: true } });
  });
  await expect(page.getByTestId("formulation-retry")).toBeVisible();
  await expect(page.locator(".mn-reveal-formula")).toContainText("1000");
  await page.unrouteAll({ behavior: "wait" });
});

test("free product basket supports removal and undo, tracks visible cards, and opens free optional details", async ({ page }, testInfo) => {
  const { stdout } = await execute(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/seed-browser-fixtures.ts", `/tmp/free-web-basket-${Date.now()}.json`, JSON.stringify({ scenario: "free_products", locale: "en" })], { env: process.env, timeout: 60_000 });
  const seeded = JSON.parse(stdout.split("\n").find(line => line.startsWith("BROWSER_FIXTURES:"))!.slice(17));
  const stages: string[] = [];
  let rematches = 0;
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/bpm") {
      const body = request.postDataJSON(); if (body?.eventName) stages.push(body.eventName);
    }
    if (request.method() === "POST" && request.url().includes("/product-recommendations")) rematches++;
  });
  await page.goto(seeded.REVEAL_VISUAL_SMOKE_URL);
  await expect(page.getByTestId("web-product-journey")).toHaveAttribute("data-stage", "ready");
  const products = page.locator("#products .product-card"), buttons = products.locator(".product-remove-btn");
  await expect(products).toHaveCount(2);
  expect(stages).not.toContain("product_matches_viewed");
  await page.locator(".mn-reveal-formula-card").scrollIntoViewIfNeeded();
  await expect.poll(() => stages.includes("formula_details_viewed")).toBe(true);
  await page.locator("#products .products-grid").scrollIntoViewIfNeeded();
  await expect.poll(() => stages.includes("product_matches_viewed")).toBe(true);
  await buttons.first().click();
  await expect(page.getByTestId("basket-selection-impact")).toBeVisible();
  const checkout = page.getByRole("link", { name: "Continue to checkout" });
  await expect(checkout).not.toHaveAttribute("aria-disabled", "true");
  expect(new URL(await checkout.getAttribute("href") ?? "", "http://127.0.0.1:3100").searchParams.get("selected")?.split(",")).toHaveLength(1);
  expect(rematches).toBe(0);
  expect(stages).not.toContain("product_basket_confirmed");
  await page.screenshot({ path: testInfo.outputPath("basket-one-product.png"), fullPage: true });
  await buttons.first().click();
  await expect(page.getByTestId("basket-selection-impact")).toHaveCount(0);
  await buttons.first().click(); await buttons.last().click();
  await expect(page.getByRole("button", { name: /Choose at least|basket.*empty|select.*product/i })).toBeDisabled();
  await buttons.first().click();
  await page.getByRole("link", { name: "View my free HealthScore" }).click();
  await expect(page.getByTestId("healthscore")).toBeVisible();
  await expect(page.locator("[data-buy]")).toHaveCount(0);
  await page.getByRole("link", { name: "Back to my products" }).click();
  await page.getByRole("link", { name: "Read my full plan" }).click();
  await expect(page.getByTestId("pharmacy-deep-dive")).toBeVisible();
  await expect(page.getByTestId("nutrient-why").first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp("/nutrition/plan"));
  const state = await fixture({ action: "state", planId: seeded.planId });
  expect(state.selected_plan).toBeNull(); expect(state.payments).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(seeded.REVEAL_VISUAL_SMOKE_URL);
  await buttons.first().click();
  await page.locator(".checkout-card").scrollIntoViewIfNeeded();
  await expect(page.locator(".checkout-card")).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mobile-subset-checkout.png"), fullPage: true });
  await checkout.click();
  await expect(page).toHaveURL(new RegExp("/basket/checkout\\?"), { timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("selected")?.split(",")).toHaveLength(1);
  await expect.poll(() => stages.includes("product_basket_confirmed")).toBe(true);
});
