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
for(const width of [390,1280]) test(`PHARM-MOTION ${width}px butterfly leaves fading magic dust instead of a line`,async({page})=>{
  await pending(page,width);
  await expect.soft(page.locator("#mn-pharmacy-combined .mn-brand-mark,#mn-pharmacy-combined .mn-brand-lockup")).toHaveCount(0);
  await page.clock.runFor(32);
  const entry=await page.locator(".mn-clarity-logo-shell").boundingBox();
  expect.soft(entry!.x+entry!.width).toBeLessThan(0);
  await page.clock.runFor(468);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","flying");
  await expect(page.locator(".mn-clarity-path,.mn-clarity-path-glow,.mn-leading-spark")).toHaveCount(0);
  await expect(page.locator(".mn-dust-particle")).toHaveCount(96);
  expect.soft(await page.locator(".mn-dust-particle").evaluateAll(els=>els.every(el=>{const css=getComputedStyle(el);return css.color==="rgb(0, 136, 184)"&&css.backgroundColor===css.color;}))).toBe(true);
  await page.evaluate(()=>{
    const samples:{gap:number;angle:number;x:number;y:number;time:number;count:number}[]=[];
    Object.assign(window,{motionSamples:samples});const start=performance.now();
    const sample=()=>{
      const shell=document.querySelector<HTMLElement>(".mn-clarity-logo-shell")!,bounds=shell.getBoundingClientRect(),transform=new DOMMatrix(getComputedStyle(shell).transform);
      const origin={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
      const particles=[...document.querySelectorAll<HTMLElement>(".mn-dust-particle")].filter(el=>Number(getComputedStyle(el).opacity)>.05);
      const gap=Math.min(...particles.map(el=>{const r=el.getBoundingClientRect();return Math.hypot(r.x+r.width/2-origin.x,r.y+r.height/2-origin.y);}));
      samples.push({gap,angle:Math.atan2(transform.b,transform.a)*180/Math.PI,x:transform.e,y:transform.f,time:performance.now()-start,count:particles.length});
      if(performance.now()-start<8000)requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
  });
  await page.clock.runFor(8000);
  const samples=await page.evaluate(()=>(window as unknown as {motionSamples:{gap:number;angle:number;x:number;y:number;time:number;count:number}[]}).motionSamples);
  await test.info().attach("motion-measurements",{body:JSON.stringify(samples),contentType:"application/json"});
  expect(samples.length).toBeGreaterThan(400);
  expect(Math.max(...samples.map(s=>s.gap))).toBeLessThan(20);
  expect(Math.max(...samples.slice(1).map((s,i)=>Math.abs(s.angle-samples[i].angle)))).toBeLessThan(1);
  expect(Math.max(...samples.slice(1).map((s,i)=>Math.hypot(s.x-samples[i].x,s.y-samples[i].y)))).toBeLessThan(12);
  const steady=samples.filter(s=>s.time>2000);expect(steady.length).toBeGreaterThan(200);
  for(const sample of steady){expect(sample.count).toBeGreaterThanOrEqual(50);expect(sample.count).toBeLessThanOrEqual(96);}
  await page.screenshot({path:test.info().outputPath(`magic-dust-${width}.png`),fullPage:true});
});
test("PHARM-MOTION pending work keeps the same flight until real results arrive",async({page})=>{
  await pending(page,390);
  await page.clock.runFor(18000);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-phase","waiting");
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","flying");
  await expect(page.locator(".mn-clarity-logo-shell")).toHaveCSS("opacity","1");
  const position=await page.locator(".mn-clarity-logo-shell").evaluate(el=>getComputedStyle(el).transform);
  await page.clock.runFor(3000);
  expect(await page.locator(".mn-clarity-logo-shell").evaluate(el=>getComputedStyle(el).transform)).not.toBe(position);
  const bounds=await page.locator(".mn-clarity-logo-shell").boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThan(0);
  expect(bounds!.y+bounds!.height).toBeLessThan(900);
  await expect(page.locator(".mn-status")).toContainText("Still preparing");
  await expect(page.getByTestId("pharmacy-order")).toHaveCount(0);
  await expect(page.locator(".mn-nutrient")).toHaveCount(0);
});
test("PHARM-MOTION real-time mobile butterfly flight remains responsive",async({page})=>{
  await pending(page,390,false);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","flying");
  const frames=await page.evaluate(()=>new Promise<number[]>(resolve=>{
    const times:number[]=[],start=performance.now();
    function sample(){times.push(performance.now());if(performance.now()-start>=3000)resolve(times);else requestAnimationFrame(sample);}
    requestAnimationFrame(sample);
  }));
  const intervals=frames.slice(1).map((t,i)=>t-frames[i]).sort((a,b)=>a-b);
  await test.info().attach("real-frame-times",{body:JSON.stringify({frames,intervals}),contentType:"application/json"});
  expect(frames.length).toBeGreaterThan(100);
  expect(intervals[Math.floor(intervals.length/2)]).toBeLessThan(40);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","flying");
});

for(const width of [390,1280]) test(`PHARM-FLIGHT ${width}px completion reveals immediately while the sprite flies offscreen and then stops`,async({page})=>{
  const saved=await pending(page,width);
  await page.clock.runFor(6000);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","flying");
  let releaseQuote!:()=>void,quoteLoaded=false;
  const quoteGate=new Promise<void>(resolve=>{releaseQuote=resolve;});
  await page.route("**/api/retail/orders?*",async route=>{const response=await route.fetch();quoteLoaded=true;await quoteGate;await route.fulfill({response});});
  await page.evaluate(()=>{
    const samples:{x:number;y:number;dust:number}[]=[];Object.assign(window,{exitSamples:samples});
    const sample=()=>{
      const shell=document.querySelector(".mn-clarity-logo-shell")!,r=shell.getBoundingClientRect();
      const dust=[...document.querySelectorAll<HTMLElement>(".mn-dust-particle")].filter(el=>Number(getComputedStyle(el).opacity)>.05).length;
      samples.push({x:r.x+r.width/2,y:r.y+r.height/2,dust});
      if(document.querySelector(".mn-window")!.getAttribute("data-flight")!=="exited")requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
  });
  await execute(process.execPath,["--experimental-strip-types","--import","./test/helpers/offline-network.mjs","--import","./scripts/register-ts-path-loader.mjs","--input-type=module","-e",`import {seedPharmacyFixture} from './test/helpers/pharmacy-fixture.ts';import {closeSqlPool} from './lib/db.ts';try{await seedPharmacyFixture('en',true,JSON.parse(process.argv[1]));}finally{await closeSqlPool();}`,JSON.stringify(saved)],{env:process.env,timeout:30000});
  // Let the next real status response arrive, but do not advance the exit clock.
  await page.clock.runFor(1600);
  await expect.poll(()=>quoteLoaded).toBe(true);
  await expect(page.getByTestId("pharmacy-order")).toHaveCount(0);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","flying");
  releaseQuote();
  await expect(page.getByTestId("pharmacy-order")).toBeVisible();
  await page.clock.runFor(32);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","exiting");
  await expect(page.locator(".mn-product")).toHaveCount(1);
  await page.clock.runFor(3500);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","exited");
  const shell=page.locator(".mn-clarity-logo-shell"),rest=await shell.evaluate(el=>getComputedStyle(el).transform);
  const exit=await shell.boundingBox();
  expect(exit!.x).toBeGreaterThan(width);
  await expect(shell).toHaveCSS("opacity","0");
  await expect(page.locator("#mn-pharmacy-combined .mn-brand-mark,#mn-pharmacy-combined .mn-brand-lockup")).toHaveCount(0);
  const samples=await page.evaluate(()=>(window as unknown as {exitSamples:{x:number;y:number;dust:number}[]}).exitSamples);
  expect(samples.length).toBeGreaterThan(50);
  expect(samples.some(s=>s.dust>20)).toBe(true);
  expect(await page.locator(".mn-dust-particle").evaluateAll(elements=>elements.every(el=>getComputedStyle(el).opacity==="0"))).toBe(true);
  expect(Math.max(...samples.slice(1).map((s,i)=>Math.hypot(s.x-samples[i].x,s.y-samples[i].y)))).toBeLessThan(25);
  await test.info().attach("exit-measurements",{body:JSON.stringify(samples),contentType:"application/json"});
  await expect(page.locator(".mn-flight-spark")).toHaveCount(0);
  await page.clock.runFor(3000);
  expect(await shell.evaluate(el=>getComputedStyle(el).transform)).toBe(rest);
  await page.screenshot({path:test.info().outputPath(`exited-${width}.png`),fullPage:true});
});
test("PHARM-FLIGHT hidden tabs pause flight; reduced motion and navigation stop it",async({page})=>{
  await pending(page,390);
  await page.clock.runFor(6000);
  await expect(page.locator(".mn-window")).toHaveAttribute("data-flight","flying");
  const shell=page.locator(".mn-clarity-logo-shell"),before=await shell.evaluate(el=>getComputedStyle(el).transform);
  const dustBefore=await page.locator(".mn-dust-particle").evaluateAll(elements=>elements.map(el=>el.getAttribute("style")));
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"));});
  await page.clock.runFor(4000);
  expect(await shell.evaluate(el=>getComputedStyle(el).transform)).toBe(before);
  expect(await page.locator(".mn-dust-particle").evaluateAll(elements=>elements.map(el=>el.getAttribute("style")))).toEqual(dustBefore);
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"));});
  await page.clock.runFor(500);
  expect(await shell.evaluate(el=>getComputedStyle(el).transform)).not.toBe(before);
  await page.emulateMedia({reducedMotion:"reduce"});
  const reduced=await shell.evaluate(el=>getComputedStyle(el).transform);
  await page.clock.runFor(3000);
  expect(await shell.evaluate(el=>getComputedStyle(el).transform)).toBe(reduced);
  await expect(page.getByTestId("pharmacy-order")).toHaveCount(0);
  expect(await page.locator(".mn-dust-particle").evaluateAll(elements=>elements.every(el=>getComputedStyle(el).opacity==="0"))).toBe(true);
  await page.goto("/en/nutrition/quiz");
  await expect(page.locator(".mn-dust-particle,.mn-clarity-logo-shell")).toHaveCount(0);
});
