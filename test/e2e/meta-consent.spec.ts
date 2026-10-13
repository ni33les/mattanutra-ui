import { test, expect, type BrowserContext, type Page } from "@playwright/test";

async function trackingFixture(page: Page, context: BrowserContext, baseURL: string, initiallyDenied = false) {
  const events: Array<{ name: string; eventId: string; data: Record<string, unknown> }> = [];
  const preferences: Array<{ granted: boolean; source: string }> = [];
  let pixelLoads = 0, configRequests = 0, failNextConfiguration = false, preferenceFailures = 0;
  await context.clearCookies();
  if (initiallyDenied) await context.addCookies([{ name: "mn_marketing", value: "denied", url: baseURL }]);
  await page.route("**/api/**", route => ["POST", "PUT", "PATCH", "DELETE"].includes(route.request().method())
    ? route.fulfill({ json: { accepted: true } }) : route.continue());
  await page.route("**/api/marketing/consent", async route => {
    if (route.request().method() === "GET") {
      configRequests += 1;
      if (failNextConfiguration) { failNextConfiguration = false; return route.fulfill({ status: 503, json: { error: "unavailable" } }); }
      return route.fulfill({ json: { environment: "dev", enabled: true, pixelId: "123456789012345" } });
    }
    const body = route.request().postDataJSON(); preferences.push(body);
    if (preferenceFailures > 0) { preferenceFailures -= 1; return route.fulfill({ status: 503, json: { error: "unavailable" } }); }
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
  return { events, preferences, pixelLoads: () => pixelLoads, configRequests: () => configRequests,
    failConfig: () => { failNextConfiguration = true; }, failNext: (count = 1) => { preferenceFailures = count; } };
}

for (const failure of ["configuration", "preference"] as const) {
  test(`tracking recovers from a transient startup ${failure} failure without duplicate PageViews`, async ({ page, context, baseURL }) => {
    const fixture = await trackingFixture(page, context, baseURL!);
    if (failure === "configuration") fixture.failConfig(); else fixture.failNext();
    await page.goto("/en");
    await expect.poll(() => fixture.events.filter(event => event.name === "PageView").length).toBe(1);
    expect(fixture.configRequests()).toBeGreaterThanOrEqual(2);
    expect(fixture.preferences).toHaveLength(failure === "configuration" ? 1 : 2);
    await expect.poll(fixture.pixelLoads).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __pixelCalls: unknown[][] }).__pixelCalls.filter(call => call[0] === "trackSingleCustom" && call[2] === "DEV_PageView").length)).toBe(1);

    // Retrying/saving the same granted preference must not count another visit.
    await page.evaluate(async () => {
      window.dispatchEvent(new Event("mn:marketing-preference-changed"));
      window.dispatchEvent(new Event("mn:marketing-preference-changed"));
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    expect(fixture.events.filter(event => event.name === "PageView")).toHaveLength(1);
  });
}

test("startup recovery preserves an existing opt-out", async ({ page, context, baseURL }) => {
  const fixture = await trackingFixture(page, context, baseURL!, true);
  fixture.failConfig();
  await page.goto("/en");
  await expect.poll(fixture.configRequests).toBeGreaterThanOrEqual(2);
  expect(fixture.preferences).toHaveLength(0);
  expect(fixture.events).toHaveLength(0);
  expect(fixture.pixelLoads()).toBe(0);
  expect((await context.cookies()).find(cookie => cookie.name === "mn_marketing")?.value).toBe("denied");
});

test("automatic preference retries are bounded and a later explicit choice still works", async ({ page, context, baseURL }) => {
  const fixture = await trackingFixture(page, context, baseURL!);
  fixture.failNext(3);
  await page.goto("/en/privacy");
  await expect.poll(() => fixture.preferences.length).toBe(3);
  expect(fixture.events).toHaveLength(0);
  expect(fixture.pixelLoads()).toBe(0);
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(page.getByRole("button", { name: "Turn off", exact: true })).toBeVisible();
  expect(fixture.preferences).toHaveLength(4);
  expect(fixture.preferences.at(-1)).toMatchObject({ granted: true, source: "explicit" });
  await expect.poll(() => fixture.events.filter(event => event.name === "PageView").length).toBe(1);
});

