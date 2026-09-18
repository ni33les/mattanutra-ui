import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "../helpers/offline-browser";
const execute = promisify(execFile);
async function fixture(locale: string, ready = false, existing?: { planId: string; revision: number }) {
  const { stdout } = await execute(process.execPath, ["--experimental-strip-types", "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs", "--input-type=module", "-e",
    `import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{console.log('FIXTURE:'+JSON.stringify(await seedPharmacyFixture(process.argv[1],process.argv[2]==='true',JSON.parse(process.argv[3]))));}finally{await closeSqlPool();}`, locale, String(ready), JSON.stringify(existing ?? null)], { env: process.env, timeout: 30000 });
  return JSON.parse(stdout.split("\n").find(line => line.startsWith("FIXTURE:"))!.slice(8));
}
for (const locale of ["en", "th", "zh-CN"]) {
  test(`PHARM-PROGRESS ${locale} pending reveal remains on the combined page through reload and readiness`, async ({ page }) => {
    const saved = await fixture(locale);
    const mutations: string[] = [];
    page.on("request", request => { if (request.method() === "POST" && request.url().includes(`/api/assessment/${saved.planId}/`)) mutations.push(request.url()); });
    await page.goto(`/${locale}/retail/${saved.slug}/progress?plan=${saved.planId}&source=business_card`);
    await expect(page).toHaveURL(new RegExp(`/retail/${saved.slug}/reveal\\?plan=${saved.planId}&source=business_card`));
    await expect(page.getByTestId("pharmacy-combined")).toBeVisible();
    await expect(page.locator(".mn-quiz-calc, .mn-reveal-final")).toHaveCount(0);
    await expect(page.locator(".mn-analysis-tile")).toHaveCount(5);
    await page.reload();
    await expect(page.getByTestId("pharmacy-combined")).toBeVisible();
    await fixture(locale,true,saved);
    await expect(page.getByTestId("pharmacy-order")).toBeVisible({timeout:15000});
    await expect(page.locator(".mn-products .mn-product")).toHaveCount(1);
    expect(mutations).toEqual([]);
  });
}

test("PHARM-PROGRESS capture stays inline before the receipt, then opens combined reveal without HealthScore waiting", async ({ page }) => {
  const saved = await fixture("en");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let leafBursts = 0;
  await page.exposeFunction("recordLeafBurst", () => { leafBursts++; });
  await page.addInitScript(() => {
    new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node instanceof Element && node.matches(".mn-quiz-leaf")))) {
        void (window as unknown as { recordLeafBurst: () => Promise<void> }).recordLeafBurst();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/assessment", async route => {
    if (route.request().method() !== "POST") return route.continue();
    await barrier;
    await route.fulfill({ json: { planId: saved.planId, revision: saved.revision, inputHash: "fixture-capture" } });
  });
  await page.goto(`/en/retail/${saved.slug}/quiz`);
  await page.getByTestId("dev-fill-questionnaire").click();
  try {
    await expect(page.getByTestId("pharmacy-capture-status")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("chat-questionnaire")).toBeVisible();
    await expect(page.locator(".mn-quiz-calc")).toHaveCount(0);
  } finally { release(); }
  await expect(page).toHaveURL(new RegExp(`/retail/${saved.slug}/reveal\\?plan=${saved.planId}`));
  expect(leafBursts).toBe(0);
});

test("PHARM-PROGRESS failures provide an explicit retry and continue observing the same assessment", async ({ page }) => {
  const saved = await fixture("en");
  let failed = true, retries = 0;
  await page.route(`**/api/assessment/${saved.planId}/journey?*`, async route => {
    const response = await route.fetch();const status = await response.json();
    await route.fulfill({ response, json: failed ? { ...status, failed: true } : status });
  });
  await page.route(`**/api/assessment/${saved.planId}/journey/retry`, async route => {
    expect(route.request().method()).toBe("POST"); retries++; failed = false;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/en/retail/${saved.slug}/progress?plan=${saved.planId}`);
  await expect(page.getByTestId("pharmacy-progress-retry")).toBeVisible();
  expect(retries).toBe(0);
  await page.getByTestId("pharmacy-progress-retry").click();
  await fixture("en", true, saved);
  await expect(page.getByTestId("pharmacy-order")).toBeVisible({ timeout: 15000 });
  expect(retries).toBe(1);
  // The reveal starts its own readiness read. Drain that intercepted request
  // before Playwright closes the page so teardown cannot cancel route.fetch.
  await page.unrouteAll({ behavior: "wait" });
});
