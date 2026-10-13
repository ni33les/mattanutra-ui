import { test, expect } from "@playwright/test";

const pixelId = "27629903823308584";

for (const scenario of [
  { name: "Meta Business setup", path: "/en", referrer: "https://business.facebook.com/" },
  { name: "Ads Manager with campaign tags", path: "/en?fbclid=opaque-click&campaign_id=111&adset_id=222&ad_id=333", referrer: "https://adsmanager.facebook.com/" },
  { name: "mobile Facebook ad", path: "/th?campaign_id=111&ad_id=333", referrer: "https://m.facebook.com/" }
]) {
  test(`native Pixel is detected from ${scenario.name}`, async ({ page, context, baseURL }) => {
    const receipts: string[] = [];
    let pixelLoads = 0;
    await page.route("**/api/marketing/consent", async route => {
      const config = { enabled: true, environment: "dev", pixelId };
      if (route.request().method() === "GET") return route.fulfill({ json: config });
      await context.addCookies([{ name: "mn_marketing", value: "granted", url: baseURL! }]);
      return route.fulfill({ json: { ...config, granted: true } });
    });
    await page.route("**/api/marketing/events", route => {
      const body = route.request().postDataJSON();
      receipts.push(body.eventId);
      return route.fulfill({ json: { accepted: true, eventId: body.eventId } });
    });
    await page.route("https://connect.facebook.net/**", route => {
      pixelLoads++;
      return route.fulfill({ contentType: "application/javascript", body: "window.__pixelCalls=window.fbq.queue.slice();window.fbq.callMethod=(...args)=>window.__pixelCalls.push(args);" });
    });

    await page.goto(scenario.path, { referer: scenario.referrer });
    await expect.poll(() => pixelLoads).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __pixelCalls?: unknown[][] }).__pixelCalls ?? []))
      .toContainEqual(["init", pixelId]);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __pixelCalls?: unknown[][] }).__pixelCalls?.filter(call => call[0] === "trackSingleCustom") ?? []))
      .toEqual([["trackSingleCustom", pixelId, "DEV_PageView", expect.objectContaining({ mn_env: "dev" }), { eventID: expect.any(String) }]]);
    const eventId = await page.evaluate(() => ((window as unknown as { __pixelCalls: unknown[][] }).__pixelCalls.find(call => call[0] === "trackSingleCustom")?.[4] as { eventID: string }).eventID);
    expect(receipts).toEqual([eventId]);
  });
}
