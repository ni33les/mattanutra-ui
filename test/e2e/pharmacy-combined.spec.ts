import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "../helpers/offline-browser";
const execute = promisify(execFile);
async function fixture(
  ready = false,
  existing?: { planId: string; revision: number },
) {
  const { stdout } = await execute(
    process.execPath,
    [
      "--experimental-strip-types",
      "--import",
      "./test/helpers/offline-network.mjs",
      "--import",
      "./scripts/register-ts-path-loader.mjs",
      "--input-type=module",
      "-e",
      `import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{console.log('FIXTURE:'+JSON.stringify(await seedPharmacyFixture('en',process.argv[1]==='true',JSON.parse(process.argv[2]))));}finally{await closeSqlPool();}`,
      String(ready),
      JSON.stringify(existing ?? null),
    ],
    { env: process.env, timeout: 30000 },
  );
  return JSON.parse(
    stdout
      .split("\n")
      .find((line) => line.startsWith("FIXTURE:"))!
      .slice(8),
  );
}
test("PHARM-COMBINE pending and completed recommendations share one page", async ({
  page,
}) => {
  const saved = await fixture();
  await page.goto(`/en/retail/${saved.slug}/reveal?plan=${saved.planId}`);
  await expect(page).toHaveURL(new RegExp(`/reveal\\?plan=${saved.planId}`), {
    timeout: 3000,
  });
  await expect(page.getByTestId("pharmacy-combined")).toBeVisible();
  await expect(page.locator(".mn-analysis-tile")).toHaveCount(5);
  await expect(page.getByTestId("pharmacy-progress")).toHaveCount(0);
  await fixture(true, saved);
  await expect(page.getByTestId("pharmacy-order")).toBeVisible({
    timeout: 15000,
  });
  await expect(page).toHaveURL(new RegExp(`/reveal\\?plan=${saved.planId}`));
  await expect(page.locator(".mn-products .mn-product")).toHaveCount(1);
  await expect(page.locator(".mn-nutrient")).toHaveCount(1);
});

test("PHARM-COMBINE saved formula is visible before products, fetched once per version", async ({
  page,
}) => {
  const saved = await fixture(),
    statusUrl = `**/api/assessment/${saved.planId}/journey?*`;
  let ready = false,
    formulas = 0;
  await page.route(statusUrl, async (route) => {
    const response = await route.fetch();
    const status = await response.json();
    await route.fulfill({
      response,
      json: {
        ...status,
        formulationStatus: "ready",
        readyForReveal: ready,
        resultVersion: ready ? "products-v2" : "formula-v1",
      },
    });
  });
  await page.route(
    `**/api/assessment/${saved.planId}/formulation?*`,
    async (route) => {
      formulas++;
      await route.fulfill({
        json: {
          revision: saved.revision,
          resultVersion: ready ? "products-v2" : "formula-v1",
          firstName: "Maya",
          assessmentSummary: { firstName: "Maya" },
          supplementBreakdown: [
            {
              id: "vitamin_d3",
              supplement: "Vitamin D3",
              dailyDose: "1000 IU/day",
              effectivenessRank: 1,
              status: "add",
            },
          ],
          recommendations: [],
        },
      });
    },
  );
  await page.goto(`/en/retail/${saved.slug}/reveal?plan=${saved.planId}`);
  await expect(page.locator(".mn-nutrient")).toBeVisible();
  await expect(page.locator(".mn-window")).toHaveAttribute(
    "data-phase",
    "matching",
  );
  await expect(page.locator(".mn-nutrient")).toContainText("1000 IU/day");
  await expect(page.getByTestId("pharmacy-order")).toHaveCount(0);
  await expect.poll(() => formulas).toBe(1);
  await fixture(true, saved);
  ready = true;
  await expect(page.getByTestId("pharmacy-order")).toBeVisible();
  expect(formulas).toBe(2);
  await page.unrouteAll({ behavior: "wait" });
});

test("PHARM-COMBINE completion before the animation finishes reveals immediately and cancels decoration", async ({
  page,
}) => {
  const saved = await fixture();
  await page.clock.install();
  await page.goto(`/en/retail/${saved.slug}/reveal?plan=${saved.planId}`);
  await expect(page.locator(".mn-window")).toHaveAttribute(
    "data-phase",
    "inputs",
  );
  await page.clock.pauseAt(new Date());
  await fixture(true, saved);
  await page.clock.runFor(1600);
  await expect(page.getByTestId("pharmacy-order")).toBeVisible();
  await expect(page.locator(".mn-window")).toHaveAttribute(
    "data-phase",
    "ready",
  );
  await expect(page.locator(".mn-rain-chip,.mn-flight-spark")).toHaveCount(0);
  await expect(page.locator(".mn-clarity-logo-shell")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, -9999, -9999)",
  );
});

