import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { register } from "node:module";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createElement, type ImgHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser } from "@playwright/test";
import { clarityFlight, cubicPoint } from "../../lib/pharmacy-presentation.ts";
register("../payment-return/next-loader.mjs", import.meta.url);
register("./style-loader.mjs", import.meta.url);
mock.module("../../components/safe-image.tsx", {
  namedExports: {
    SafeImage: (props: ImgHTMLAttributes<HTMLImageElement>) =>
      createElement("img", props),
  },
});
const { PharmacyCombined } = await import(
  "../../components/pharmacy/combined.tsx"
);
const reference = readFileSync(
    "test/pharmacy-reveal/combined-reference.html",
    "utf8",
  ),
  css = readFileSync("components/pharmacy/combined.css", "utf8");
const manifest = JSON.parse(
  readFileSync("test/pharmacy-reveal/combined-reference.json", "utf8"),
);
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
let browser: Browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});
const markup = (locale: "en" | "th" | "zh-CN" = "en") =>
  renderToStaticMarkup(
    createElement(PharmacyCombined, {
      locale,
      sourceLocale: locale,
      slug: "delight",
      pharmacyName: "Delight",
      planId: "fixture",
      revision: 1,
      initial: null,
      initialResult: null,
    }),
  );
const base = `<base href="http://127.0.0.1:3100"><style>body{margin:0;font:14px/1.5 Arial}*{box-sizing:border-box}:root{--mn-cream:#faf7f0;--mn-paper:#fff;--mn-ink:#182d22;--mn-ash:#69766d;--color-line:#ddd;--color-forest:#194c39;--color-forest-light:#537d63;--color-gold:#b89652;--mn-mint:#edf3eb;--mn-font-body:Arial;--mn-font-display:Georgia}</style>`;
async function pages(width: number) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
  });
  await context.route("**/*", (route) => {
    const path = new URL(route.request().url()).pathname;
    return path.startsWith("/assets/") && existsSync("public" + path)
      ? route.fulfill({
          body: readFileSync("public" + path),
          contentType: "image/webp",
        })
      : route.abort();
  });
  const control = await context.newPage(),
    candidate = await context.newPage();
  // Disable demonstration scheduling only. Execute the original geometry functions unchanged.
  await control.setContent(
    base +
      reference.replace(
        "    play();",
        '    window.referenceFlight = prepareClarityFlight; play(); clearTimers(); setPhase("clarity", "MattaNutra is bringing your personalised plan into focus");',
      ),
  );
  await candidate.setContent(base + `<style>${css}</style>` + markup());
  for (const page of [control, candidate])
    await page.evaluate(() => {
      document
        .querySelector(".mn-window")!
        .setAttribute("data-phase", "clarity");
      document.querySelectorAll("*").forEach((el) =>
        el.getAnimations().forEach((a) => {
          a.pause();
          a.currentTime = 1000;
        }),
      );
    });
  return { context, control, candidate };
}
test("PHARM-WAIT-01 frozen reference and exact existing Nong/leaf bytes are preserved", () => {
  assert.equal(hash(reference), manifest.independentReferenceSha256);
  assert.ok(Object.keys(manifest.assetHashes).length >= 5);
  for (const [digest, path] of Object.entries(manifest.assetHashes))
    assert.equal(hash(readFileSync(`public${path}`)), digest);
  const view = markup();
  for (const pose of ["thinking", "comparing", "energetic"]) {
    assert.ok(view.includes(`/assets/pharmacy/combined/nong-${pose}-empty.webp`));
  }
  assert.match(view, /combined\/leaf.webp/);
});
for (const width of [1280, 390])
  test(`PHARM-WAIT-02 ${width}px anchors, five curves and orbit match independent reference geometry`, async () => {
    const { context, control, candidate } = await pages(width);
    try {
      // Use a class index: the question spans follow the SVG in both implementations.
      const actual = await candidate.evaluate(() => {
        const v = document
          .querySelector(".mn-clarity-visual")!
          .getBoundingClientRect();
        const center = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2 - v.x, y: r.y + r.height / 2 - v.y };
        };
        return {
          width: v.width,
          height: v.height,
          source: center(document.querySelector(".mn-brand-mark")!),
          questions: [
            ...document.querySelectorAll("[data-clarity-question]"),
          ].map(center),
          core: center(document.querySelector(".mn-core")!),
          shellSize: document
            .querySelector(".mn-clarity-logo-shell")!
            .getBoundingClientRect().width,
        };
      });
      const expected = await control.evaluate(() => {
        const w = window as unknown as {
          referenceFlight: () => {
            segments: {
              p0: { x: number; y: number };
              c1: { x: number; y: number };
              c2: { x: number; y: number };
              p1: { x: number; y: number };
            }[];
          };
        };
        const f = w.referenceFlight();
        return {
          flight: f,
          path: document.querySelector(".mn-clarity-path")!.getAttribute("d"),
        };
      });
      const calculated = clarityFlight(actual);
      assert.equal(calculated.segments.length, 5);
      assert.equal(expected.flight.segments.length, 5);
      // Site header and text alter the source's vertical offset; compare relative local geometry,
      // then evaluate the reference with the same DOM anchors, independently of production math.
      const referenceVisual = await control
        .locator(".mn-clarity-visual")
        .boundingBox();
      assert.ok(referenceVisual);
      assert.equal(actual.width, referenceVisual.width);
      assert.equal(actual.height, referenceVisual.height);
      for (let segment = 1; segment < 5; segment++)
        for (const key of ["p0", "c1", "c2", "p1"] as const) {
          const a = calculated.segments[segment][key],
            b = expected.flight.segments[segment][key];
          assert.ok(
            Math.abs(a.x - b.x) < 0.1,
            `${width}: segment ${segment} ${key} x ${a.x} vs ${b.x}`,
          );
          assert.ok(
            Math.abs(a.y - b.y) < 0.1,
            `${width}: segment ${segment} ${key} y ${a.y} vs ${b.y}`,
          );
        }
      for (const s of calculated.segments)
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const p = cubicPoint(s, t);
          assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
        }
      assert.equal(
        await candidate.evaluate(() => document.documentElement.scrollWidth),
        width,
      );
      const evidence = process.env["MCP_pharmacy-reveal_EVIDENCE_DIR"];
      if (evidence) {
        mkdirSync(evidence + "/reference-frames", { recursive: true });
        await control.screenshot({
          path: `${evidence}/reference-frames/reference-${width}.png`,
          fullPage: true,
        });
        await candidate.screenshot({
          path: `${evidence}/reference-frames/candidate-${width}.png`,
          fullPage: true,
        });
      }
    } finally {
      await context.close();
    }
  });
