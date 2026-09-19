import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test, type Page } from "../helpers/offline-browser";
const execute = promisify(execFile);
async function pending(page: Page, width: number, virtualClock = true) {
  const {stdout}=await execute(process.execPath,["--experimental-strip-types","--import","./test/helpers/offline-network.mjs","--import","./scripts/register-ts-path-loader.mjs","--input-type=module","-e",`import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{console.log('FIXTURE:'+JSON.stringify(await seedPharmacyFixture('en',false)));}finally{await closeSqlPool();}`],{env:process.env,timeout:30000});
  const saved=JSON.parse(stdout.split("\n").find(line=>line.startsWith("FIXTURE:"))!.slice(8));
  await page.setViewportSize({width,height:900});
  if (virtualClock) {
    await page.clock.install({time:new Date("2026-09-18T00:00:00Z")});
    await page.clock.pauseAt(new Date("2026-09-18T00:01:00Z"));
  }
  await page.goto(`/en/retail/${saved.slug}/reveal?plan=${saved.planId}`);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-paused","false");
  return saved;
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
test("PHARM-MOTION pending work keeps flying after the final tap until real results arrive",async({page})=>{
  await pending(page,390);
  await page.clock.runFor(18000);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-phase","waiting");
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","flying");
  await expect(page.locator(".mn-clarity-logo-shell")).toHaveCSS("opacity","1");
  const position=await page.locator(".mn-clarity-logo-shell").evaluate(el=>getComputedStyle(el).transform);
  await page.clock.runFor(20000);
  expect(await page.locator(".mn-clarity-logo-shell").evaluate(el=>getComputedStyle(el).transform)).not.toBe(position);
  const bounds=await page.locator(".mn-clarity-logo-shell").boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThan(0);
  expect(bounds!.y+bounds!.height).toBeLessThan(900);
  await expect(page.locator(".mn-status")).toContainText("Still preparing");
  await expect(page.getByTestId("pharmacy-order")).toHaveCount(0);
  await expect(page.locator(".mn-nutrient")).toHaveCount(0);
});
test("PHARM-MOTION real-time mobile flight remains responsive through the final tap", async ({page}) => {
  await pending(page,390,false);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-phase","clarity",{timeout:15000});
  const frames = await page.evaluate(() => new Promise<number[]>(resolve => {
    const times: number[] = [];
    function observe() {
      if (document.querySelector(".mn-window")!.getAttribute("data-phase") !== "clarity") {
        resolve(times);
        return;
      }
      times.push(performance.now());
      requestAnimationFrame(observe);
    }
    requestAnimationFrame(observe);
  }));
  const intervals = frames.slice(1).map((time,i) => time-frames[i]).sort((a,b) => a-b);
  await test.info().attach("real-frame-times",{body:JSON.stringify({frames,intervals}),contentType:"application/json"});
  // Real RAF: virtual clocks cannot expose expensive animated SVG paint effects.
  expect(frames.length).toBeGreaterThan(100);
  expect(intervals[Math.floor(intervals.length/2)]).toBeLessThan(40);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-phase","waiting");
});

for(const width of [390,1280]) test(`PHARM-FLIGHT ${width}px completion reveals immediately while the sprite lands and then stops`,async({page})=>{
  const saved=await pending(page,width);
  await page.clock.runFor(24000);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","flying");
  let releaseQuote!:()=>void,quoteLoaded=false;
  const quoteGate=new Promise<void>(resolve=>{releaseQuote=resolve;});
  await page.route("**/api/retail/orders?*",async route=>{const response=await route.fetch();quoteLoaded=true;await quoteGate;await route.fulfill({response});});
  await page.evaluate(()=>{
    const samples:{x:number;y:number;gap:number}[]=[];Object.assign(window,{landingSamples:samples});
    const sample=()=>{
      const shell=document.querySelector(".mn-clarity-logo-shell")!,r=shell.getBoundingClientRect();
      const path=document.querySelector<SVGPathElement>(".mn-clarity-path")!;
      const tip=document.querySelector(".mn-leading-spark")!.getBoundingClientRect();
      if(path.getAttribute("d")){
        const end=path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM()!);
        samples.push({x:r.x+r.width/2,y:r.y+r.height/2,gap:Math.hypot(end.x-tip.x-tip.width/2,end.y-tip.y-tip.height/2)});
      }
      if(document.querySelector(".mn-window")!.getAttribute("data-flight")!=="landed")requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
  });
  await execute(process.execPath,["--experimental-strip-types","--import","./test/helpers/offline-network.mjs","--import","./scripts/register-ts-path-loader.mjs","--input-type=module","-e",`import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{await seedPharmacyFixture('en',true,JSON.parse(process.argv[1]));}finally{await closeSqlPool();}`,JSON.stringify(saved)],{env:process.env,timeout:30000});
  // Let the next real status response arrive, but do not advance the landing clock.
  await page.clock.runFor(1600);
  await expect.poll(()=>quoteLoaded).toBe(true);
  await expect(page.getByTestId("pharmacy-order")).toHaveCount(0);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","flying");
  releaseQuote();
  await expect(page.getByTestId("pharmacy-order")).toBeVisible();
  await page.clock.runFor(32);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","landing");
  await expect(page.locator(".mn-product")).toHaveCount(1);
  await page.clock.runFor(1500);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","landed");
  const shell=page.locator(".mn-clarity-logo-shell"),rest=await shell.evaluate(el=>getComputedStyle(el).transform);
  const gap=await page.evaluate(()=>{const a=document.querySelector(".mn-clarity-logo-shell")!.getBoundingClientRect(),b=document.querySelector(".mn-brand-mark")!.getBoundingClientRect();return Math.hypot(a.x+a.width/2-b.x-b.width/2,a.y+a.height/2-b.y-b.height/2);});
  expect(gap).toBeLessThan(.1);
  const samples=await page.evaluate(()=>(window as unknown as {landingSamples:{x:number;y:number;gap:number}[]}).landingSamples);
  expect(samples.length).toBeGreaterThan(50);
  expect(Math.max(...samples.map(s=>s.gap))).toBeLessThan(2);
  expect(Math.max(...samples.slice(1).map((s,i)=>Math.hypot(s.x-samples[i].x,s.y-samples[i].y)))).toBeLessThan(25);
  await test.info().attach("landing-measurements",{body:JSON.stringify(samples),contentType:"application/json"});
  await expect(page.locator(".mn-flight-spark")).toHaveCount(0);
  await page.clock.runFor(3000);
  expect(await shell.evaluate(el=>getComputedStyle(el).transform)).toBe(rest);
  await page.screenshot({path:test.info().outputPath(`landed-${width}.png`),fullPage:true});
});
test("PHARM-FLIGHT hidden tabs pause flight; reduced motion and navigation stop it",async({page})=>{
  await pending(page,390);
  await page.clock.runFor(22000);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","flying");
  const shell=page.locator(".mn-clarity-logo-shell"),before=await shell.evaluate(el=>getComputedStyle(el).transform);
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"));});
  await page.clock.runFor(4000);
  expect(await shell.evaluate(el=>getComputedStyle(el).transform)).toBe(before);
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"));});
  await page.clock.runFor(500);
  expect(await shell.evaluate(el=>getComputedStyle(el).transform)).not.toBe(before);
  await page.emulateMedia({reducedMotion:"reduce"});
  const reduced=await shell.evaluate(el=>getComputedStyle(el).transform);
  await page.clock.runFor(3000);
  expect(await shell.evaluate(el=>getComputedStyle(el).transform)).toBe(reduced);
  await expect(page.getByTestId("pharmacy-order")).toHaveCount(0);
  await page.goto("/en/nutrition/quiz");
  await expect(page.locator(".mn-flight-spark,.mn-clarity-logo-shell")).toHaveCount(0);
});
