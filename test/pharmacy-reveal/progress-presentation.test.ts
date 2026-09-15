import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { register } from "node:module";
import { createElement, type ImgHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser } from "@playwright/test";
import { positionPharmacyFlight } from "../../components/pharmacy/waiting-flight.ts";

// Exercise the real progress view and its CSS without starting matching or a database.
register("../payment-return/next-loader.mjs", import.meta.url);
mock.module("../../components/safe-image.tsx", {
  namedExports: { SafeImage: (props: ImgHTMLAttributes<HTMLImageElement>) => createElement("img", props) }
});
const { PharmacyProgressView } = await import("../../components/pharmacy/progress.tsx");
let browser: Browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function view(locale: "en" | "th" | "zh-CN", stage = 1, failed = false, reducedMotion: "reduce" | "no-preference" = "no-preference") {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion });
  await page.route("**/*", route => route.abort());
  await page.setContent("<style>body{margin:0}</style>" + renderToStaticMarkup(createElement(PharmacyProgressView, { locale, stage, failed, onRetry: () => {} })));
  await page.locator("section").evaluate(positionPharmacyFlight);
  return page;
}

for (const [locale, phrase] of [["en", "about a minute"], ["th", "ประมาณ 1 นาที"], ["zh-CN", "大约需要一分钟"]] as const) {
  test(`PHARM-WAIT-01 ${locale} shows page-wide rain and a spline flight that lands on steps then leaves`, async () => {
    const page = await view(locale);
    try {
      assert.match(await page.locator("section").innerText(), new RegExp(phrase));
      assert.equal(await page.locator('[data-testid="pharmacy-waiting-art"][aria-hidden="true"]').count(), 1);
      assert.equal(await page.locator('.mn-pharmacy-waiting-word').count(), 36);
      assert.equal(await page.locator('img[src="/assets/library/nong/nong-thinking.webp"]').count(), 1);
      assert.equal(await page.locator("ol li").count(), 3);
      assert.equal(await page.locator("ol li").nth(1).locator(".lucide-loader-circle").count(), 1);
      assert.equal(await page.locator("ol li").nth(2).locator(".lucide-check").count(), 0);
      const movement = await page.locator('[data-testid="pharmacy-waiting-art"]').evaluate(el => el.getAnimations({ subtree: true }).length);
      assert.ok(movement >= 37 && movement <= 44, "bounded word rain and a travelling sprite");
      const motion = await page.locator('[data-testid="pharmacy-waiting-art"]').evaluate(el => {
        const box = el.getBoundingClientRect();
        const word = el.querySelector('.mn-pharmacy-waiting-word')!;
        const sprite = el.querySelector('.mn-pharmacy-waiting-nong')!;
        const rain = word.getAnimations()[0], flight = sprite.getAnimations()[0];
        function at(animation: Animation, fraction: number, node: Element) {
          animation.pause();
          const timing = animation.effect!.getTiming();
          animation.currentTime = Number(timing.delay) + Number(timing.duration) * fraction;
          return node.getBoundingClientRect();
        }
        const start = at(rain, .05, word), end = at(rain, .9, word);
        const first = at(flight, .30, sprite), held = at(flight, .36, sprite);
        const second = at(flight, .66, sprite), exited = at(flight, .96, sprite);
        const badges = [...el.closest('section')!.querySelectorAll('ol li > span:first-child')].map(node => node.getBoundingClientRect());
        return { width: box.width, height: box.height, fall: end.y - start.y,
          path: getComputedStyle(sprite).offsetPath, first: { x: first.x + first.width / 2, y: first.bottom },
          held: { x: held.x + held.width / 2, y: held.bottom }, second: { x: second.x + second.width / 2, y: second.bottom },
          badges: badges.map(b => ({ x: b.x + b.width / 2, y: b.top - 6 })), exited: exited.left,
          pointerEvents: getComputedStyle(el).pointerEvents };
      });
      assert.equal(motion.width, 375, "rain covers the page width, not the small portrait slot");
      assert.ok(motion.fall > motion.height * .75, "words fall down the full waiting region");
      assert.match(motion.path, /^path\(/, "flight follows a geometric spline");
      assert.ok((motion.path.match(/C/g) ?? []).length >= 3, "flight has curved arrival, landing and departure segments");
      for (const [actual, expected] of [[motion.first, motion.badges[1]], [motion.second, motion.badges[2]]]) {
        assert.ok(Math.abs(actual.x - expected.x) < 2, "sprite lands on the step marker horizontally");
        assert.ok(Math.abs(actual.y - expected.y) < 2, "sprite feet land above the step marker");
      }
      assert.deepEqual(motion.first, motion.held, "landing includes a stationary pause");
      assert.ok(motion.exited >= 375, "sprite leaves the screen after the landings");
      assert.equal(motion.pointerEvents, "none");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
    } finally { await page.close(); }
  });
}

test("PHARM-WAIT-02 reduced motion keeps Nong Matta static and hides decorative words", async () => {
  const page = await view("en", 2, false, "reduce");
  try {
    assert.equal(await page.locator('[data-testid="pharmacy-waiting-art"]').count(), 1);
    assert.equal(await page.locator('[data-testid="pharmacy-waiting-art"]').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
    assert.equal(await page.locator('[data-testid="pharmacy-waiting-art"] span:visible').count(), 0);
    assert.equal(await page.locator("ol li").nth(1).locator(".lucide-check").count(), 1);
    assert.equal(await page.locator("ol li").nth(2).locator(".lucide-loader-circle").count(), 1);
  } finally { await page.close(); }
});

test("PHARM-WAIT-03 failure stops decoration and exposes the existing recovery without a time promise", async () => {
  const page = await view("en", 2, true);
  try {
    assert.equal(await page.locator('[data-testid="pharmacy-waiting-art"]').count(), 1);
    assert.equal(await page.locator('[data-testid="pharmacy-waiting-art"]').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
    assert.equal(await page.locator('[data-testid="pharmacy-waiting-art"] span:visible').count(), 0);
    assert.equal(await page.locator('[data-testid="pharmacy-progress-retry"]').count(), 1);
    assert.match(await page.getByRole("alert").innerText(), /saved answers are safe/);
    assert.doesNotMatch(await page.locator("section").innerText(), /about a minute/);
    assert.equal(await page.locator(".lucide-loader-circle").count(), 0);
  } finally { await page.close(); }
});

test("PHARM-WAIT-04 completion stops animation immediately and keeps all three real completion ticks", async () => {
  const page = await view("en", 3);
  try {
    assert.equal(await page.locator('[data-testid="pharmacy-waiting-art"]').count(), 1);
    assert.equal(await page.locator('[data-testid="pharmacy-waiting-art"]').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
    assert.equal(await page.locator('section[aria-busy="false"]').count(), 1);
    assert.equal(await page.locator("ol .lucide-check").count(), 3);
    assert.doesNotMatch(await page.locator("section").innerText(), /about a minute/);
  } finally { await page.close(); }
});
