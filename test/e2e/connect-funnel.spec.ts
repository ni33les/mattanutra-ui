import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { connectCopy } from "../../lib/connect-copy";
import { connectProviders } from "../../lib/connect";
const locales = ["en", "th", "zh-CN"] as const;

async function marketing(page: Page, context: BrowserContext, baseURL: string, optedOut = false) {
  const events: Record<string, unknown>[] = [];
  let pixelLoads = 0, attempts = 0;
  await context.addCookies([{ name: "mn_marketing", value: optedOut ? "denied" : "granted", url: baseURL }]);
  await page.route("**/api/marketing/consent", route => route.fulfill({ json: { environment: "dev", enabled: true, pixelId: "123456789012345" } }));
  await page.route("**/api/marketing/events", route => { events.push(route.request().postDataJSON()); return route.fulfill({ json: { accepted: true, eventId: route.request().postDataJSON().eventId } }); });
  await page.route("**/api/connect/events", route => route.fulfill({ json: { accepted: true } }));
  await page.route("**/api/connect/attempts**", route => { attempts++; return route.abort(); });
  await page.route("https://connect.facebook.net/**", route => { pixelLoads++; return route.fulfill({ body: "" }); });
  return { events, pixelLoads: () => pixelLoads, attempts: () => attempts };
}

test("15 concise localized pages show a plain URL and setup instructions without monitoring", async ({ page, context, baseURL }) => {
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
      await expect(page.locator("#connect-url")).toHaveValue(/^https:\/\/dev\.mattanutra\.com\/api\/mcp$/);
      await expect(page.getByRole("button", { name: connectCopy[locale].copyUrl, exact: true })).toBeVisible();
      await expect(page.getByText(connectCopy[locale].privacy, { exact: true })).toBeVisible();
      await expect(page.locator(".mn-connect-status, #connection-test, .mn-connect-faq, input:not([readonly]), textarea")).toHaveCount(0);
      if (locale === "en") expect((await page.locator("main").innerText()).trim().split(/\s+/).length).toBeLessThan(180);
      if (provider) await expect(page.locator(".mn-connect-instructions ol li")).toHaveCount(3);
      else await expect(page.locator(".mn-connect-provider")).toHaveCount(4);
      if (provider === "chatgpt") await expect(page.locator(".mn-connect-instructions")).toContainText("Developer mode");
    }
  }
  expect(fixture.pixelLoads()).toBe(0); expect(fixture.attempts()).toBe(0);
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
  await page.getByRole("link", { name: connectCopy.en.back, exact: true }).click();
  await expect(page.locator('.mn-connect-provider[href*="claude"]')).toHaveAttribute("href", "/en/connect/claude?campaign_id=123&ad_id=456&fbclid=opaqueClick");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
});

test("copy works directly without creating or polling attempts, even with an old saved link", async ({ page, context, baseURL }) => {
  const fixture = await marketing(page, context, baseURL!);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => sessionStorage.setItem("mn:connect:attempt:claude", JSON.stringify({ id: "a5252813-4567-4d12-aeff-3e94f852225f", status: "pending", expiresAt: "2099-01-01", connectionUrl: "https://dev.mattanutra.com/api/mcp?connect_token=old-private" })));
  await page.goto("/en/connect");
  await page.getByRole("button", { name: connectCopy.en.copyUrl, exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://dev.mattanutra.com/api/mcp");
  await expect.poll(() => fixture.events.filter(e => e.name === "McpUrlCopied").length).toBe(1);
  await page.locator('.mn-connect-provider[href*="claude"]').click();
  await page.getByRole("button", { name: connectCopy.en.copyUrl, exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://dev.mattanutra.com/api/mcp");
  await expect.poll(() => fixture.events.filter(e => e.name === "McpUrlCopied").length).toBe(2);
  await page.clock.install(); await page.clock.fastForward(125000);
  expect(fixture.attempts()).toBe(0);
  expect(fixture.events.some(e => ["McpPromptCopied", "McpConnectionVerified"].includes(String(e.name)))).toBe(false);
});

test("clipboard failure offers manual copying and preserves advertising opt-out", async ({ page, context, baseURL }) => {
  const fixture = await marketing(page, context, baseURL!, true);
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } }));
  await page.goto("/th/connect/perplexity");
  await page.getByRole("button", { name: connectCopy.th.copyUrl, exact: true }).click();
  await expect(page.getByText(connectCopy.th.copyFailed, { exact: true })).toBeVisible();
  await expect(page.locator("#connect-url")).toBeFocused();
  expect(await page.locator("#connect-url").evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!)).toBe("https://dev.mattanutra.com/api/mcp".length);
  expect(fixture.events).toHaveLength(0); expect(fixture.pixelLoads()).toBe(0); expect(fixture.attempts()).toBe(0);
});
