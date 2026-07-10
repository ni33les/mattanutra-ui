import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const visualKnowledge = JSON.parse(
  readFileSync(
    new URL("../../content/library/visual-knowledge.json", import.meta.url),
    "utf8"
  )
) as { articles: Array<{ slug: string }> };
const articleSlugs = visualKnowledge.articles.map((article) => article.slug);
const focusedSlugs = [
  "should-you-take-magnesium-every-day",
  "do-you-need-a-probiotic",
  "lions-mane-supplement-worth-it",
  "expensive-health-check-leave-out",
  "blood-panel-personalise-supplements-cost"
] as const;
const indexLocales = ["en", "th", "zh-CN"] as const;
const desktopViewport = { height: 900, width: 1280 };
const mobileViewport = { height: 844, width: 390 };

function targetUrl(path: string, baseURL?: string) {
  return new URL(path, baseURL).toString();
}

async function waitForLibraryPage(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
}

async function assertNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body?.scrollWidth ?? 0,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth
  }));
  const allowedWidth = metrics.clientWidth + 4;

  expect(metrics.documentScrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(
    allowedWidth
  );
  expect(metrics.bodyScrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(
    allowedWidth
  );
}

async function assertNoVisibleTextOverflow(page: Page, selector: string) {
  const offenders = await page.locator(selector).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const htmlElement = element as HTMLElement;
      const rect = htmlElement.getBoundingClientRect();
      const style = window.getComputedStyle(htmlElement);
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden";

      if (!visible || htmlElement.scrollWidth <= htmlElement.clientWidth + 2) {
        return [];
      }

      return [
        `${htmlElement.tagName.toLowerCase()}.${htmlElement.className}:${htmlElement.textContent
          ?.replace(/\s+/g, " ")
          .trim()
          .slice(0, 100)}`
      ];
    })
  );

  expect(offenders).toEqual([]);
}

async function saveLibraryScreenshot(page: Page, name: string) {
  mkdirSync("test-results/library-remediation", { recursive: true });
  await page.screenshot({
    fullPage: true,
    path: `test-results/library-remediation/${name}.png`
  });
}

