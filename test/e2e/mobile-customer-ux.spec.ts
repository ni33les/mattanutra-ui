import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "../helpers/offline-browser";

const mobileViewports = [
  { height: 667, name: "iphone-se", width: 375 },
  { height: 844, name: "iphone-12", width: 390 },
  { height: 932, name: "large-phone", width: 430 },
] as const;

const optionalTargets = [
  {
    envName: "MOBILE_UX_REVEAL_URL or REVEAL_VISUAL_SMOKE_URL",
    marker: ".mn-reveal-final",
    name: "reveal",
    url: process.env.MOBILE_UX_REVEAL_URL || process.env.REVEAL_VISUAL_SMOKE_URL,
  },
  {
    envName: "MOBILE_UX_CHECKOUT_URL",
    marker: "main",
    name: "checkout",
    url: process.env.MOBILE_UX_CHECKOUT_URL,
  },
  {
    envName: "MOBILE_UX_ORDER_URL",
    marker: "main",
    name: "order",
    url: process.env.MOBILE_UX_ORDER_URL,
  },
] as const;

function toTargetUrl(pathOrUrl: string, baseURL?: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return new URL(pathOrUrl, baseURL).toString();
}

async function waitForCustomerPage(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
}

async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body?.scrollWidth ?? 0,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  const allowedWidth = metrics.clientWidth + 4;

  expect(metrics.documentScrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(
    allowedWidth,
  );
  expect(metrics.bodyScrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(
    allowedWidth,
  );
}

async function assertVisibleInteractiveControlsAreNamed(page: Page) {
  const offenders = await page
    .locator("header a, header button, header summary, main a, main button")
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const htmlElement = element as HTMLElement;
        const closedDetails = htmlElement.closest("details:not([open])");

        if (closedDetails && htmlElement.tagName.toLowerCase() !== "summary") {
          return [];
        }

        const rect = htmlElement.getBoundingClientRect();
        const style = window.getComputedStyle(htmlElement);
        const visible =
          rect.width >= 20 &&
          rect.height >= 20 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0.01;

        if (!visible) {
          return [];
        }

        const name =
          htmlElement.innerText?.trim() ||
          htmlElement.getAttribute("aria-label")?.trim() ||
          htmlElement.getAttribute("title")?.trim() ||
          "";

        return name ? [] : [htmlElement.outerHTML.slice(0, 180)];
      }),
    );

  expect(offenders).toEqual([]);
}

async function saveMobileScreenshot(page: Page, name: string, viewportName: string) {
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    fullPage: false,
    path: `test-results/mobile-customer-${name}-${viewportName}.png`,
  });
}

test.describe("mobile customer UX", () => {
  for (const viewport of mobileViewports) {
    test(`homepage labels and controls stay visible at ${viewport.width}px`, async ({
      baseURL,
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(toTargetUrl("/en", baseURL));
      await waitForCustomerPage(page);

      await expect(page.locator(".mn-titlebar")).toBeVisible();
      await expect(page.locator("header .mn-language-switcher").first()).toBeVisible();
      await expect(page.locator(".mn-titlebar-mobile-menu summary")).toBeVisible();
      await expect(page.locator(".mn-availability-pill").first()).toBeVisible();

      const visibleQuizLinks = await page
        .locator('a[href*="/nutrition/quiz"]')
        .evaluateAll((elements) =>
          elements.filter((element) => {
            const rect = (element as HTMLElement).getBoundingClientRect();
            const style = window.getComputedStyle(element);

            return (
              rect.width > 20 &&
              rect.height > 20 &&
              style.display !== "none" &&
              style.visibility !== "hidden"
            );
          }).length,
        );
      expect(visibleQuizLinks).toBeGreaterThan(0);

      await assertNoHorizontalOverflow(page);
      await assertVisibleInteractiveControlsAreNamed(page);
      await saveMobileScreenshot(page, "home", viewport.name);
    });

    test(`quiz welcome and progress labels stay visible at ${viewport.width}px`, async ({
      baseURL,
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(toTargetUrl("/en/nutrition/quiz", baseURL));
      await waitForCustomerPage(page);

      await expect(page.getByTestId("questionnaire-welcome")).toBeVisible();
      await expect(page.getByTestId("chat-questionnaire")).toHaveCount(0);
      await expect.poll(() => page.getByTestId("questionnaire-welcome").locator("img").evaluate(
        element => (element as HTMLImageElement).naturalWidth
      )).toBeGreaterThan(0);
      await page.getByTestId("questionnaire-welcome-cta").click();
      const progress = page.getByTestId("quiz-progress-header");
      await expect(progress).toBeVisible();
      await expect(progress).toContainText("Part 1 of 6");
      await expect(page.getByTestId("question-answers")).toBeVisible();
      await expect(page.getByTestId("review-answers-btn")).toBeVisible();
      const label = progress.locator(".mn-chat-q__vial-pct b");
      const box = await label.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThan(16);
      expect(box!.width).toBeGreaterThan(80);

      await assertNoHorizontalOverflow(page);
      await assertVisibleInteractiveControlsAreNamed(page);
      await progress.scrollIntoViewIfNeeded();
      await saveMobileScreenshot(page, "quiz", viewport.name);
    });
  }

  for (const target of optionalTargets) {
    test(`${target.name} customer screen passes mobile smoke when configured`, async ({
      baseURL,
      page,
    }) => {
      test.skip(!target.url, `Set ${target.envName} to include ${target.name}.`);

      await page.setViewportSize(mobileViewports[1]);
      await page.goto(toTargetUrl(target.url!, baseURL));
      await waitForCustomerPage(page);

      await expect(page.locator(target.marker).first()).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertVisibleInteractiveControlsAreNamed(page);
      await saveMobileScreenshot(page, target.name, mobileViewports[1].name);
    });
  }
});
