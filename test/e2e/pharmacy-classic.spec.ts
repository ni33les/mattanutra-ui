import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {expect,test} from '../helpers/offline-browser';
import {assessmentUiCopy,copies} from '../../components/assessment-flow-copy';
const execute=promisify(execFile);
test('PHARM-CLASSIC capture stays inline, retries failure and opens combined reveal',async({page})=>{
  const {stdout}=await execute(process.execPath,['--experimental-strip-types','--import','./test/helpers/offline-network.mjs','--import','./scripts/register-ts-path-loader.mjs','--input-type=module','-e',`import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{console.log('FIXTURE:'+JSON.stringify(await seedPharmacyFixture('en',false)));}finally{await closeSqlPool();}`],{env:process.env,timeout:30000});
  const saved=JSON.parse(stdout.split('\n').find(x=>x.startsWith('FIXTURE:'))!.slice(8));
  let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});let attempts=0;
  await page.route('**/api/assessment',async route=>{
    if(route.request().method()!=='POST')return route.continue();attempts++;
    const body=route.request().postDataJSON();for(const key of ['budget','maxPills','form'])expect(body.answers[key]).toBe('');
    if(attempts===1){await barrier;return route.fulfill({status:503,json:{message:'Controlled capture failure'}});}
    return route.fulfill({json:{planId:saved.planId,revision:saved.revision,inputHash:'fixture'}});
  });
  await page.goto(`/en/retail/${saved.slug}/quiz`);
  await expect(page.getByTestId('chat-questionnaire')).toHaveCount(0);
  await page.getByRole('button',{name:assessmentUiCopy.en.devDefaults,exact:true}).click();
  try{await expect(page.getByTestId('pharmacy-capture-status')).toBeVisible();await expect(page.getByRole('button',{name:assessmentUiCopy.en.devDefaults,exact:true})).toBeDisabled();await expect(page.getByTestId('pharmacy-combined')).toHaveCount(0);}finally{release();}
  await expect(page.getByText(assessmentUiCopy.en.processingError,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:copies.en.fixedAction.generate,exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/reveal\\?plan=${saved.planId}`));
  await expect(page.getByTestId('pharmacy-combined')).toBeVisible();expect(attempts).toBe(2);
});
