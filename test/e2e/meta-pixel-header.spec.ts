import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// Run against a local server with MATTANUTRA_ENV=dev, META_TRACKING_ENABLED=true,
// FACEBOOK_PIXEL_ID_DEV=123456789012345 and a nonempty fixture CAPI token.
// Meta responses and browser API calls are intercepted; no real analytics leave the browser.
const pixelId = "123456789012345";
const config = { enabled: true, environment: "dev", pixelId };
const scriptPattern = /<script\b[^>]*\bid="meta-pixel-base"[^>]*>([\s\S]*?)<\/script>/g;
type Bridge = { eventId: string; sourceUrl: string; pixelId: string; environment: string };
type ProbeWindow = Window & { __pixelCalls?: unknown[][]; __mnMetaPageView?: Bridge; __navigationDocument?: string };
type CapturedEvent = { name: string; eventId: string; sourceUrl: string; data: Record<string, unknown> };

async function interceptMeta(context: BrowserContext, baseURL: string) {
  const counts = { library: 0, images: 0 };
  const localOrigin = new URL(baseURL).origin;
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === localOrigin) return route.continue();
    if (url.href === "https://connect.facebook.net/en_US/fbevents.js") {
      counts.library += 1;
      return route.fulfill({ contentType: "application/javascript", body: `
        window.__pixelCalls = Array.from(window.fbq.queue, call => Array.from(call));
        window.fbq.callMethod = (...args) => window.__pixelCalls.push(args);
      ` });
    }
    if (url.origin === "https://www.facebook.com" && url.pathname === "/tr") {
      counts.images += 1;
      return route.fulfill({ status: 204 });
    }
    return route.abort();
  });
  return counts;
}

async function failApis(page: Page) {
  const counts = { all: 0, consent: 0 };
  await page.route("**/api/**", route => {
    counts.all += 1;
    if (new URL(route.request().url()).pathname === "/api/marketing/consent") counts.consent += 1;
    return route.fulfill({ status: 503, json: { error: "Fixture API outage" } });
  });
  return counts;
}

async function nativePageViews(page: Page) {
  return page.evaluate(() => ((window as ProbeWindow).__pixelCalls ?? []).flatMap(call => {
    if (call[0] === "trackCustom" && call[1] === "DEV_PageView") return [{
      command: call[0], eventId: (call[3] as { eventID: string }).eventID
    }];
    if (call[0] === "trackSingleCustom" && call[2] === "DEV_PageView") return [{
      command: call[0], eventId: (call[4] as { eventID: string }).eventID
    }];
    return [];
  }));
}

function assertRawHead(html: string) {
  const scripts = [...html.matchAll(scriptPattern)];
  expect(scripts).toHaveLength(1);
  const script = scripts[0];
  expect(script.index).toBeGreaterThan(html.indexOf("<head>"));
  expect(script.index! + script[0].length).toBeLessThanOrEqual(html.indexOf("</head>"));
  expect(script.index).toBeLessThan(html.indexOf("<body"));
  expect(script[1]).toContain("https://connect.facebook.net/en_US/fbevents.js");
  expect(script[1]).toContain(pixelId);
  expect(script[1]).toContain("DEV_PageView");
  expect(script[0].slice(0, script[0].indexOf(">") + 1)).not.toMatch(/\bsrc=/);
}

async function expectPreservedHead(page: Page, html: string) {
  const original = await page.evaluate(source => {
    const document = new DOMParser().parseFromString(source, "text/html");
    return {
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content"),
      stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]'), link => link.getAttribute("href")!)
    };
  }, html);
  expect(original.title).not.toBe("");
  expect(original.stylesheets.length).toBeGreaterThan(0);
  await expect(page).toHaveTitle(original.title);
  await expect(page.locator('head meta[name="description"]')).toHaveAttribute("content", original.description!);
  const loadedStylesheets = await page.evaluate(() => Array.from(document.styleSheets, sheet => {
    if (!sheet.href) return "";
    const url = new URL(sheet.href);
    return `${url.pathname}${url.search}`;
  }));
  expect(loadedStylesheets).toEqual(expect.arrayContaining(original.stylesheets));
}

test("the raw HTML puts the executable Pixel in head for all locales and the root redirect", async ({ request }) => {
  for (const locale of ["en", "th", "zh-CN"]) {
    const response = await request.get(`/${locale}`);
    expect(response.ok(), `${locale}: ${response.status()}`).toBe(true);
    assertRawHead(await response.text());
  }
  const root = await request.get("/", { headers: { cookie: "NEXT_LOCALE=en" } });
  expect(new URL(root.url()).pathname).toBe("/en");
  assertRawHead(await root.text());
});

