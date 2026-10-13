import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { publicLocales } from "../../lib/i18n";

const pixelId = "27629903823308584";
const setupToolUrl = `https://www.facebook.com/signals/iwl.js?pixel_id=${pixelId}&access_token=fake-test-token`;
// Actual primary/fallback destinations configured by this pixel's bootstrap.
const gatewayUrls = [
  "https://mpc-prod-27-s6uit34pua-uk.a.run.app/csp-test",
  "https://5z-2b6b7616f94640c2840d1841e1ac24c3.ecs.us-east-1.on.aws/csp-test"
];

type ProbeWindow = Window & {
  __metaSetupLoaded?: boolean;
  __metaGatewayResults?: boolean[];
  __metaCspViolations?: Array<{ directive: string; blockedURI: string }>;
};

async function setupFixture(page: Page, context: BrowserContext, baseURL: string) {
  const requests = { library: 0, setup: 0, events: 0, gateways: [] as string[] };
  await page.addInitScript(() => {
    const state = window as ProbeWindow;
    state.__metaCspViolations = [];
    document.addEventListener("securitypolicyviolation", event => {
      state.__metaCspViolations!.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    });
  });
  // These browser probes must never write analytics or customer data.
  await page.route("**/api/**", route => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(route.request().method())) {
      return route.fulfill({ json: { accepted: true } });
    }
    return route.continue();
  });
  await page.route("**/api/marketing/consent", async route => {
    const config = { enabled: true, environment: "dev", pixelId };
    if (route.request().method() === "GET") return route.fulfill({ json: config });
    await context.addCookies([{ name: "mn_marketing", value: "granted", url: baseURL }]);
    return route.fulfill({ json: { ...config, granted: true } });
  });
  await page.route("**/api/marketing/events", route => {
    requests.events += 1;
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { accepted: true, eventId: body.eventId } });
  });
  await page.route("https://www.facebook.com/**", route => route.abort());
  await page.route(setupToolUrl, route => {
    requests.setup += 1;
    return route.fulfill({
      contentType: "application/javascript",
      body: `window.__metaSetupLoaded = true;
        Promise.all(${JSON.stringify(gatewayUrls)}.map(url => fetch(url, { mode: "no-cors" })
          .then(() => true, () => false))).then(results => { window.__metaGatewayResults = results; });`
    });
  });
  for (const gatewayUrl of gatewayUrls) {
    await page.route(`${new URL(gatewayUrl).origin}/**`, route => {
      requests.gateways.push(route.request().url());
      return route.fulfill({ status: 204 });
    });
  }
  await page.route("https://connect.facebook.net/**", route => {
    if (new URL(route.request().url()).pathname !== "/en_US/fbevents.js") return route.abort();
    requests.library += 1;
    return route.fulfill({
      contentType: "application/javascript",
      // Mimic fbevents.js loading the Event Setup Tool, without Meta's real code.
      body: `window.fbq.callMethod = function () {};
        const script = document.createElement("script");
        script.src = ${JSON.stringify(setupToolUrl)};
        document.head.appendChild(script);`
    });
  });
  return requests;
}

for (const locale of publicLocales) {
  for (const route of [
    { label: "homepage after the root redirect", path: "/", destination: `/${locale}` },
    { label: "questionnaire", path: `/${locale}/nutrition/quiz`, destination: `/${locale}/nutrition/quiz` },
    { label: "connection page", path: `/${locale}/connect`, destination: `/${locale}/connect` }
  ]) {
    test(`Meta setup tool and both gateways load on the ${locale} ${route.label}`, async ({ page, context, baseURL }) => {
      const requests = await setupFixture(page, context, baseURL!);
      await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
      await page.goto(route.path, { referer: "https://business.facebook.com/" });
      await expect(page).toHaveURL(url => url.origin === new URL(baseURL!).origin && url.pathname === route.destination);

      // Successful script execution and fetches exercise the browser's real CSP.
      await expect.poll(() => page.evaluate(() => (window as ProbeWindow).__metaSetupLoaded)).toBe(true);
      await expect.poll(() => page.evaluate(() => (window as ProbeWindow).__metaGatewayResults)).toEqual([true, true]);
      expect(requests.library).toBe(1);
      expect(requests.setup).toBe(1);
      expect(requests.gateways.sort()).toEqual([...gatewayUrls].sort());
      expect(await page.evaluate(() => (window as ProbeWindow).__metaCspViolations)).toEqual([]);
    });
  }

  test(`Meta setup tool and gateways remain blocked on ${locale} admin pages`, async ({ page, context, baseURL }) => {
    const requests = await setupFixture(page, context, baseURL!);
    await page.goto(`/${locale}/admin/login`);
    const loaded = await page.evaluate(url => new Promise<boolean>(resolve => {
      const script = document.createElement("script");
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      script.src = url;
      document.head.appendChild(script);
    }), setupToolUrl);
    expect(loaded).toBe(false);
    expect(await page.evaluate(urls => Promise.all(urls.map(url => fetch(url, { mode: "no-cors" })
      .then(() => true, () => false))), gatewayUrls)).toEqual([false, false]);
    await expect.poll(() => page.evaluate(() => (window as ProbeWindow).__metaCspViolations?.some(event =>
      event.directive.startsWith("script-src") && event.blockedURI.startsWith("https://www.facebook.com")))).toBe(true);
    expect(requests).toEqual({ library: 0, setup: 0, events: 0, gateways: [] });
    expect(await page.evaluate(() => (window as ProbeWindow).__metaSetupLoaded)).toBeUndefined();
  });
}

test("an advertising opt-out keeps the setup tool and gateways off on a Chinese questionnaire", async ({ page, context, baseURL }) => {
  const requests = await setupFixture(page, context, baseURL!);
  await context.addCookies([{ name: "mn_marketing", value: "denied", url: baseURL! }]);
  const configured = page.waitForResponse(response => response.url().endsWith("/api/marketing/consent")
    && response.request().method() === "GET");
  await page.goto("/zh-CN/nutrition/quiz");
  await configured;
  await page.waitForLoadState("networkidle");
  expect(requests).toEqual({ library: 0, setup: 0, events: 0, gateways: [] });
  expect((await context.cookies()).find(cookie => cookie.name === "mn_marketing")?.value).toBe("denied");
  expect(await page.evaluate(() => (window as ProbeWindow).__metaSetupLoaded)).toBeUndefined();
});
