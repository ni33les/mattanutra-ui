import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "../helpers/offline-browser";
import { pharmacyCopy } from "../../lib/pharmacy-copy";
const execute = promisify(execFile);
for (const locale of ["en", "th", "zh-CN"] as const) {
  test(`PHARM-BROWSER ${locale} landing, questionnaire, unpaid order and deep dive`, async ({ page }) => {
    const c = pharmacyCopy[locale];
    const savedCopy = {
      en: ["Saved personalised nutrient reasoning", "Saved explanation of the chosen dose", "Saved ingredient-specific precaution"],
      th: ["เหตุผลเฉพาะบุคคลที่บันทึกไว้", "คำอธิบายขนาดที่เลือกซึ่งบันทึกไว้", "ข้อควรระวังของสารอาหารที่บันทึกไว้"],
      "zh-CN": ["已保存的个性化营养素说明", "已保存的剂量选择说明", "已保存的营养素注意事项"]
    }[locale];
    const { stdout } = await execute(process.execPath, ["--experimental-strip-types", "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs", "--input-type=module", "-e",
      `import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{console.log('FIXTURE:'+JSON.stringify(await seedPharmacyFixture(process.argv[1])));}finally{await closeSqlPool();}`, locale], { env: process.env, timeout: 30000 });
    const fixture = JSON.parse(stdout.split("\n").find(line => line.startsWith("FIXTURE:"))!.slice(8));
    await page.goto(`/${locale}/retail/${fixture.slug}/landing`);
    await expect(page.getByTestId("pharmacy-landing")).toBeVisible();
    await page.getByRole("link", { name: `${c.start} →`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/retail/${fixture.slug}/quiz\\?`));
    expect(new URL(page.url()).searchParams.get("session")).toBeTruthy();
    expect(new URL(page.url()).searchParams.get("source")).toBe("in_store");
    await expect(page.locator(".mn-titlebar--quiz")).toBeVisible();
    const composer = page.getByTestId("question-answers");
    await expect(composer.getByRole("textbox")).toBeVisible();
    await expect(page.getByTestId("questionnaire-welcome")).toHaveCount(0);
    const quizUrl = page.url();
    await composer.getByRole("textbox").fill("Pharmacy Browser");
    await composer.getByRole("textbox").press("Enter");
    await expect(composer.locator(".mn-chat-q__chip").first()).toBeVisible();
    await page.reload();
    await composer.getByRole("button", { name: locale === "th" ? "ทำต่อ" : "Continue", exact: true }).click();
    await expect(composer.locator(".mn-chat-q__chip").first()).toBeVisible();
    expect(page.url()).toBe(quizUrl);
    await page.reload();
    await composer.getByRole("button", { name: locale === "th" ? "เริ่มใหม่" : "Start over", exact: true }).click();
    await expect(composer.getByRole("textbox")).toBeVisible();
    await expect(composer.getByRole("textbox")).toHaveValue("");
    await expect(page.getByTestId("questionnaire-welcome")).toHaveCount(0);
    if (locale === "en") {
      await page.goto("/en/nutrition/quiz");
      await expect(page.getByTestId("questionnaire-welcome")).toBeVisible();
      await page.getByTestId("questionnaire-welcome-cta").click();
      await expect(composer.getByRole("textbox")).toBeVisible();
    }
    await page.goto(`/${locale}/retail/${fixture.slug}/reveal?plan=${fixture.planId}`);
    await expect(page.getByTestId("pharmacy-order")).toBeVisible();
    await expect(page.locator(".mn-reveal-final")).toBeVisible();
    await expect(page.locator(".mn-reveal-final h1")).toContainText("Test");
    const planLink = page.getByTestId("pharmacy-deep-dive-link");
    await expect(planLink).toHaveText(`${c.details} →`);
    await expect(planLink).toHaveAttribute("href", `/${locale}/retail/${fixture.slug}/plan?plan=${fixture.planId}`);
    await expect(page.locator("#formula")).toContainText("100%");
    await expect(page.locator(".mn-reveal-final").locator('a[href*="/basket/checkout"],a[href*="/nutrition/quiz"]')).toHaveCount(0);
    await expect(page.getByTestId("pharmacy-order").getByRole("checkbox")).toHaveCount(1);
    const firstProduct = page.getByTestId("pharmacy-order").getByRole("checkbox").first().locator("..");
    const summary = page.getByRole("heading", { name: c.orderSummary, exact: true }).locator("../..");
    const firstProductTop = await firstProduct.evaluate(el => el.getBoundingClientRect().top);
    const summaryTop = await summary.evaluate(el => el.getBoundingClientRect().top);
    expect(Math.abs(firstProductTop - summaryTop)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("pharmacy-order-summary").getByTestId("pharmacy-deep-dive-link")).toHaveCount(1);
    await expect(planLink).toHaveCount(1);
    const assertLinkBelowSummary = async () => {
      const card = (await summary.boundingBox())!, link = (await planLink.boundingBox())!;
      expect(link.y - (card.y + card.height)).toBeGreaterThanOrEqual(12);
      expect(link.y - (card.y + card.height)).toBeLessThanOrEqual(24);
      expect(Math.abs(link.x - card.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(link.width - card.width)).toBeLessThanOrEqual(1);
    };
    await assertLinkBelowSummary();
    const initialViewport = page.viewportSize()!;
    await page.setViewportSize({ width: 390, height: 844 });
    await assertLinkBelowSummary();
    await page.setViewportSize(initialViewport);
    await expect(page.getByLabel(c.name, { exact: true })).toBeVisible();
    await expect(page.locator('input[autocomplete="street-address"],iframe[src*="stripe"]')).toHaveCount(0);
    await planLink.click();
    const deepDive = page.getByTestId("pharmacy-deep-dive");
    await expect(deepDive).toBeVisible();
    await expect(deepDive.locator("h1")).toContainText("Test");
    await expect(deepDive.locator('nav a[href^="#s"]')).toHaveCount(7);
    await expect(deepDive.locator('section[id^="s0"]')).toHaveCount(7);
    await expect(deepDive.locator(".wrap").first()).toHaveCSS("max-width", "1080px");
    await expect(deepDive.locator(".opening h1")).toHaveCSS("font-size", "84px");
    await expect(deepDive.getByTestId("nutrient-why")).toContainText(savedCopy[0]);
    await expect(deepDive.getByTestId("nutrient-decision")).toContainText(savedCopy[1]);
    await expect(deepDive.getByTestId("nutrient-safety")).toContainText(savedCopy[2]);
    await expect(deepDive.getByTestId("deep-dive-product")).toHaveCount(1);
    await expect(deepDive).not.toContainText("Seven interaction screens ran");
    await expect(deepDive).not.toContainText("Your complete plan is in your LINE");
    const desktop = page.viewportSize()!;
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await deepDive.locator("#s04").scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`deep-dive-${locale}-mobile.png`) });
    await page.setViewportSize(desktop);
    await page.getByRole("link", { name: c.back, exact: true }).first().click();
    await expect(page.getByTestId("pharmacy-order")).toBeVisible();
    await page.getByTestId("pharmacy-order").getByRole("checkbox").uncheck();
    await page.getByLabel(c.name, { exact: true }).fill("Counter Test");
    await expect(page.getByRole("button", { name: c.confirm, exact: true })).toBeDisabled();
    await page.getByTestId("pharmacy-order").getByRole("checkbox").check();
    await page.getByRole("button", { name: c.confirm, exact: true }).click();
    await expect(page.getByRole("heading", { name: c.confirmed })).toBeVisible();
    await expect(page.getByText(`Counter Test · ${c.unpaid}`, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: c.confirmed })).toBeVisible();
    if (locale === "en") {
      const receiptUrl = page.url();
      await page.goto(receiptUrl.replace('/en/retail/','/th/retail/'));
      await expect(page.getByRole("heading",{ name:pharmacyCopy.th.confirmed })).toBeVisible();
      await expect(page.getByText(`Counter Test · ${pharmacyCopy.th.unpaid}`, { exact:true })).toBeVisible();
      await page.goto(receiptUrl);
    }
    await page.getByTestId("pharmacy-order").getByRole("link", { name: `${c.details} →`, exact: true }).click();
    await expect(page.getByRole("heading", { name: c.details, exact: true })).toBeVisible();
    await expect(page.locator("#s05 .ch-label")).toHaveText(c.ordered);
    await expect(page.getByText(c.explanationPending, { exact: true })).toBeVisible();
    await expect(page.getByTestId("deep-dive-receipt")).toContainText("17");
    await expect(page.getByTestId("deep-dive-receipt")).toContainText(c.unpaid);
    await page.evaluate(() => { window.open = url => { sessionStorage.setItem("fixture-line-share", String(url)); return null; }; });
    await page.getByTestId("deep-dive-save").getByRole("button", { name: c.line, exact: true }).click();
    const shared = new URL((await page.evaluate(() => sessionStorage.getItem("fixture-line-share")))!);
    expect(shared.origin + shared.pathname).toBe("https://line.me/R/share");
    const sharedPlan = new URL(shared.searchParams.get("text")!);
    expect(sharedPlan.pathname).toBe(`/${locale}/retail/${fixture.slug}/plan`);
    expect(sharedPlan.searchParams.get("plan")).toBe(fixture.planId);
    expect(sharedPlan.searchParams.get("order")).toBe(new URL(page.url()).searchParams.get("order"));
    await page.screenshot({ path: test.info().outputPath(`pharmacy-${locale}.png`), fullPage: true });
  });
}
test("PHARM-BROWSER food support arriving after an order is displayed without changing its formula", async ({page}) => {
  const {stdout}=await execute(process.execPath,["--experimental-strip-types","--import","./test/helpers/offline-network.mjs","--import","./scripts/register-ts-path-loader.mjs","--input-type=module","-e",
    `import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{console.log('FIXTURE:'+JSON.stringify(await seedPharmacyFixture('en')));}finally{await closeSqlPool();}`],{env:process.env,timeout:30000});
  const fixture=JSON.parse(stdout.split('\n').find(line=>line.startsWith('FIXTURE:'))!.slice(8));
  await page.goto(`/en/retail/${fixture.slug}/reveal?plan=${fixture.planId}`);
  await page.getByLabel(pharmacyCopy.en.name,{exact:true}).fill('Late Explanation');
  await page.getByRole('button',{name:pharmacyCopy.en.confirm,exact:true}).click();
  await expect(page.getByRole('heading',{name:pharmacyCopy.en.confirmed})).toBeVisible();
  await page.route(`**/api/assessment/${fixture.planId}/formulation?*`,async route=>{
    const response=await route.fetch(); const result=await response.json();
    expect(result.assessmentRevision).toBe(fixture.revision);
    await route.fulfill({response,json:{...result,foodGapSupport:{version:'food-gap:v1',variants:{balanced:{body:'Late food support fixture',items:[]}}}}});
  });
  await page.route("**/api/retail/orders?view=analysis&*", route => route.fulfill({ json: {
    revision: fixture.revision, generationStatus: "ready", retryAllowed: false,
    healthScore: { score: 64, summary: "Saved analysis summary", pageContent: { aiCopy: {
      overview: "Saved profile narrative", findings: [{ title: "Saved observation", body: "Personalised observation body" }],
      methodCards: [{ title: "Saved method", body: "Personalised method explanation" }]
    } } }
  } }));
  await page.getByTestId('pharmacy-order').getByRole('link',{name:`${pharmacyCopy.en.details} →`,exact:true}).click();
  await expect(page.getByText('Late food support fixture',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Vitamin D3',exact:true})).toBeVisible();
  await expect(page.getByText('1000 IU/day',{exact:true})).toBeVisible();
  await expect(page.locator('#s01')).toContainText('Saved profile narrative');
  await expect(page.locator('#s02')).toContainText('Personalised observation body');
  await expect(page.locator('#s03')).toContainText('Personalised method explanation');
  await page.unrouteAll({ behavior: "wait" });
});
