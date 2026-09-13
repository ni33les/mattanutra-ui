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
  test(`PHARM-PROGRESS ${locale} pending reveal uses pharmacy progress and opens the standard reveal when ready`, async ({ page }) => {
    const saved = await fixture(locale);
    const mutations: string[] = [];
    page.on("request", request => { if (request.method() === "POST" && request.url().includes(`/api/assessment/${saved.planId}/`)) mutations.push(request.url()); });
    await page.goto(`/${locale}/retail/${saved.slug}/reveal?plan=${saved.planId}`);
    await expect(page).toHaveURL(new RegExp(`/retail/${saved.slug}/progress\\?plan=${saved.planId}`));
    await expect(page.getByTestId("pharmacy-progress")).toBeVisible();
    await expect(page.locator(".mn-quiz-calc, .mn-quiz-calc__spinner")).toHaveCount(0);
    await expect(page.getByTestId("pharmacy-progress").getByRole("listitem")).toHaveCount(3);
    await page.reload();
    await expect(page.getByTestId("pharmacy-progress")).toBeVisible();
    await fixture(locale, true, saved);
    await expect(page.locator(".mn-reveal-final")).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(new RegExp(`/retail/${saved.slug}/reveal\\?plan=${saved.planId}`));
    await expect(page.getByTestId("pharmacy-order")).toBeVisible();
    expect(mutations).toEqual([]);
  });
}

test("PHARM-PROGRESS capture displays pharmacy progress before the receipt, then hands off without HealthScore waiting", async ({ page }) => {
  const saved = await fixture("en");
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
    await expect(page.getByTestId("pharmacy-progress")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".mn-quiz-calc")).toHaveCount(0);
  } finally { release(); }
  await expect(page).toHaveURL(new RegExp(`/retail/${saved.slug}/progress\\?plan=${saved.planId}`));
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
  await expect(page.locator(".mn-reveal-final")).toBeVisible({ timeout: 15000 });
  expect(retries).toBe(1);
  // The reveal starts its own readiness read. Drain that intercepted request
  // before Playwright closes the page so teardown cannot cancel route.fetch.
  await page.unrouteAll({ behavior: "wait" });
});
