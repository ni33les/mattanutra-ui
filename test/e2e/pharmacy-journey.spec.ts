import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "../helpers/offline-browser";
import { pharmacyCopy } from "../../lib/pharmacy-copy";
const execute = promisify(execFile);
for (const locale of ["en", "th", "zh-CN"] as const) {
  test(`PHARM-BROWSER ${locale} landing, questionnaire, unpaid order and deep dive`, async ({ page }) => {
    const c = pharmacyCopy[locale];
    const { stdout } = await execute(process.execPath, ["--experimental-strip-types", "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs", "--input-type=module", "-e",
      `import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{console.log('FIXTURE:'+JSON.stringify(await seedPharmacyFixture(process.argv[1])));}finally{await closeSqlPool();}`, locale], { env: process.env, timeout: 30000 });
    const fixture = JSON.parse(stdout.split("\n").find(line => line.startsWith("FIXTURE:"))!.slice(8));
    await page.goto(`/${locale}/retail/${fixture.slug}/landing`);
    await expect(page.getByTestId("pharmacy-landing")).toBeVisible();
    await page.getByRole("link", { name: `${c.start} →`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/retail/${fixture.slug}/quiz\\?session=`));
    await expect(page.locator(".mn-titlebar--quiz")).toBeVisible();
    await page.goto(`/${locale}/retail/${fixture.slug}/reveal?plan=${fixture.planId}`);
    await expect(page.getByTestId("pharmacy-order")).toBeVisible();
    await expect(page.locator(".mn-reveal-final")).toBeVisible();
    await expect(page.locator("#formula")).toContainText("100%");
    await expect(page.locator(".mn-reveal-final").locator('a[href*="/basket/checkout"],a[href*="/nutrition/quiz"]')).toHaveCount(0);
    await expect(page.getByTestId("pharmacy-order").getByRole("checkbox")).toHaveCount(1);
    await expect(page.getByLabel(c.name, { exact: true })).toBeVisible();
    await expect(page.locator('input[autocomplete="street-address"],iframe[src*="stripe"]')).toHaveCount(0);
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
    await page.getByRole("link", { name: `${c.details} →`, exact: true }).click();
    await expect(page.getByRole("heading", { name: c.details, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: c.ordered, exact: true })).toBeVisible();
    await expect(page.getByText(c.explanationPending, { exact: true })).toBeVisible();
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
  await page.getByRole('link',{name:`${pharmacyCopy.en.details} →`,exact:true}).click();
  await expect(page.getByText('Late food support fixture',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Vitamin D3',exact:true})).toBeVisible();
  await expect(page.getByText('1000 IU/day',{exact:true})).toBeVisible();
});
