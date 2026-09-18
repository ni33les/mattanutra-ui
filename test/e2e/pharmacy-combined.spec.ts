import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "../helpers/offline-browser";
const execute = promisify(execFile);
async function fixture(ready = false, existing?: {planId:string;revision:number}) {
  const {stdout}=await execute(process.execPath,["--experimental-strip-types","--import","./test/helpers/offline-network.mjs","--import","./scripts/register-ts-path-loader.mjs","--input-type=module","-e",
    `import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{console.log('FIXTURE:'+JSON.stringify(await seedPharmacyFixture('en',process.argv[1]==='true',JSON.parse(process.argv[2]))));}finally{await closeSqlPool();}`,String(ready),JSON.stringify(existing??null)],{env:process.env,timeout:30000});
  return JSON.parse(stdout.split("\n").find(line=>line.startsWith("FIXTURE:"))!.slice(8));
}
test("PHARM-COMBINE pending and completed recommendations share one page",async({page})=>{
  const saved=await fixture();
  await page.goto(`/en/retail/${saved.slug}/reveal?plan=${saved.planId}`);
  await expect(page).toHaveURL(new RegExp(`/reveal\\?plan=${saved.planId}`),{timeout:3000});
  await expect(page.getByTestId("pharmacy-combined")).toBeVisible();
  await expect(page.locator(".mn-analysis-tile")).toHaveCount(5);
  await expect(page.getByTestId("pharmacy-progress")).toHaveCount(0);
  await fixture(true,saved);
  await expect(page.getByTestId("pharmacy-order")).toBeVisible({timeout:15000});
  await expect(page).toHaveURL(new RegExp(`/reveal\\?plan=${saved.planId}`));
  await expect(page.locator(".mn-products .mn-product")).toHaveCount(1);
  await expect(page.locator(".mn-nutrient")).toHaveCount(1);
});