test("tracking starts without a popup, covers the questionnaire and can be turned off from Privacy", async ({ page, context, baseURL }) => {
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
  expect(privatePage?.headers()["content-security-policy"]).toContain("https://connect.facebook.net");
  await expect.poll(fixture.pixelLoads).toBe(2);
  await expect.poll(() => page.evaluate(() => typeof window.fbq)).toBe("function");
  await expect.poll(() => fixture.events.filter(event => event.name === "PageView").length).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pixelCalls: unknown[][] }).__pixelCalls.some(call => call[0] === "trackSingleCustom" && call[2] === "DEV_PageView"))).toBe(true);
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

test("homepage to questionnaire client navigation retains the Pixel and sends one matching PageView per page", async ({ page, context, baseURL }) => {
  const fixture = await trackingFixture(page, context, baseURL!);
  await page.goto("/en");
  const nativePageViewIds = () => page.evaluate(() => ((window as unknown as { __pixelCalls?: unknown[][] }).__pixelCalls ?? [])
    .filter(call => call[0] === "trackSingleCustom" && call[2] === "DEV_PageView")
    .map(call => (call[4] as { eventID: string }).eventID));
  await expect.poll(() => fixture.events.filter(event => event.name === "PageView").length).toBe(1);
  await expect.poll(fixture.pixelLoads).toBe(1);
  await expect.poll(nativePageViewIds).toEqual([fixture.events.find(event => event.name === "PageView")!.eventId]);
  const documentMarker = await page.evaluate(() => {
    const marker = crypto.randomUUID();
    (window as unknown as { __navigationDocument: string }).__navigationDocument = marker;
    return marker;
  });

  await page.locator('main a[href="/en/nutrition/quiz"]').first().click();
  await expect(page).toHaveURL(url => url.pathname === "/en/nutrition/quiz");
  await expect.poll(() => fixture.events.filter(event => event.name === "PageView").length).toBe(2);
  const receipts = fixture.events.filter(event => event.name === "PageView");
  await expect.poll(nativePageViewIds).toEqual(receipts.map(event => event.eventId));
  expect(new Set(receipts.map(event => event.eventId)).size).toBe(2);
  expect(receipts.map(event => event.data.funnel_stage)).toEqual(["landing", "assessment"]);
  expect(await page.evaluate(() => (window as unknown as { __navigationDocument?: string }).__navigationDocument)).toBe(documentMarker);
  expect(fixture.pixelLoads()).toBe(1);
  expect(fixture.preferences).toHaveLength(1);
  expect(await page.evaluate(() => (window as unknown as { __pixelCalls: unknown[][] }).__pixelCalls
    .filter(call => call[0] === "init").length)).toBe(1);
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
  await expect(page.locator("#advertising-preferences").getByRole("alert")).toHaveText("Could not save your choice. Please try again.");
  await expect(page.getByRole("button", { name: "Turn on", exact: true })).toBeEnabled();
  expect(fixture.events).toHaveLength(0);
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(page.getByRole("button", { name: "Turn off", exact: true })).toBeVisible();
  await expect(page.locator("#advertising-preferences").getByRole("alert")).toHaveCount(0);
});

test("an opted-in visitor's new ad arrival is saved before PageView and an opt-out stays off", async ({ page, context, baseURL }) => {
  const fixture = await trackingFixture(page, context, baseURL!);
  await context.addCookies([{ name: "mn_marketing", value: "granted", url: baseURL! }]);
  let saved = false;
  await page.route("**/api/marketing/events", async route => {
    expect(saved).toBe(true);
    const body = route.request().postDataJSON(); fixture.events.push(body);
    await route.fulfill({ json: { accepted: true, eventId: body.eventId } });
  });
  page.on("response", response => { if (response.url().endsWith("/api/marketing/consent") && response.request().method()==="POST") saved=true; });
  await page.goto("/en?fbclid=newAd&campaign_id=111&adset_id=222&ad_id=333");
  await expect.poll(()=>fixture.events.length).toBeGreaterThan(0);
  expect(fixture.preferences).toHaveLength(1);
  expect(fixture.preferences[0]).toMatchObject({ source: "site_default", sourceUrl: expect.stringContaining("ad_id=333") });
  await expect.poll(fixture.pixelLoads).toBe(1);
  await context.addCookies([{ name: "mn_marketing", value: "denied", url: baseURL! }]);
  const configured = page.waitForResponse(response=>response.url().endsWith("/api/marketing/consent") && response.request().method()==="GET");
  await page.goto("/en?fbclid=anotherAd&campaign_id=444"); await configured;
  expect(fixture.preferences).toHaveLength(1);
});
