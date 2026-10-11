import { expect, test } from "../helpers/offline-browser";

const slug = "matcher-v5-isolated-fixture-retailer";
// Text and compact card dimensions come from the v15.5 handoff. Site chrome
// remains platform-owned, so old standalone-page pixel offsets are obsolete.
const reference = {
  en: { headline: "Stop guessing.", cta: "Find What’s Right for Me" },
  th: { headline: "เลิกเดา", cta: "มาดูกันว่าอาหารเสริมอะไรบ้างที่เหมาะกับคุณ" },
  "zh-CN": { headline: "不再猜测", cta: "找到适合我的方案" }
} as const;

for (const locale of ["en", "th", "zh-CN"] as const) {
  for (const width of [390, 1280]) {
    test(`PHARM-LANDING ${locale} ${width}px preserves the QR destination and compact assessment card`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/${locale}/retail/${slug}/landing?source=business_card`);
      await page.evaluate(() => document.fonts.ready);
      const landing = page.getByTestId("pharmacy-landing");
      await expect(landing).toBeVisible();
      await expect(landing.getByRole("heading", { level: 1 })).toContainText(reference[locale].headline);
      await expect(page.locator(".mn-titlebar")).toBeVisible();
      await expect(page.locator("footer")).toBeVisible();
      const cta = landing.getByRole("link", { name: new RegExp(reference[locale].cta) });
      await expect(cta).toBeVisible();
      const target = new URL((await cta.getAttribute("href"))!, page.url());
      expect(target.pathname).toBe(`/${locale}/retail/${slug}/quiz`);
      expect(target.searchParams.get("source")).toBe("business_card");
      expect(target.searchParams.get("session")).toBe(new URL(page.url()).searchParams.get("session"));
      expect(target.searchParams.get("session")).toMatch(/^[0-9a-f-]{36}$/);
      const mascot = landing.locator('img[src="/assets/questionnaire/v15-5/nong-pharmacy-celebrate.webp"]');
      await expect(mascot).toBeVisible();
      expect(await mascot.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const card = landing.locator('section[aria-labelledby="pharmacy-page-title"]');
      const bounds = (await card.boundingBox())!;
      expect(bounds.width).toBeLessThanOrEqual(620);
      expect(bounds.width).toBeGreaterThan(width < 620 ? width - 65 : 580);
      expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await page.screenshot({ path: info.outputPath("landing.png"), fullPage: true });
      await cta.click();
      await expect(page.locator('[data-question="firstName"]')).toBeVisible();
      await expect(page.getByTestId("questionnaire-welcome")).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get("session")).toBe(target.searchParams.get("session"));
      expect(new URL(page.url()).searchParams.get("source")).toBe("business_card");
    });
  }
}