test("the head Pixel works with every Next chunk and application API blocked", async ({ page, context, baseURL }) => {
  const counts = await interceptMeta(context, baseURL!);
  await failApis(page);
  let blockedChunks = 0;
  await page.route("**/_next/**", route => { blockedChunks += 1; return route.abort(); });
  await page.goto("/en?campaign_id=123&fbclid=opaque-setup-click#arrival", { referer: "https://business.facebook.com/" });
  await expect.poll(() => counts.library).toBe(1);
  await expect.poll(() => nativePageViews(page)).toHaveLength(1);
  const bridge = await page.evaluate(() => (window as ProbeWindow).__mnMetaPageView);
  expect(bridge).toMatchObject({ sourceUrl: page.url(), environment: "dev", pixelId });
  expect(bridge?.eventId).toMatch(/^[0-9a-f-]{36}$/);
  expect(await nativePageViews(page)).toEqual([{ command: "trackCustom", eventId: bridge!.eventId }]);
  expect(await page.locator("head #meta-pixel-base").count()).toBe(1);
  expect(await page.evaluate(() => (window as ProbeWindow).__pixelCalls?.filter(call => call[0] === "init"))).toEqual([["init", pixelId]]);
  expect(blockedChunks).toBeGreaterThan(0);
  expect(counts.images).toBe(0);
});

test("application API outages do not suppress or repeat the initial browser PageView", async ({ page, context, baseURL }) => {
  const counts = await interceptMeta(context, baseURL!);
  const api = await failApis(page);
  await page.goto("/en");
  await expect.poll(() => nativePageViews(page)).toHaveLength(1);
  await expect.poll(() => api.consent).toBe(3);
  expect(await nativePageViews(page)).toHaveLength(1);
  expect(counts.library).toBe(1);
});

test("an existing opt-out omits both the script and image before hydration", async ({ page, context, baseURL }) => {
  const counts = await interceptMeta(context, baseURL!);
  await failApis(page);
  await context.addCookies([{ name: "mn_marketing", value: "denied", url: baseURL! }]);
  await page.route("**/_next/**", route => route.abort());
  const response = await page.goto("/zh-CN/nutrition/quiz");
  expect(response?.ok()).toBe(true);
  const html = await response!.text();
  expect([...html.matchAll(scriptPattern)]).toHaveLength(0);
  expect(html).not.toContain("facebook.com/tr?");
  await expect(page.locator("#meta-pixel-base")).toHaveCount(0);
  await expect(page.locator('noscript img[src*="facebook.com"]')).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.fbq)).toBe("undefined");
  expect(counts).toEqual({ library: 0, images: 0 });
});

test("an opted-out public page preserves styles and metadata after hydration", async ({ page, context, baseURL }) => {
  const counts = await interceptMeta(context, baseURL!);
  const api = await failApis(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.addCookies([{ name: "mn_marketing", value: "denied", url: baseURL! }]);
  const response = await page.goto("/en");
  expect(response?.ok()).toBe(true);
  // Consent requests originate in a React effect, proving hydration has run.
  // Wait for its bounded retries too, so the assertion covers later rerenders.
  await expect.poll(() => api.consent).toBe(3);
  await expectPreservedHead(page, await response!.text());
  await expect(page.locator("main")).toHaveCSS("display", "flex");
  await expect(page.locator("main")).toHaveCSS("flex-direction", "column");
  await expect(page.locator("#meta-pixel-base")).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.fbq)).toBe("undefined");
  expect(counts).toEqual({ library: 0, images: 0 });
  expect(errors).toEqual([]);
});

test("the noscript fallback is in body and works when JavaScript is disabled", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const counts = await interceptMeta(context, baseURL!);
    const page = await context.newPage();
    await failApis(page);
    const response = await page.goto("/th");
    const html = await response!.text();
    assertRawHead(html);
    expect(html.indexOf("<noscript>")).toBeGreaterThan(html.indexOf("<body"));
    await expect(page.locator("head noscript")).toHaveCount(0);
    const image = page.locator("body noscript img");
    await expect(image).toHaveCount(1);
    const url = new URL((await image.getAttribute("src"))!);
    expect(url.origin).toBe("https://www.facebook.com");
    expect(Object.fromEntries(url.searchParams)).toEqual({ id: pixelId, ev: "DEV_PageView", noscript: "1" });
    await expect.poll(() => counts.images).toBe(1);
    expect(counts.library).toBe(0);

    await context.addCookies([{ name: "mn_marketing", value: "denied", url: baseURL! }]);
    await page.reload();
    await expect(page.locator("body noscript img")).toHaveCount(0);
    expect(counts.images).toBe(1);
  } finally { await context.close(); }
});

