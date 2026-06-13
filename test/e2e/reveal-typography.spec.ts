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

  const headline = page.locator(".mn-reveal-final h1").first();
  await expect(headline).toBeVisible();
  const headlineFont = await headline.evaluate(
    (element) => getComputedStyle(element).fontFamily,
  );
  const headlineTracking = await headline.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).letterSpacing),
  );
  expect(headlineFont).toMatch(/Fraunces/i);
  expect(headlineTracking).toBeLessThan(-3);

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
  await expect(page.locator(".mn-reveal-pharmacist.ink-section")).toBeVisible();
  expect(
    stylesheetResponses.some(
      (response) =>
        response.status === 200 &&
        response.url.includes("/_next/static/") &&
        response.url.includes(".css"),
    ),
  ).toBe(true);
});
