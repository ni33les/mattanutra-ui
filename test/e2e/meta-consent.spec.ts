import { test, expect, type BrowserContext, type Page } from "@playwright/test";

async function trackingFixture(page: Page, context: BrowserContext, baseURL: string, initiallyDenied = false) {
  const events: Array<{ name: string; eventId: string; data: Record<string, unknown> }> = [];
  const preferences: Array<{ granted: boolean; source: string }> = [];
  let pixelLoads = 0, failNextPreference = false;
  await context.clearCookies();
  if (initiallyDenied) await context.addCookies([{ name: "mn_marketing", value: "denied", url: baseURL }]);
  await page.route("**/api/marketing/consent", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { environment: "dev", enabled: true, pixelId: "123456789012345" } });
    const body = route.request().postDataJSON(); preferences.push(body);
    if (failNextPreference) { failNextPreference = false; return route.fulfill({ status: 503, json: { error: "unavailable" } }); }
    await context.addCookies([{ name: "mn_marketing", value: body.granted ? "granted" : "denied", url: baseURL }]);
    await route.fulfill({ json: { granted: body.granted } });
  });
  await page.route("**/api/marketing/events", async route => {
    const body = route.request().postDataJSON(); events.push(body);
    await route.fulfill({ json: { accepted: true, eventId: body.eventId } });
  });
  await page.route("https://connect.facebook.net/**", async route => {
    pixelLoads += 1;
    await route.fulfill({ contentType: "application/javascript", body: "window.__pixelCalls=window.fbq.queue.slice();window.fbq.callMethod=(...args)=>window.__pixelCalls.push(args);" });
  });
  return { events, preferences, pixelLoads: () => pixelLoads, failNext: () => { failNextPreference = true; } };
}

test("tracking starts without a popup, retains page boundaries and can be turned off from Privacy", async ({ page, context, baseURL }) => {
  const fixture = await trackingFixture(page, context, baseURL!);
  const landing = await page.goto("/en");
  expect(landing?.headers()["content-security-policy"]).toContain("https://connect.facebook.net");
  await expect.poll(() => fixture.events.filter(e => e.name === "PageView").length).toBe(1);
  expect(fixture.preferences).toEqual([expect.objectContaining({ granted: true, source: "site_default" })]);
  await expect(page.getByRole("button", { name: "Allow", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Decline", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Privacy choices", exact: true })).toHaveCount(0);
  await expect.poll(fixture.pixelLoads).toBe(1);
  expect(fixture.events.every(e => e.data.mn_env === "dev")).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pixelCalls: unknown[][] }).__pixelCalls.some(call => call[0] === "trackSingleCustom" && call[2] === "DEV_PageView"))).toBe(true);
  const privatePage = await page.goto("/en/nutrition/quiz");
  expect(privatePage?.headers()["content-security-policy"]).not.toContain("facebook");
  expect(await page.evaluate(() => typeof window.fbq)).toBe("undefined");
  expect(fixture.pixelLoads()).toBe(1);
  expect(fixture.preferences).toHaveLength(1);
  await page.goto("/en/privacy");
  await page.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(page.getByRole("button", { name: "Turn on", exact: true })).toBeVisible();
  expect(fixture.preferences.at(-1)).toMatchObject({ granted: false, source: "explicit" });
  const eventCount = fixture.events.length, loadCount = fixture.pixelLoads();
  const configured = page.waitForResponse(r => r.url().endsWith("/api/marketing/consent") && r.request().method() === "GET");
  await page.goto("/en"); await configured;
  expect(fixture.events).toHaveLength(eventCount); expect(fixture.pixelLoads()).toBe(loadCount);
  expect((await context.cookies()).find(c => c.name === "mn_marketing")?.value).toBe("denied");
});

test("an existing opt-out stays off and a deliberate privacy-page choice can enable tracking", async ({ page, context, baseURL }) => {
  const fixture = await trackingFixture(page, context, baseURL!, true);
  const configured = page.waitForResponse(r => r.url().endsWith("/api/marketing/consent") && r.request().method() === "GET");
  await page.goto("/en"); await configured;
  expect(fixture.events).toHaveLength(0); expect(fixture.preferences).toHaveLength(0); expect(fixture.pixelLoads()).toBe(0);
  await page.goto("/en/privacy");
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(page.getByRole("button", { name: "Turn off", exact: true })).toBeVisible();
  expect(fixture.preferences).toEqual([expect.objectContaining({ granted: true, source: "explicit" })]);
  await expect.poll(() => fixture.events.some(e => e.name === "PageView")).toBe(true);
});

test("a failed preference save is visible, restores the button and supports retry", async ({ page, context, baseURL }) => {
  const fixture = await trackingFixture(page, context, baseURL!, true);
  await page.goto("/en/privacy");
  fixture.failNext();
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Could not save your choice. Please try again.");
  await expect(page.getByRole("button", { name: "Turn on", exact: true })).toBeEnabled();
  expect(fixture.events).toHaveLength(0);
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(page.getByRole("button", { name: "Turn off", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