test.describe("Library UX remediation", () => {
  test("homepage Library preview exposes the full launch set", async ({
    baseURL,
    page
  }) => {
    await page.setViewportSize(desktopViewport);
    await page.goto(targetUrl("/en", baseURL));
    await waitForLibraryPage(page);

    await expect(page.locator("[data-home-library-card]")).toHaveCount(
      articleSlugs.length
    );
    await assertNoHorizontalOverflow(page);
  });

  test("localized Library indexes render without horizontal overflow", async ({
    baseURL,
    page
  }) => {
    for (const locale of indexLocales) {
      for (const [viewportName, viewport] of [
        ["desktop", desktopViewport],
        ["mobile", mobileViewport]
      ] as const) {
        await page.setViewportSize(viewport);
        await page.goto(targetUrl(`/${locale}/library`, baseURL));
        await waitForLibraryPage(page);

        await expect(page.locator("[data-library-grid]")).toBeVisible();
        await expect(page.locator("[data-library-card]").first()).toBeVisible();
        await expect(page.locator("[data-library-card]")).toHaveCount(
          articleSlugs.length
        );
        await assertNoHorizontalOverflow(page);
        await assertNoVisibleTextOverflow(
          page,
          "[data-library-card], [data-library-card] h2, [data-library-card] p"
        );

        if (locale === "en") {
          await saveLibraryScreenshot(page, `index-${viewportName}`);
        }
      }
    }
  });

  test("all generated English article routes render", async ({ baseURL, page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(desktopViewport);

    for (const slug of articleSlugs) {
      await page.goto(targetUrl(`/en/library/${slug}`, baseURL));
      await waitForLibraryPage(page);

      await expect(page.locator(".mn-library-visual")).toBeVisible();
      await expect(page.locator(".mn-library-visual h1").first()).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }
  });

  test("high-risk article pages keep CTAs, cards, and share buttons contained", async ({
    baseURL,
    page
  }) => {
    test.setTimeout(120_000);

    for (const slug of focusedSlugs) {
      for (const [viewportName, viewport] of [
        ["desktop", desktopViewport],
        ["mobile", mobileViewport]
      ] as const) {
        await page.setViewportSize(viewport);
        await page.goto(targetUrl(`/en/library/${slug}`, baseURL));
        await waitForLibraryPage(page);

        await expect(page.locator(".mn-library-visual .cta").first()).toBeVisible();
        await assertNoHorizontalOverflow(page);
        await assertNoVisibleTextOverflow(
          page,
          ".mn-library-visual .cta .btn, .mn-library-visual .share a, .mn-library-visual .share button, .mn-library-visual .related a, .mn-library-visual .benefit, .mn-library-visual .stance, .mn-library-visual .it, .mn-library-visual .cost-card, .mn-library-visual .package-card, .mn-library-visual .missing-card"
        );
        await saveLibraryScreenshot(page, `${slug}-${viewportName}`);
      }
    }
  });

  test("blood panel cost article separates bottom links and restores quiz result CTA", async ({
    baseURL,
    page
  }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto(
      targetUrl("/en/library/blood-panel-personalise-supplements-cost", baseURL)
    );
    await waitForLibraryPage(page);

    const share = page.locator(".mn-library-visual .share.mn-library-fragment");
    const related = page.locator(".mn-library-visual .related.mn-library-fragment");

    await expect(share).toBeVisible();
    await expect(related).toBeVisible();
    await expect(share.locator("a#share-line")).toHaveAttribute(
      "href",
      /^https:\/\/social-plugins\.line\.me\/lineit\/share/
    );
    await expect(share.locator("a#share-facebook")).toHaveAttribute(
      "href",
      /^https:\/\/www\.facebook\.com\/sharer\/sharer\.php/
    );
    await expect(share.locator("button[data-copy]")).toBeVisible();
    await expect(related.locator('a[href^="/en/library/"]')).toHaveCount(4);
    await expect
      .poll(async () => share.evaluate((element) => getComputedStyle(element).display))
      .toBe("flex");
    await expect
      .poll(async () => related.evaluate((element) => getComputedStyle(element).display))
      .toBe("flex");

    const nongTags = page.locator(".mn-library-visual .nong-card .tags > span");
    await expect(nongTags.first()).toBeVisible();
    const nongTagProblems = await nongTags.evaluateAll((tags) => {
      const card = tags[0]?.closest(".nong-card") as HTMLElement | null;

      if (!card) {
        return ["missing Nong card"];
      }

      const cardRect = card.getBoundingClientRect();

      return tags.flatMap((tag) => {
        const element = tag as HTMLElement;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const problems: string[] = [];

        if (!style.display.includes("flex")) {
          problems.push(`bad display:${style.display}`);
        }

        if (rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1) {
          problems.push(`tag overflow:${element.textContent?.trim()}`);
        }

        return problems;
      });
    });

    expect(nongTagProblems).toEqual([]);

    const questions = page.locator(".mn-library-visual .q");
    const questionCount = await questions.count();
    expect(questionCount).toBeGreaterThan(0);

    for (let index = 0; index < questionCount; index += 1) {
      await questions.nth(index).locator("button").first().click();
    }

    const result = page.locator(".mn-library-visual .result.on").first();
    await expect(result).toBeVisible();
    await expect(
      result.locator('a.mn-quiz-result-cta[href="/en/nutrition/quiz"]')
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertNoVisibleTextOverflow(
      page,
      ".mn-library-visual .share a, .mn-library-visual .share button, .mn-library-visual .related a, .mn-library-visual .nong-card .tags > span, .mn-library-visual .result .mn-quiz-result-cta"
    );
  });
});
