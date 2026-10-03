import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { connectCopy } from "../../lib/connect-copy";
import { connectProviders } from "../../lib/connect";
const locales = ["en", "th", "zh-CN"] as const;

async function marketing(page: Page, context: BrowserContext, baseURL: string, optedOut = false) {
  const events: Record<string, unknown>[] = [];
  let pixelLoads = 0;
  await context.addCookies([{ name: "mn_marketing", value: optedOut ? "denied" : "granted", url: baseURL }]);
  await page.route("**/api/marketing/consent", route => route.fulfill({ json: { environment: "dev", enabled: true, pixelId: "123456789012345" } }));
  await page.route("**/api/marketing/events", route => { events.push(route.request().postDataJSON()); return route.fulfill({ json: { accepted: true, eventId: route.request().postDataJSON().eventId } }); });
  await page.route("**/api/connect/events", route => route.fulfill({ json: { accepted: true } }));
  await page.route("https://connect.facebook.net/**", route => { pixelLoads++; return route.fulfill({ body: "" }); });
  return { events, pixelLoads: () => pixelLoads };
}

test("all 15 localized pages have metadata, accessible controls and mobile layouts", async ({ page, context, baseURL }) => {
  const fixture = await marketing(page, context, baseURL!);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const locale of locales) {
    for (const provider of [undefined, ...connectProviders]) {
      const path = `/${locale}/connect${provider ? `/${provider}` : ""}`;
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(response?.headers()["content-security-policy"]).not.toContain("facebook");
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${path}$`));
      for (const language of locales) await expect(page.locator(`link[rel="alternate"][hreflang="${language === 'th' ? 'th-TH' : language}"]`)).toHaveCount(1);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`share-${locale}\\.png$`));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (provider) {
        await expect(page.getByRole("button", { name: connectCopy[locale].copyUrl, exact: true })).toBeVisible();
        await expect(page.locator(".mn-connect-instructions ol li")).toHaveCount(4);
        await expect(page.getByText(connectCopy[locale].pendingReview)).toBeVisible();
      } else await expect(page.locator(".mn-connect-provider")).toHaveCount(4);
    }
  }
  expect(fixture.pixelLoads()).toBe(0);
});

test("deep links, redirects and language switching retain provider and allowed campaign identifiers", async ({ page, context, baseURL }) => {
  await marketing(page, context, baseURL!);
  await context.addCookies([{ name: "NEXT_LOCALE", value: "th", url: baseURL! }]);
  await page.goto("/connect/grok?campaign_id=123&ad_id=456&fbclid=opaqueClick&connect_token=private");
  await expect(page).toHaveURL(/\/th\/connect\/grok\?/);
  const switcher = page.locator(".mn-language-switcher");
  await expect(switcher.getByRole("link", { name: "EN", exact: true })).toHaveAttribute("href", "/en/connect/grok?campaign_id=123&ad_id=456&fbclid=opaqueClick");
  await switcher.getByRole("link", { name: "EN", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/connect\/grok\?campaign_id=123&ad_id=456&fbclid=opaqueClick$/);
  await page.getByRole("link", { name: "All connection guides", exact: true }).click();
  await expect(page.locator('.mn-connect-provider[href*="claude"]')).toHaveAttribute("href", "/en/connect/claude?campaign_id=123&ad_id=456&fbclid=opaqueClick");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
});

test("copy failures recover without false copy events; verification is server-driven and polling stops", async ({ page, context, baseURL }) => {
  const fixture = await marketing(page, context, baseURL!);
  let polls = 0, status = "pending";
  const id = "a5252813-4567-4d12-aeff-3e94f852225f";
  await page.route("**/api/connect/attempts", route => route.fulfill({ status: 201, json: { id, status: "pending", expiresAt: new Date(Date.now() + 86400000).toISOString(), connectionUrl: `${baseURL}/api/mcp?connect_token=fixture-private` } }));
  await page.route(`**/api/connect/attempts/${id}`, route => { polls++; return route.fulfill({ json: { id, status, expiresAt: new Date(Date.now() + 86400000).toISOString() } }); });
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } }));
  await page.goto("/en/connect/claude");
  await page.getByRole("button", { name: "Copy connection URL", exact: true }).click();
  await expect(page.getByText(connectCopy.en.copyFailed, { exact: true })).toBeVisible();
  await expect(page.locator(".mn-connect-manual textarea")).toHaveValue(/fixture-private/);
  expect(fixture.events.filter(event => event.name === "McpUrlCopied")).toHaveLength(0);
  await expect(page.getByText(connectCopy.en.verified, { exact: true })).toHaveCount(0);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } }));
  await page.getByRole("button", { name: "Copy test prompt", exact: true }).click();
  await expect.poll(() => fixture.events.filter(event => event.name === "McpPromptCopied").length).toBe(1);
  expect(fixture.events.filter(event => event.name === "McpConnectionVerified")).toHaveLength(0);
  status = "verified";
  await expect(page.getByText(connectCopy.en.verified, { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "Copy starter prompt" })).toBeVisible();
  const stoppedAt = polls; await page.waitForTimeout(3500); expect(polls).toBe(stoppedAt);
  expect(fixture.pixelLoads()).toBe(0);
});

test("verification failure keeps the ordinary URL usable and saved advertising opt-outs are respected", async ({ page, context, baseURL }) => {
  const fixture = await marketing(page, context, baseURL!, true);
  await page.route("**/api/connect/attempts", route => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } }));
  await page.goto("/th/connect/perplexity");
  await page.getByRole("button", { name: connectCopy.th.copyUrl, exact: true }).click();
  await expect(page.getByText(connectCopy.th.unavailable, { exact: true })).toBeVisible();
  await expect(page.locator("#connect-url")).toHaveValue(/\/api\/mcp$/);
  await expect(page.getByRole("button", { name: connectCopy.th.newLink, exact: true })).toBeVisible();
  expect(fixture.events).toHaveLength(0); expect(fixture.pixelLoads()).toBe(0);
});
