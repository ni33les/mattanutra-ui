import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type Page } from "../helpers/offline-browser";
import { webProductCopy } from "../../components/nutrition-flow/web-product-copy";
const execute = promisify(execFile);
test.setTimeout(180_000);
async function fixture(input: Record<string, unknown>) {
  const { stdout } = await execute(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "--import", "./test/helpers/offline-network.mjs", "test/helpers/web-funnel-fixture.ts", JSON.stringify(input)], {
    env: process.env, timeout: 60_000, maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout.split("\n").find(line => line.startsWith("FIXTURE:"))!.slice(8));
}

function observeWebOnly(page: Page) {
  const errors: string[] = [], pharmacyRequests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/retail/orders" || path.endsWith("/line-connect")) pharmacyRequests.push(path);
  });
  return { errors, pharmacyRequests };
}

test("reveal language changes keep the saved calculation and selected basket without reloading", async ({ page }) => {
  const channel = observeWebOnly(page);
  const { stdout } = await execute(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs",
    "scripts/seed-browser-fixtures.ts", `/tmp/web-reveal-locale-${Date.now()}.json`, JSON.stringify({ scenario: "free_products", locale: "en" })],
  { env: process.env, timeout: 60_000 });
  const seeded = JSON.parse(stdout.split("\n").find(line => line.startsWith("BROWSER_FIXTURES:"))!.slice(17));
  const generationRequests: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && /\/(journey\/retry|formulation\/refresh|product-recommendations)$/.test(new URL(request.url()).pathname)) {
      generationRequests.push(request.url());
    }
  });
  await page.goto(seeded.REVEAL_VISUAL_SMOKE_URL);
  const journey = page.getByTestId("web-product-journey");
  await expect(journey).toHaveAttribute("data-stage", "ready");
  const checkboxes = page.locator("#products .mn-product-check");
  await expect(checkboxes).toHaveCount(2);
  await checkboxes.first().uncheck();
  const before = new URL(await page.getByRole("link", { name: webProductCopy.en.continue, exact: true }).getAttribute("href") ?? "", page.url()).search;
  await journey.evaluate(element => {
    element.setAttribute("data-retained-instance", "yes");
    const observer = new MutationObserver(() => {
      if (element.getAttribute("data-stage") !== "ready") element.setAttribute("data-restarted", "yes");
    });
    observer.observe(element, { attributes: true, attributeFilter: ["data-stage"] });
  });

  for (const [locale, label, lang] of [["th", "ไทย", "th-TH"], ["zh-CN", "中文", "zh-CN"]] as const) {
    await page.locator(".mn-language-switcher").getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/nutrition/reveal\\?`));
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(journey).toHaveAttribute("data-retained-instance", "yes");
    await expect(journey).toHaveAttribute("data-stage", "ready");
    await expect(journey).not.toHaveAttribute("data-restarted", "yes");
    await expect(checkboxes.first()).not.toBeChecked();
    await expect(checkboxes.last()).toBeChecked();
    const checkout = page.getByRole("link", { name: webProductCopy[locale].continue, exact: true });
    await expect(checkout).toBeVisible();
    const target = new URL(await checkout.getAttribute("href") ?? "", page.url());
    expect(target.pathname).toBe(`/${locale}/basket/checkout`);
    expect(target.search).toBe(before);
  }
  await page.goBack();
  await expect(page.locator("html")).toHaveAttribute("lang", "th-TH");
  await expect(journey).toHaveAttribute("data-retained-instance", "yes");
  await expect(checkboxes.first()).not.toBeChecked();
  const thaiCheckout = await page.getByRole("link", { name: webProductCopy.th.continue, exact: true }).getAttribute("href");
  await page.reload();
  await expect(journey).toHaveAttribute("data-stage", "ready");
  await expect(page.locator(".mn-status-single")).toBeHidden();
  expect(generationRequests).toEqual([]);
  // A translated checkout must accept the original calculation/run and chosen subset.
  await page.goto(thaiCheckout!);
  await expect(page.locator("#retail-checkout-form")).toBeVisible();
  expect(channel.errors).toEqual([]);
});

for (const locale of ["en", "th", "zh-CN"] as const) {
  test(`${locale}: free reveal stays on one page, exposes formula before matching and survives reload`, async ({ page }, testInfo) => {
    const channel = observeWebOnly(page);
    const copy = webProductCopy[locale];
    await page.emulateMedia({ reducedMotion: "reduce" });
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
    const status = page.locator(".mn-status-single");
    await expect(status).toBeEmpty();
    await expect(status.locator(".mn-web-progress-spinner")).toHaveCount(0);
    await expect(page.getByText(copy.calculating, { exact: true })).toHaveCount(0);
    await expect(page.locator(".mn-estimate")).toHaveCount(0);
    await expect(page.getByText(copy.free, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("web-preparation-detail")).toHaveCount(0);
    await expect(page.getByTestId("web-reveal-recovery")).toHaveCount(0);
    if (locale === "en") {
      await fixture({ action: "copy", planId: captured.planId, locale });
      await expect(status).toHaveText(copy.preparing, { timeout: 20_000 });
      await expect(status.locator(".mn-web-progress-spinner")).toBeVisible();
    }
    await fixture({ action: "formula", planId: captured.planId, locale, rationale });
    await expect(page.getByTestId("web-product-journey")).toHaveAttribute("data-stage", "products", { timeout: 20_000 });
    await expect(status).toHaveText(copy.matching);
    await expect(status.locator(".mn-web-progress-spinner")).toBeVisible();
    const ingredient = page.locator(".mn-nutrient").first();
    const explanation = ingredient.locator("details");
    await expect(ingredient).toContainText("1000");
    await expect(ingredient).toContainText(rationale);
    await expect(page.locator("#products")).toHaveCount(0);
    expect(formulationReads).toContain("0");
    await ingredient.scrollIntoViewIfNeeded();
    await expect(ingredient).toHaveCSS("opacity", "1");
    await explanation.locator("summary").click();
    await expect(explanation).toHaveAttribute("open", "");
    await expect(explanation.locator("p").first()).toContainText(rationale);
    await page.screenshot({ path: testInfo.outputPath(`${locale}-formula-before-products.png`) });
    const previousHeight = await page.getByTestId("web-product-journey").evaluate(element => element.getBoundingClientRect().height);
    const previousScroll = await page.evaluate(() => window.scrollY);
    await fixture({ action: "ready", planId: captured.planId, locale });
    await expect(page.getByTestId("web-product-journey")).toHaveAttribute("data-stage", "ready", { timeout: 20_000 });
    await expect(status).toBeHidden();
    await expect(page.getByText(copy.free, { exact: true })).toHaveCount(0);
    await expect(page.locator(".mn-estimate")).toHaveCount(0);
    await expect(page.getByTestId("web-preparation-detail")).toHaveCount(0);
    await expect(page.getByTestId("web-reveal-recovery")).toHaveCount(0);
    await expect(page.getByRole("link", { name: copy.health, exact: true })).toBeVisible();
    await expect(explanation).toHaveAttribute("open", "");
    await expect(explanation.locator("p").first()).toContainText(rationale);
    expect(Math.abs(await page.evaluate(() => window.scrollY) - previousScroll)).toBeLessThanOrEqual(2);
    expect(await page.getByTestId("web-product-journey").evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(previousHeight);
    await expect(page.locator(".mn-analysis-tile")).toHaveCount(5);
    for (const tile of await page.locator(".mn-analysis-tile").all()) await expect(tile).toBeVisible();
    await expect(page.locator(".mn-coffee-intro img")).toBeVisible();
    await expect(page.locator(".mn-coffee-intro img")).toHaveAttribute("src", /nong-coffee/);
    await page.reload();
    await expect(page.getByTestId("web-product-journey")).toHaveAttribute("data-stage", "ready");
    await expect(page).toHaveURL(url);
    await expect(page.getByTestId("payment-confirmed")).toHaveCount(0);
    expect(paidCheckouts).toBe(0);
    expect(generationRequests).toBe(0);
    expect(channel.errors).toEqual([]);
    expect(channel.pharmacyRequests).toEqual([]);
    const state = await fixture({ action: "state", planId: captured.planId });
    expect(state.selected_plan).toBeNull(); expect(state.payments).toBe(0);
  });
}

test("reveal omits the goals carousel and offers recovery only after a long wait", async ({ page }) => {
  const captured = await fixture({ action: "capture", locale: "en" });
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/en/nutrition/reveal?plan=${captured.planId}`);
  await expect(page.getByTestId("web-product-journey")).toHaveAttribute("data-stage", "formula");
  await expect(page.getByTestId("web-preparation-detail")).toHaveCount(0);
  await expect(page.getByTestId("web-reveal-recovery")).toHaveCount(0);
  await page.clock.fastForward(119_000);
  await expect(page.getByTestId("web-reveal-recovery")).toHaveCount(0);
  await page.clock.fastForward(2000);
  await expect(page.getByTestId("web-preparation-detail")).toHaveCount(0);
  await expect(page.getByText("This is taking a little longer.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy private plan link" })).toBeVisible();
  await expect(page.getByTestId("formulation-retry")).toHaveCount(0);
});

