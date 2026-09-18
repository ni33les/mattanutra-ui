import { execFile } from "node:child_process";
import { promisify } from "node:util";
import QRCode from "qrcode";
import { expect, test, type Page } from "../helpers/offline-browser";
const execute=promisify(execFile);
async function saved(page:Page){
  const {stdout}=await execute(process.execPath,["--experimental-strip-types","--import","./test/helpers/offline-network.mjs","--import","./scripts/register-ts-path-loader.mjs","--input-type=module","-e",`import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{console.log('FIXTURE:'+JSON.stringify(await seedPharmacyFixture()));}finally{await closeSqlPool();}`],{env:process.env,timeout:30000});
  const f=JSON.parse(stdout.split('\n').find(l=>l.startsWith('FIXTURE:'))!.slice(8));
  await page.goto(`/en/retail/${f.slug}/reveal?plan=${f.planId}`);return f;
}
test("PHARM-LINE-UI failed preparation is retryable without an automatic request loop",async({page})=>{
  let attempts=0;await page.route('**/api/assessment/*/line-connect',route=>++attempts===1?route.fulfill({status:503,json:{message:'controlled failure'}}):route.continue());
  await saved(page);
  const connect=page.getByTestId('pharmacy-line-connect');
  await expect(connect.getByRole('alert')).toContainText('could not be prepared');
  await page.waitForTimeout(400);expect(attempts).toBe(1);
  await connect.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(connect.getByRole('img')).toBeVisible();
  expect(await connect.getByRole('img').evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBe(256);
  expect(attempts).toBe(2);
  expect(await connect.getByRole('link',{name:'Open LINE and save my plan',exact:true}).getAttribute('href')).toContain('/R/oaMessage/');
});
test("PHARM-LINE-UI QR is prepared before clicking and expires without leaving a stale connection",async({page})=>{
  await page.clock.install({time:new Date('2026-09-18T00:00:00Z')});await page.clock.pauseAt(new Date('2026-09-18T00:01:00Z'));
  const expiresAt=new Date('2026-09-18T00:02:00Z').toISOString();let attempts=0;
  const initial='https://line.me/R/oaMessage/%40fixture/?MN%20PLAN%20ABCDEF';
  const qrDataUrl=await QRCode.toDataURL(initial,{width:256,margin:4,errorCorrectionLevel:'M'});
  await page.route('**/api/assessment/*/line-connect',route=>++attempts===1?route.fulfill({json:{code:'ABCDEF',command:'MN PLAN ABCDEF',lineUrl:initial,qrDataUrl,expiresAt}}):route.continue());
  await saved(page);const connect=page.getByTestId('pharmacy-line-connect');
  await expect(connect.getByRole('img')).toBeVisible();expect(attempts).toBe(1);
  await expect(connect.getByRole('link',{name:'Open LINE and save my plan',exact:true})).toHaveAttribute('href',initial);
  await page.clock.runFor(61000);
  await expect(connect.getByRole('link',{name:'Open LINE and save my plan',exact:true})).not.toHaveAttribute('href',initial);
  await expect(connect.getByRole('img')).toBeVisible();expect(attempts).toBe(2);
});