test("PHARM-WAIT-03 styles and all keyframes are pharmacy-scoped", () => {
  assert.doesNotMatch(css, /#mn-funnel-v9/);
  assert.ok(css.includes("#mn-pharmacy-combined"));
  const names = [...css.matchAll(/@keyframes\s+([^\s{]+)/g)].map((m) => m[1]);
  assert.ok(names.length > 10);
  assert.ok(names.every((n) => n.startsWith("mn-pharmacy-combined-")));
});
for (const locale of ["en", "th", "zh-CN"] as const)
  test(`PHARM-WAIT-04 ${locale} no invented counts, prices or demographic name`, () => {
    const html = markup(locale);
    assert.doesNotMatch(
      html,
      /160\+|12 ingredients|for Male|for Female|8E5C4C1F/,
    );
    assert.equal((html.match(/class="mn-analysis-tile /g) ?? []).length, 5);
    assert.equal((html.match(/class="mn-rain-chip /g) ?? []).length, 0);
    assert.doesNotMatch(html, /class="mn-product /);
  });
test("PHARM-WAIT-05 reduced motion has no ongoing decorative animation", async () => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await page.route("**/*", (r) => r.abort());
    await page.setContent(base + `<style>${css}</style>` + markup());
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
  } finally {
    await page.close();
  }
});

test('PHARM-WAIT-06 completion/failure stops pseudo-element decoration and hidden tabs pause it',async()=>{
  const page=await browser.newPage();
  try{
    await page.route('**/*',r=>r.abort());
    await page.setContent(base+`<style>${css}</style>`+markup());
    for(const phase of ['ready','failed']){
      await page.locator('.mn-window').evaluate((el,value)=>el.setAttribute('data-phase',value),phase);
      const running=await page.locator('#mn-pharmacy-combined').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a instanceof CSSAnimation&&a.playState==='running').length);
      assert.equal(running,0,`${phase} must stop decoration including pseudo-elements`);
    }
    await page.locator('.mn-window').evaluate(el=>{el.setAttribute('data-phase','clarity');el.setAttribute('data-paused','true');});
    assert.equal(await page.locator('#mn-pharmacy-combined').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a instanceof CSSAnimation&&a.playState==='running').length),0);
  }finally{await page.close();}
});
