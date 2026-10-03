import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { connectCopy } from "../../lib/connect-copy";
import { connectProviders } from "../../lib/connect";
import { createConnectToken } from "../../lib/connect-token";
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

test("polling stops in a hidden tab and after two minutes, and resumes when the visitor returns", async ({ page, context, baseURL }) => {
  await marketing(page, context, baseURL!, true);
  const id = "fedfab37-ecbb-4e66-9ab3-524986bd11ed"; let polls = 0;
  await page.clock.install();
  await page.route("**/api/connect/attempts", route => route.fulfill({ status: 201, json: { id, status: "pending", expiresAt: new Date(Date.now() + 86400000).toISOString(), connectionUrl: `${baseURL}/api/mcp?connect_token=private-test` } }));
  await page.route(`**/api/connect/attempts/${id}`, route => { polls++; return route.fulfill({ json: { id, status: "pending" } }); });
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } }));
  await page.goto("/en/connect/grok");
  await page.getByRole("button", { name: "Copy connection URL", exact: true }).click();
  await expect.poll(() => polls).toBeGreaterThan(0);
  await expect(page.locator(".mn-connect-status")).toContainText(connectCopy.en.waiting);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  const hiddenAt = polls; await page.clock.fastForward(15000); expect(polls).toBe(hiddenAt);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => polls).toBeGreaterThan(hiddenAt);
  await expect(page.locator(".mn-connect-status")).toContainText(connectCopy.en.waiting);
  await page.clock.fastForward(121000);
  await expect(page.locator(".mn-connect-status")).toContainText(connectCopy.en.paused);
  const pausedAt = polls; await page.clock.fastForward(15000); expect(polls).toBe(pausedAt);
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect.poll(() => polls).toBeGreaterThan(pausedAt);
});

test("expired links stop polling and a replacement link can verify", async ({ page, context, baseURL }) => {
  await marketing(page, context, baseURL!, true);
  const ids = ["a31e81c6-96a4-4b65-a9a5-096cf407d17b", "f5b6c97e-c9ae-4c8f-a08c-b9a91804ea81"];
  let created = 0, expiredPolls = 0;
  await page.route("**/api/connect/attempts", route => {
    const id = ids[created++];
    return route.fulfill({ status: 201, json: { id, status: "pending", expiresAt: new Date(Date.now() + 86400000).toISOString(), connectionUrl: `${baseURL}/api/mcp?connect_token=fixture-${id}` } });
  });
  await page.route(`**/api/connect/attempts/${ids[0]}`, route => { expiredPolls++; return route.fulfill({ json: { id: ids[0], status: "expired" } }); });
  await page.route(`**/api/connect/attempts/${ids[1]}`, route => route.fulfill({ json: { id: ids[1], status: "verified" } }));
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } }));
  await page.goto("/en/connect/perplexity");
  await page.getByRole("button", { name: "Copy connection URL", exact: true }).click();
  await expect(page.locator(".mn-connect-status")).toContainText(connectCopy.en.expired);
  const stoppedAt = expiredPolls;
  await page.waitForTimeout(3500);
  expect(expiredPolls).toBe(stoppedAt);
  await page.getByRole("button", { name: connectCopy.en.newLink, exact: true }).click();
  await expect(page.locator(".mn-connect-status")).toContainText(connectCopy.en.verified);
  expect(created).toBe(2);
  await expect(page.locator("#connect-url")).toHaveValue(new RegExp(ids[1]));
});

test("real HTTP: discovery does not verify; info confirms the matching browser and expired tokens preserve ordinary access", async ({ page, context, baseURL, browser }) => {
  await marketing(page, context, baseURL!, true);
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } }));
  await page.goto("/en/connect/claude");
  const created = page.waitForResponse(response => response.url().endsWith("/api/connect/attempts") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Copy connection URL", exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const attempt = await response.json();
  const statusUrl = `${baseURL}/api/connect/attempts/${attempt.id}`;
  const outsider = await browser.newContext();
  try { expect((await outsider.request.get(statusUrl)).status()).toBe(404); }
  finally { await outsider.close(); }
  async function rpc(method: string, params: object, url = attempt.connectionUrl) {
    const response = await page.request.post(url, { headers: { "content-type": "application/json", accept: "application/json" }, data: { jsonrpc: "2.0", id: 7, method, params } });
    expect(response.status()).toBe(200); return response.json();
  }
  await rpc("initialize", { protocolVersion: "2025-03-26", clientInfo: { name: "connection-http-test", version: "1" }, capabilities: {} });
  const listed = await rpc("tools/list", {});
  expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["info", "plan", "execute", "order", "support", "feedback"]);
  expect((await (await page.request.get(statusUrl)).json()).status).toBe("pending");
  const expired = createConnectToken(attempt.id, "dev", new Date(Date.now() - 1000), "isolated-browser-fixture");
  const infoParams = { name: "info", arguments: { locale: "en", view: "overview" } };
  expect((await rpc("tools/call", infoParams, `${baseURL}/api/mcp?connect_token=${expired}`)).result.isError).toBe(false);
  expect((await (await page.request.get(statusUrl)).json()).status).toBe("pending");
  expect((await rpc("tools/call", infoParams)).result.structuredContent.ok).toBe(true);
  await page.locator("#connection-test").scrollIntoViewIfNeeded();
  await expect(page.getByText(connectCopy.en.verified, { exact: true })).toBeVisible({ timeout: 15000 });
  const status = await page.request.get(statusUrl);
  expect(status.headers()["cache-control"]).toContain("no-store");
  expect((await status.json()).status).toBe("verified");
  const ordinary = await rpc("tools/call", infoParams, `${baseURL}/api/mcp`);
  expect(ordinary.result.structuredContent.ok).toBe(true);
});
