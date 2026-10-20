import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "../helpers/offline-browser";
import { assessmentUiCopy, copies } from "../../components/assessment-flow-copy";
import { combinedCopy } from "../../components/pharmacy/combined-copy";
const execute = promisify(execFile);

test("PHARM-CLASSIC capture stays inline, retries failure and opens combined reveal", async ({ page }) => {
  test.setTimeout(120_000);
  for (const channel of ["pharmacy", "web"] as const) {
    const { stdout } = await execute(process.execPath, channel === "pharmacy" ? [
      "--experimental-strip-types", "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs", "--input-type=module", "-e",
      `import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{console.log('FIXTURE:'+JSON.stringify(await seedPharmacyFixture('en',false)));}finally{await closeSqlPool();}process.exit(0);`,
    ] : [
      "--experimental-strip-types", "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs", "test/helpers/web-funnel-fixture.ts", JSON.stringify({ action: "capture", locale: "en" }),
    ], { env: process.env, timeout: 30_000 });
    const saved = JSON.parse(stdout.split("\n").find(line => line.startsWith("FIXTURE:"))!.slice(8));
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    let attempts = 0;
    const requestKeys: string[] = [];
    const captureRoute = "**/api/assessment";
    await page.route(captureRoute, async route => {
      if (route.request().method() !== "POST") return route.continue();
      attempts++;
      requestKeys.push(route.request().headers()["idempotency-key"]);
      const body = route.request().postDataJSON();
      for (const key of ["budget", "maxPills", "form"]) expect(body.answers[key]).toBe("");
      if (attempts === 1) {
        await barrier;
        return route.fulfill({ status: 503, json: { message: "Controlled capture failure" } });
      }
      // A saved receipt is enough: no HealthScore or formula result is ready yet.
      return route.fulfill({ json: { planId: saved.planId, revision: saved.revision, inputHash: "fixture" } });
    });
    await page.goto(channel === "pharmacy" ? `/en/retail/${saved.slug}/quiz` : "/en/nutrition/quiz");
    await expect(page.getByTestId("chat-questionnaire")).toHaveCount(0);
    await page.getByRole("button", { name: assessmentUiCopy.en.devDefaults, exact: true }).click();
    try {
      const savingButton = page.getByRole("button", { name: combinedCopy.en.saving, exact: true });
      await expect(savingButton).toBeVisible();
      await expect(savingButton).toBeDisabled();
      await expect(savingButton).toHaveAttribute("aria-busy", "true");
      await expect(page.getByRole("button", { name: assessmentUiCopy.en.devDefaults, exact: true })).toBeDisabled();
      await expect(page.getByRole("heading", { name: assessmentUiCopy.en.scoreProcessingTitle, exact: true })).toHaveCount(0);
      await expect(page.getByTestId("pharmacy-combined")).toHaveCount(0);
      if (channel === "pharmacy") await expect(page.getByTestId("pharmacy-capture-status")).toBeVisible();
      expect(attempts).toBe(1);
    } finally { release(); }
    await expect(page.getByText(assessmentUiCopy.en.processingError, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: copies.en.fixedAction.generate, exact: true }).click();
    await expect(page).toHaveURL(channel === "pharmacy"
      ? new RegExp(`/retail/${saved.slug}/reveal\\?plan=${saved.planId}`)
      : new RegExp(`/nutrition/reveal\\?plan=${saved.planId}`));
    await expect(page.getByTestId("pharmacy-combined")).toBeVisible();
    expect(attempts).toBe(2);
    expect(requestKeys[0]).toBeTruthy();
    expect(requestKeys[1]).toBe(requestKeys[0]);
    await page.unroute(captureRoute);
  }
});
