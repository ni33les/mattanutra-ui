import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const execute = promisify(execFile);
test.setTimeout(120_000);
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ baseURL, context }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  expect(new URL(process.env.TEST_DB_URL!).hostname).toBe("127.0.0.1");
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort());
});

async function fixture(input: Record<string, unknown>) {
  const { stdout } = await execute(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "--import", "./test/helpers/offline-network.mjs", "test/helpers/web-funnel-fixture.ts", JSON.stringify(input)], {
    env: process.env, timeout: 60_000, maxBuffer: 1024 * 1024
  });
  return JSON.parse(stdout.split("\n").find(line => line.startsWith("FIXTURE:"))!.slice(8));
}

for (const locale of ["en", "th", "zh-CN"]) {
  test(`${locale}: paid preparation stays visible through reveal loading and doses remain visible on phones`, async ({ page }) => {
    const { planId } = await fixture({ action: "capture", locale });
    await fixture({ action: "copy", locale, planId });
    const payment = await page.request.post("/api/payments/mock-pay", { data: { locale, planId, plan: "precision", sourceSurface: "healthscore", attemptId: randomUUID() } });
    expect(payment.ok()).toBe(true);
    await fixture({ action: "fulfill", locale, planId });

    // Hold the result read so the transition cannot conceal a blank screen.
    let release: () => void = () => undefined;
    const heldResult = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/formulation?*", async route => { await heldResult; await route.continue(); });
    await page.goto(`/${locale}/nutrition/progress?plan=${planId}`);
    await expect(page.getByTestId("payment-confirmed")).toBeVisible();
    await expect(page.getByTestId("journey-progress")).toBeVisible();
    await expect(page.locator(".mn-quiz-calc__spinner")).toBeVisible();
    await fixture({ action: "ready", locale, planId });
    await expect(page).toHaveURL(new RegExp(`/nutrition/reveal\\?plan=${planId}`));
    await expect(page.getByTestId("funnel-loading")).toBeVisible();
    release();
    await expect(page.locator(".mn-reveal-final")).toBeVisible();
    await expect(page.getByTestId("funnel-loading")).toHaveCount(0);
    const dose = page.locator(".nutrient-dose");
    await expect(dose).toHaveCount(1);
    for (const width of [320, 390, 834, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await dose.scrollIntoViewIfNeeded();
      await expect(dose).toBeVisible();
      await expect(dose).not.toHaveText("");
      const bounds = await dose.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      const toggle = page.locator(".nutrient-toggle").first();
      await expect(toggle).not.toBeChecked();
    }
  });
}
