import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/offline-browser";

// Measured from the supplied, unmodified HTML in Chromium, not from application CSS.
const reference = JSON.parse(readFileSync("test/pharmacy-landing/reference.json", "utf8"));
const slug = "matcher-v5-isolated-fixture-retailer";
// Production minification omits default gradient endpoints. Private family names
// change CSS quoting only; the independently verified font bytes stay identical.
const canonicalCss = (css: Record<string, string>) => ({ ...css,
  fontFamily: css.fontFamily.replaceAll("Pharmacy ", "").replaceAll('"', ""),
  backgroundImage: css.backgroundImage.replace(/\) 0%,/g, "),").replace(/\) 100%\)$/g, "))")
});
for (const view of reference.views) {
  test(`PHARM-LANDING ${view.locale} ${view.width}px matches the supplied content and geometry`, async ({ page }, info) => {
    await page.setViewportSize({ width: view.width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${view.locale}/retail/${slug}/landing`);
    await page.evaluate(() => document.fonts.ready);
    const landing = page.getByTestId("pharmacy-landing");
    await expect(landing).toBeVisible();
    await expect(page.locator(".mn-titlebar")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    const hero = landing.locator(".hero-section");
    await expect(hero).toBeVisible();
    const bounds = (await hero.boundingBox())!;
    for (const key of ["width", "height"] as const) expect(Math.abs(bounds[key] - view.hero[key]), `hero ${key}`).toBeLessThan(1);
    for (const expected of view.elements) {
      const el = hero.locator(expected.selector);
      await expect(el).toHaveCount(1);
      expect(await el.innerText(), expected.selector).toBe(expected.text);
      const box = (await el.boundingBox())!;
      const actual = { x: box.x - bounds.x, y: box.y - bounds.y, width: box.width, height: box.height };
      for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(actual[key] - expected.rect[key]), `${expected.selector} ${key}`).toBeLessThan(1);
      const css = await el.evaluate(e => {
        const s = getComputedStyle(e);
        return Object.fromEntries(["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "color", "backgroundImage", "borderRadius", "textAlign"].map(k => [k, String(s[k as keyof CSSStyleDeclaration])]));
      });
      expect(canonicalCss(css), expected.selector).toEqual(canonicalCss(expected.css));
    }
    await expect(hero.locator(".primary-cta")).toHaveAttribute("href", `/${view.locale}/retail/${slug}/quiz`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(view.width);
    await page.screenshot({ path: info.outputPath("landing.png"), fullPage: true });
  });
}

test("PHARM-LANDING Chinese retains localized content and pharmacy questionnaire routing", async ({ page }) => {
  await page.goto(`/zh-CN/retail/${slug}/landing`);
  const landing = page.getByTestId("pharmacy-landing");
  await expect(landing.getByRole("heading", { level: 1 })).toContainText("不再猜测");
  await expect(landing.getByRole("link")).toHaveAttribute("href", `/zh-CN/retail/${slug}/quiz`);
  await expect(page.locator(".mn-titlebar")).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
});
