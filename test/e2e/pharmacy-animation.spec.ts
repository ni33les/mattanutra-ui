import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type Page } from "../helpers/offline-browser";
const execute = promisify(execFile);
async function pending(page: Page, width: number) {
  const {stdout}=await execute(process.execPath,["--experimental-strip-types","--import","./test/helpers/offline-network.mjs","--import","./scripts/register-ts-path-loader.mjs","--input-type=module","-e",`import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{console.log('FIXTURE:'+JSON.stringify(await seedPharmacyFixture('en',false)));}finally{await closeSqlPool();}`],{env:process.env,timeout:30000});
  const saved=JSON.parse(stdout.split("\n").find(line=>line.startsWith("FIXTURE:"))!.slice(8));
  await page.setViewportSize({width,height:900});
  await page.clock.install({time:new Date("2026-09-18T00:00:00Z")});
  await page.clock.pauseAt(new Date("2026-09-18T00:01:00Z"));
  await page.goto(`/en/retail/${saved.slug}/reveal?plan=${saved.planId}`);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-paused","false");
}
for(const width of [390,1280]) test(`PHARM-MOTION ${width}px trail stays attached and rotation remains continuous`,async({page})=>{
  await pending(page,width);
  await page.clock.runFor(7400);
  await page.evaluate(()=>{
    const samples: {gap:number;angle:number;x:number;y:number;time:number}[]=[];
    Object.assign(window,{motionSamples:samples});
    const sample=()=>{
      const path=document.querySelector<SVGPathElement>(".mn-clarity-path")!;
      const shell=document.querySelector<HTMLElement>(".mn-clarity-logo-shell")!;
      const phase=document.querySelector(".mn-window")!.getAttribute("data-phase");
      const total=path.getTotalLength();
      if(phase==="clarity"&&total>0){
        const style=getComputedStyle(path),offset=style.strokeDasharray==="none"?0:parseFloat(style.strokeDashoffset)/Number(path.getAttribute("pathLength"));
        const end=path.getPointAtLength(total*(1-offset)).matrixTransform(path.getScreenCTM()!);
        const tip=document.querySelector(".mn-leading-spark")!.getBoundingClientRect();
        const transform=new DOMMatrix(getComputedStyle(shell).transform);
        samples.push({gap:Math.hypot(end.x-tip.x-tip.width/2,end.y-tip.y-tip.height/2),angle:Math.atan2(transform.b,transform.a)*180/Math.PI,x:transform.e,y:transform.f,time:performance.now()});
      }
      if(samples.length<400)requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
  });
  await page.clock.runFor(5700);
  const samples=await page.evaluate(()=>(window as unknown as {motionSamples:{gap:number;angle:number;x:number;y:number;time:number}[]}).motionSamples);
  await test.info().attach("motion-measurements",{body:JSON.stringify(samples),contentType:"application/json"});
  expect(samples.length).toBeGreaterThan(200);
  expect(Math.max(...samples.map(s=>s.gap))).toBeLessThan(2);
  expect(Math.max(...samples.slice(1).map((s,i)=>Math.abs(s.angle-samples[i].angle)))).toBeLessThan(2);
  await page.screenshot({path:test.info().outputPath(`settled-${width}.png`),fullPage:true});
});
test("PHARM-MOTION pending work settles after the final tap instead of freezing the leaf",async({page})=>{
  await pending(page,390);
  await page.clock.runFor(18000);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-phase","waiting");
  await expect(page.locator(".mn-clarity-logo-shell")).toHaveCSS("opacity","0");
  await expect(page.locator(".mn-status")).toContainText("Still preparing");
  await expect(page.getByTestId("pharmacy-order")).toHaveCount(0);
  await expect(page.locator(".mn-nutrient")).toHaveCount(0);
});
