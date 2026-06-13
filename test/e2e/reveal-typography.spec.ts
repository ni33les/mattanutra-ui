import { expect, test } from "@playwright/test";

const revealSmokeUrl = process.env.REVEAL_VISUAL_SMOKE_URL;

test.skip(
  !revealSmokeUrl,
  "Set REVEAL_VISUAL_SMOKE_URL to a real paid reveal page before running this smoke test.",
);

test("final reveal renders the handoff fonts and hero eyebrow rules", async ({
  baseURL,
  page,
}) => {
  const stylesheetResponses: Array<{ status: number; url: string }> = [];
  page.on("response", (response) => {
    const contentType = response.headers()["content-type"] ?? "";
    const isStylesheet =
      response.request().resourceType() === "stylesheet" ||
      contentType.includes("text/css");

    if (isStylesheet) {
      stylesheetResponses.push({
        status: response.status(),
        url: response.url(),
      });
    }
  });

  const targetUrl = revealSmokeUrl!.startsWith("http")
    ? revealSmokeUrl!
    : new URL(revealSmokeUrl!, baseURL).toString();

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mn-reveal-final", { state: "visible" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".mn-titlebar")).toHaveCount(0);
  await expect(page.locator(".mn-reveal-brandbar")).toBeVisible();

  const headline = page.locator(".mn-reveal-final h1").first();
  await expect(headline).toBeVisible();
  const headlineFont = await headline.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  const headlineTracking = await headline.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).letterSpacing),
  );
  const headlineStyle = await headline.evaluate(
    (element) => getComputedStyle(element).fontStyle,
  );
  const frauncesFaces = await page.evaluate(() =>
    Array.from(document.fonts)
      .filter((face) => /Fraunces/i.test(face.family))
      .map((face) => ({
        family: face.family,
        status: face.status,
        style: face.style,
        weight: face.weight,
      })),
  );

  expect(headlineFont).toMatch(/Fraunces/i);
  expect(headlineStyle).toBe("italic");
  expect(headlineTracking).toBeLessThan(-3);
  expect(
    frauncesFaces.some(
      (face) => face.status === "loaded" && face.style === "italic",
    ),
  ).toBe(true);

  const eyebrow = page.locator(".mn-reveal-hero-eyebrow").first();
  await expect(eyebrow).toBeVisible();
  const eyebrowFont = await eyebrow.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  const eyebrowTracking = await eyebrow.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).letterSpacing),
  );
  expect(eyebrowFont).toMatch(/JetBrains Mono/i);
  expect(eyebrowTracking).toBeGreaterThan(3);

  const ruleWidths = await eyebrow.evaluate((element) => {
    const before = getComputedStyle(element, "::before");
    const after = getComputedStyle(element, "::after");

    return {
      after: Number.parseFloat(after.width),
      before: Number.parseFloat(before.width),
    };
  });

  expect(ruleWidths.before).toBeGreaterThan(20);
  expect(ruleWidths.after).toBeGreaterThan(20);
  await expect(page.locator(".mn-reveal-hero-headline em")).toBeVisible();
  await expect(page.locator(".mn-reveal-pharmacist.ink-section")).toBeVisible();

  const productsSection = page.locator("#products").first();
  await expect(productsSection).toBeVisible();
  await expect(productsSection).toHaveClass(/mn-reveal-products/);
  await expect(productsSection).not.toHaveClass(/ink-section/);
  const productsBackground = await productsSection.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(productsBackground).not.toMatch(/rgb\(10,\s*37,\s*64\)|rgb\(14,\s*45,\s*77\)|rgb\(15,\s*44,\s*34\)/);
  await expect(
    page.locator("#products .mn-reveal-concierge-banner").first(),
  ).toBeVisible();
  await expect(
    page.locator("#products .mn-reveal-selected-pharmacy").first(),
  ).toBeVisible();
  await expect(page.locator("#products .summary-card").first()).toBeVisible();
  await expect(page.locator("#products .checkout-card").first()).toBeVisible();
  expect(await page.locator("#products .product-card").count()).toBeGreaterThan(0);

  await expect(page.locator(".mn-reveal-food").first()).toBeVisible();
  await expect(page.locator(".mn-reveal-panya").first()).toBeVisible();
  await expect(page.locator(".mn-reveal-panya .mn-reveal-final-label-number")).toHaveCount(0);
  await expect(page.locator(".mn-reveal-safety.ink-section").first()).toBeVisible();
  await expect(page.locator(".mn-reveal-closing.ink-section").first()).toBeVisible();

  const checkoutHref = await page
    .locator("#products .checkout-card a[href*='/basket/checkout']")
    .first()
    .getAttribute("href");
  expect(checkoutHref).toContain("plan=");
  expect(checkoutHref).toContain("selected=");
  expect(checkoutHref).toContain("removed=");

  const visualViewports = [
    {
      height: 720,
      sections: [
        ["hero", headline],
        ["assessment", page.locator(".mn-reveal-assessment").first()],
        ["distillation", page.locator(".mn-reveal-distillation").first()],
        ["formula", page.locator(".mn-reveal-formula").first()],
        ["products", productsSection],
        ["food-panya", page.locator(".mn-reveal-food").first()],
        ["safety", page.locator(".mn-reveal-safety").first()],
        ["closing", page.locator(".mn-reveal-closing").first()],
      ] as const,
      width: 1280,
    },
    {
      height: 900,
      sections: [
        ["assessment", page.locator(".mn-reveal-assessment").first()],
        ["products", productsSection],
        ["food-panya", page.locator(".mn-reveal-food").first()],
        ["closing", page.locator(".mn-reveal-closing").first()],
      ] as const,
      width: 834,
    },
    {
      height: 844,
      sections: [
        ["assessment", page.locator(".mn-reveal-assessment").first()],
        ["formula", page.locator(".mn-reveal-formula").first()],
        ["products", productsSection],
        ["food-panya", page.locator(".mn-reveal-food").first()],
        ["closing", page.locator(".mn-reveal-closing").first()],
      ] as const,
      width: 390,
    },
  ];

  for (const viewport of visualViewports) {
    await page.setViewportSize({
      height: viewport.height,
      width: viewport.width,
    });

    for (const [sectionName, locator] of viewport.sections) {
      await locator.scrollIntoViewIfNeeded();
      await page.screenshot({
        fullPage: false,
        path: `test-results/reveal-${sectionName}-${viewport.width}.png`,
      });
    }
  }
  expect(
    stylesheetResponses.some(
      (response) =>
        response.status === 200 &&
        response.url.includes("/_next/static/") &&
        response.url.includes(".css"),
    ),
  ).toBe(true);
});