test("an existing unfinished web assessment is adopted once and matching failure keeps its formula visible", async ({ page }) => {
  const channel = observeWebOnly(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
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
  const ingredient = page.locator(".mn-nutrient").first();
  const explanation = ingredient.locator("details");
  await expect(ingredient).toContainText("1000", { timeout: 20_000 });
  await explanation.locator("summary").click();
  await expect(explanation).toHaveAttribute("open", "");
  await page.route(`**/api/assessment/${captured.planId}/journey?*`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), failed: true } });
  });
  await expect(page.getByTestId("formulation-retry")).toBeVisible();
  await expect(ingredient).toContainText("1000");
  await expect(explanation).toHaveAttribute("open", "");
  await expect(explanation.locator("p").first()).toContainText("Fixture rationale");
  expect(channel.errors).toEqual([]);
  expect(channel.pharmacyRequests).toEqual([]);
  await page.unrouteAll({ behavior: "wait" });
});

test("free product basket supports removal and undo, tracks visible cards, and opens free optional details", async ({ page }, testInfo) => {
  const channel = observeWebOnly(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 500 });
  const { stdout } = await execute(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/seed-browser-fixtures.ts", `/tmp/free-web-basket-${Date.now()}.json`, JSON.stringify({ scenario: "free_products", locale: "en" })], { env: process.env, timeout: 60_000 });
  const seeded = JSON.parse(stdout.split("\n").find(line => line.startsWith("BROWSER_FIXTURES:"))!.slice(17));
  const stages: string[] = [];
  const marketingEvents: string[] = [];
  let rematches = 0;
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/bpm") {
      const body = request.postDataJSON(); if (body?.eventName) stages.push(body.eventName);
    }
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/marketing/events") {
      const body = request.postDataJSON(); if (body?.name) marketingEvents.push(body.name);
    }
    if (request.method() === "POST" && request.url().includes("/product-recommendations")) rematches++;
  });
  await page.goto(seeded.REVEAL_VISUAL_SMOKE_URL);
  await expect(page.getByTestId("web-product-journey")).toHaveAttribute("data-stage", "ready");
  await expect(page.getByText(webProductCopy.en.selectionPayment, { exact: true })).toHaveCount(1);
  await expect(page.getByTestId("web-basket").getByText(webProductCopy.en.selectionPayment, { exact: true })).toBeVisible();
  await expect(page.locator(".mn-estimate")).toHaveCount(0);
  const products = page.locator("#products .mn-product"), checkboxes = products.locator(".mn-product-check");
  await expect(products).toHaveCount(2);
  const desktopProducts = await page.locator("#products").boundingBox();
  expect(desktopProducts!.width).toBeLessThanOrEqual(960);
  expect(desktopProducts!.x).toBeGreaterThanOrEqual(100);
  for (const checkbox of await checkboxes.all()) await expect(checkbox).toBeChecked();
  expect(stages).not.toContain("product_basket_confirmed");
  expect(marketingEvents).not.toContain("AddToCart");
  expect(stages).not.toContain("product_matches_viewed");
  await page.locator(".mn-nutrient").first().scrollIntoViewIfNeeded();
  await expect.poll(() => stages.includes("formula_details_viewed")).toBe(true);
  await page.locator("#products").scrollIntoViewIfNeeded();
  await expect.poll(() => stages.includes("product_matches_viewed")).toBe(true);
  await checkboxes.first().uncheck();
  await expect(checkboxes.first()).not.toBeChecked();
  await expect.poll(() => stages.includes("product_basket_edited")).toBe(true);
  await expect(page.getByTestId("basket-selection-impact")).toBeVisible();
  const checkout = page.getByRole("link", { name: "Continue to checkout" });
  await expect(checkout).not.toHaveAttribute("aria-disabled", "true");
  expect(new URL(await checkout.getAttribute("href") ?? "", "http://127.0.0.1:3100").searchParams.get("selected")?.split(",")).toHaveLength(1);
  expect(rematches).toBe(0);
  expect(stages).not.toContain("product_basket_confirmed");
  expect(marketingEvents).not.toContain("AddToCart");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("basket-one-product.png"), fullPage: true });
  await checkboxes.first().check();
  await expect(page.getByTestId("basket-selection-impact")).toHaveCount(0);
  await checkboxes.first().uncheck(); await checkboxes.last().uncheck();
  await expect(page.getByRole("button", { name: /Choose at least|basket.*empty|select.*product/i })).toBeDisabled();
  await expect(checkout).toHaveCount(0);
  await checkboxes.first().check();
  await expect(checkout).toBeVisible();
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
  const mobileProducts = await page.locator("#products").boundingBox();
  expect(mobileProducts!.x).toBeGreaterThanOrEqual(24);
  expect(mobileProducts!.x + mobileProducts!.width).toBeLessThanOrEqual(390 - 24);
  await checkboxes.first().uncheck();
  await page.locator(".mn-transaction").scrollIntoViewIfNeeded();
  await expect(page.locator(".mn-transaction")).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator(".mn-analysis-tile")).toHaveCount(5);
  await expect(page.locator(".mn-coffee-intro img")).toBeVisible();
  expect(stages).not.toContain("product_basket_confirmed");
  expect(marketingEvents).not.toContain("AddToCart");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("mobile-subset-checkout.png"), fullPage: true });
  const selection = new URL(await checkout.getAttribute("href") ?? "", "http://127.0.0.1:3100").searchParams;
  expect(selection.get("plan")).toBe(seeded.planId);
  expect(selection.get("run")).toBe(seeded.runId);
  expect(selection.get("revision")).toBe("1");
  expect(selection.get("selectionRevision")).toBe("0");
  expect(selection.get("option")).toBeTruthy();
  expect(selection.get("selected")?.split(",")).toHaveLength(1);
  expect(selection.get("removed")?.split(",")).toHaveLength(1);
  await checkout.click();
  await expect(page).toHaveURL(new RegExp("/basket/checkout\\?"), { timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("selected")?.split(",")).toHaveLength(1);
  await expect.poll(() => stages.includes("product_basket_confirmed")).toBe(true);
  expect(rematches).toBe(0);
  expect(channel.errors).toEqual([]);
  expect(channel.pharmacyRequests).toEqual([]);
});