test("PHARM-COMBINE empty result completes without an invented purchase", async ({
  page,
}) => {
  const saved = await fixture();
  await page.route(
    `**/api/assessment/${saved.planId}/journey?*`,
    async (route) => {
      const response = await route.fetch();
      const status = await response.json();
      await route.fulfill({
        response,
        json: {
          ...status,
          formulationStatus: "ready",
          readyForReveal: true,
          resultVersion: "empty-v1",
        },
      });
    },
  );
  await page.route(`**/api/assessment/${saved.planId}/formulation?*`, (route) =>
    route.fulfill({
      json: {
        revision: saved.revision,
        resultVersion: "empty-v1",
        assessmentSummary: {},
        supplementBreakdown: [],
        recommendations: [],
      },
    }),
  );
  await page.route("**/api/retail/orders?*", (route) =>
    route.fulfill({ json: { receipt: null, lines: [] } }),
  );
  await page.goto(`/en/retail/${saved.slug}/reveal?plan=${saved.planId}`);
  await expect(page.getByTestId("pharmacy-order")).toBeVisible();
  await expect(page.locator(".mn-selected-label")).toContainText(
    "0 ingredients",
  );
  await expect(page.locator(".mn-product")).toHaveCount(0);
  await expect(page.locator(".mn-confirm-btn")).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

test("PHARM-COMBINE replay preserves deselection and name without rematching or ordering", async ({
  page,
}) => {
  const saved = await fixture(true);
  let mutations = 0;
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /\/api\/(assessment|retail\/orders)/.test(r.url())
    )
      mutations++;
  });
  await page.goto(`/en/retail/${saved.slug}/reveal?plan=${saved.planId}`);
  await page.getByRole("checkbox").uncheck();
  await page
    .getByLabel("Name or nickname", { exact: true })
    .fill("Retained visitor");
  await page
    .getByRole("button", { name: "Replay analysis", exact: true })
    .click();
  await expect(page.locator(".mn-window")).toHaveAttribute(
    "data-phase",
    "inputs",
  );
  await page.clock.install();
  await page.clock.fastForward(17000);
  await expect(page.getByTestId("pharmacy-order")).toBeVisible();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(
    page.getByLabel("Name or nickname", { exact: true }),
  ).toHaveValue("Retained visitor");
  expect(mutations).toBe(0);
});

for (const width of [1280, 390])
  test(`PHARM-COMBINE ${width}px real flight, slow work and cleanup`, async ({
    page,
  }) => {
    const saved = await fixture();
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    await page.addInitScript(() => {
      let seed = 17;
      Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    });
    await page.goto(`/en/retail/${saved.slug}/reveal?plan=${saved.planId}`);
    await page.clock.pauseAt(new Date());
    await page.clock.runFor(3300);
    await expect(page.locator(".mn-window")).toHaveAttribute(
      "data-phase",
      "rain",
    );
    await expect(page.locator(".mn-rain-chip")).toHaveCount(54);
    await page.screenshot({
      path: test.info().outputPath(`rain-${width}.png`),
      fullPage: true,
    });
    await page.clock.runFor(5600);
    await expect(page.locator(".mn-window")).toHaveAttribute(
      "data-phase",
      "clarity",
    );
    const path = await page.locator(".mn-clarity-path").getAttribute("d");
    expect((path!.match(/C /g) || []).length).toBe(5);
    await expect(page.locator(".mn-tap.is-active")).toHaveCount(1);
    await page.screenshot({
      path: test.info().outputPath(`flight-${width}.png`),
      fullPage: true,
    });
    await page.clock.runFor(4000);
    await expect(page.locator("[data-final-tap]")).toHaveClass(/is-active/);
    await page.screenshot({
      path: test.info().outputPath(`orbit-${width}.png`),
      fullPage: true,
    });
    await page.clock.runFor(5000);
    await expect(page.getByTestId("pharmacy-order")).toHaveCount(0);
    await expect(page.locator(".mn-nutrient")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator("#mn-pharmacy-combined")
        .evaluate((el) => el.getAnimations({ subtree: true }).length),
    ).toBe(0);
    await page.goto("/en/nutrition/quiz");
    await expect(page.getByTestId("questionnaire-welcome")).toBeVisible();
    await expect(
      page.locator(".mn-flight-spark,.mn-clarity-logo-shell"),
    ).toHaveCount(0);
  });

for (const source of ['in_store','business_card']) test(`PHARM-COMBINE ${source} records processing then reveal only when visible`, async ({page}) => {
  const session=crypto.randomUUID(),slug='matcher-v5-isolated-fixture-retailer';
  const capture=await page.request.post('/api/assessment',{headers:{'Idempotency-Key':crypto.randomUUID()},data:{answers:{firstName:'Source visitor',sex:'female',age:'36-45',goals:['energy']},locale:'en',sessionId:session,pharmacyId:slug,bpm:{ray:session,attribution:{trafficSource:'pharmacy',sourceChannel:slug,sourceDetail:source}}}});
  expect(capture.ok()).toBe(true);const saved={...await capture.json(),slug};
  const events:{eventName:string;attribution:{sourceDetail:string}}[]=[];
  await page.route('**/api/bpm',route=>{const value=route.request().postDataJSON();events.push(value);return route.fulfill({json:{ok:true}});});
  await page.goto(`/en/retail/${slug}/reveal?plan=${saved.planId}`);
  await expect.poll(()=>events.filter(e=>e.eventName==='pharmacy_processing_viewed').length).toBe(1);
  expect(events.filter(e=>e.eventName==='formulation_page_viewed')).toHaveLength(0);
  await fixture(true,saved);await expect(page.getByTestId('pharmacy-order')).toBeVisible();
  await expect.poll(()=>events.filter(e=>e.eventName==='formulation_page_viewed').length).toBe(1);
  const meaningful=events.filter(e=>['pharmacy_processing_viewed','formulation_page_viewed'].includes(e.eventName));
  expect(meaningful.map(e=>e.attribution.sourceDetail)).toEqual([source,source]);
});