for (const locale of ["en", "th", "zh-CN"]) {
  test(`${locale} admin preserves styles and metadata after hydration without loading Pixel`, async ({ page, context, baseURL }) => {
    const counts = await interceptMeta(context, baseURL!);
    await failApis(page);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    const response = await page.goto(`/${locale}/admin/login`);
    expect(response?.ok()).toBe(true);
    const html = await response!.text();
    expect([...html.matchAll(scriptPattern)]).toHaveLength(0);
    expect(html).not.toContain("facebook.com/tr?");

    // A handled form submission and rendered fixture error prove this is the
    // hydrated client UI. The intercepted error prevents a passkey prompt.
    await page.locator('input[type="email"]').fill("admin-css-fixture@example.test");
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText("Fixture API outage", { exact: true })).toBeVisible();
    await expectPreservedHead(page, html);
    await expect(page.locator("main")).toHaveCSS("display", "flex");
    await expect(page.locator("main")).toHaveCSS("background-color", "rgb(248, 250, 252)");
    await expect(page.locator("main section")).toHaveCSS("display", "grid");
    await expect(page.locator("main section")).toHaveCSS("border-radius", "16px");
    await expect(page.locator("#meta-pixel-base")).toHaveCount(0);
    expect(await page.evaluate(() => typeof window.fbq)).toBe("undefined");
    expect(counts).toEqual({ library: 0, images: 0 });
    expect(errors).toEqual([]);
  });
}

test("hydration shares the initial event ID with CAPI and each SPA visit gets exactly one new PageView", async ({ page, context, baseURL }) => {
  const counts = await interceptMeta(context, baseURL!);
  const events: CapturedEvent[] = [];
  await failApis(page);
  await page.route("**/api/marketing/consent", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: config });
    await context.addCookies([{ name: "mn_marketing", value: "granted", url: baseURL! }]);
    return route.fulfill({ json: { ...config, granted: true } });
  });
  await page.route("**/api/marketing/events", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ...config, events: [] } });
    const event = route.request().postDataJSON() as CapturedEvent;
    events.push(event);
    return route.fulfill({ json: { accepted: true, eventId: event.eventId } });
  });
  await page.goto("/en");
  const pageViews = () => events.filter(event => event.name === "PageView");
  await expect.poll(() => pageViews().length).toBe(1);
  const bridge = await page.evaluate(() => (window as ProbeWindow).__mnMetaPageView);
  expect(pageViews()[0]).toMatchObject({ eventId: bridge!.eventId, sourceUrl: page.url() });
  await expect.poll(() => nativePageViews(page)).toEqual([{ command: "trackCustom", eventId: bridge!.eventId }]);
  const documentMarker = await page.evaluate(() => (window as ProbeWindow).__navigationDocument = crypto.randomUUID());

  await page.locator('main a[href="/en/nutrition/quiz"]').first().click();
  await expect(page).toHaveURL(url => url.pathname === "/en/nutrition/quiz");
  await expect.poll(() => pageViews().length).toBe(2);
  await expect.poll(() => nativePageViews(page)).toEqual([
    { command: "trackCustom", eventId: pageViews()[0].eventId },
    { command: "trackSingleCustom", eventId: pageViews()[1].eventId }
  ]);
  expect(pageViews().map(event => event.data.funnel_stage)).toEqual(["landing", "assessment"]);
  expect(await page.evaluate(() => (window as ProbeWindow).__navigationDocument)).toBe(documentMarker);

  await page.goBack();
  await expect(page).toHaveURL(url => url.pathname === "/en");
  await expect.poll(() => pageViews().length).toBe(3);
  await expect.poll(() => nativePageViews(page)).toEqual([
    { command: "trackCustom", eventId: pageViews()[0].eventId },
    { command: "trackSingleCustom", eventId: pageViews()[1].eventId },
    { command: "trackSingleCustom", eventId: pageViews()[2].eventId }
  ]);
  expect(new Set(pageViews().map(event => event.eventId)).size).toBe(3);
  expect(await page.evaluate(() => (window as ProbeWindow).__navigationDocument)).toBe(documentMarker);
  expect(counts.library).toBe(1);
  expect(await page.evaluate(() => (window as ProbeWindow).__pixelCalls?.filter(call => call[0] === "init"))).toEqual([["init", pixelId]]);
});
