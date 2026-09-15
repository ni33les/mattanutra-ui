import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { register } from "node:module";
import { createElement, type ImgHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser, type Page } from "@playwright/test";

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
  return page;
}

async function assertSubtleIdle(page: Page) {
  const motion = await page.locator('.mn-pharmacy-waiting-nong').evaluate(el => {
    const image = el.querySelector('img')!;
    const animations = image.getAnimations();
    if (animations.length !== 1) throw new Error('Nong needs one subtle idle animation');
    const idle = animations[0]; idle.pause();
    const duration = Number(idle.effect!.getTiming().duration);
    const frames = [0, .25, .5, .75, .99].map(fraction => {
      idle.currentTime = fraction * duration;
      const r = image.getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y};
    });
    const home = el.getBoundingClientRect(), section = el.closest('section')!.getBoundingClientRect();
    return {frames, duration, path: getComputedStyle(el).offsetPath, travelling: el.getAnimations().length,
      center: home.x + home.width / 2, expectedCenter: section.x + section.width / 2, top: home.y - section.y};
  });
  assert.equal(motion.path, 'none');
  assert.equal(motion.travelling, 0, 'the sprite container stays anchored at the top');
  assert.ok(Math.abs(motion.center - motion.expectedCenter) < 1);
  assert.ok(motion.top >= 0 && motion.top <= 80);
  const vertical = Math.max(...motion.frames.map(f => f.y)) - Math.min(...motion.frames.map(f => f.y));
  assert.ok(vertical > 1 && vertical < 6, 'a small visible bob, not page travel');
  assert.ok(Math.max(...motion.frames.map(f => f.x)) - Math.min(...motion.frames.map(f => f.x)) < 3);
  assert.ok(motion.duration >= 4000, 'gentle idle timing');
}

for (const [locale, phrase] of [["en", "about a minute"], ["th", "ประมาณ 1 นาที"], ["zh-CN", "大约需要一分钟"]] as const) {
  test(`PHARM-WAIT-01 ${locale} keeps page-wide rain with a subtle stationary Nong`, async () => {
    const page = await view(locale);
    try {
      assert.match(await page.locator("section").innerText(), new RegExp(phrase));
      assert.equal(await page.locator('[data-testid="pharmacy-waiting-art"][aria-hidden="true"]').count(), 1);
      assert.equal(await page.locator('.mn-pharmacy-waiting-word').count(), 36);
      assert.equal(await page.locator('img[src="/assets/library/nong/nong-thinking.webp"]').count(), 1);
      assert.equal(await page.locator("ol li").count(), 3);
      assert.equal(await page.locator("ol li").nth(1).locator(".lucide-loader-circle").count(), 1);
      const rain = await page.locator('[data-testid="pharmacy-waiting-art"]').evaluate(el => {
        const word = el.querySelector('.mn-pharmacy-waiting-word')!;
        const animation = word.getAnimations()[0]; animation.pause();
        const timing = animation.effect!.getTiming();
        animation.currentTime = Number(timing.delay) + Number(timing.duration) * .05;
        const start = word.getBoundingClientRect().y;
        animation.currentTime = Number(timing.delay) + Number(timing.duration) * .9;
        return {width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height,
          fall: word.getBoundingClientRect().y - start, pointerEvents: getComputedStyle(el).pointerEvents};
      });
      assert.equal(rain.width, 375);
      assert.ok(rain.fall > rain.height * .75);
      assert.equal(rain.pointerEvents, 'none');
      await assertSubtleIdle(page);
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


test("PHARM-WAIT-05 saving keeps the same subtle idle at the top", async () => {
  const page = await view("en", 0);
  try {
    assert.equal(await page.locator(".lucide-loader-circle").count(), 0);
    await assertSubtleIdle(page);
    assert.equal(await page.locator(".mn-pharmacy-waiting-word").count(), 36);
  } finally { await page.close(); }
});

test("PHARM-WAIT-06 desktop product matching keeps Nong at the top and the real spinner below", async () => {
  const page = await view("en", 2);
  try {
    await page.setViewportSize({width: 1280, height: 900});
    await assertSubtleIdle(page);
    assert.equal(await page.locator('ol li').nth(1).locator('.lucide-check').count(), 1);
    assert.equal(await page.locator('ol li').nth(2).locator('.lucide-loader-circle').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1280);
  } finally { await page.close(); }
});
