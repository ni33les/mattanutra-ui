import { test, expect } from "@playwright/test";

test("marketing consent gates browser measurement and sensitive pages use only the allowlisted endpoint", async ({ page, context, baseURL }) => {
  const events: Array<{ name: string; eventId: string; data: Record<string, unknown> }> = [];
  let pixelLoads = 0;
  await context.clearCookies();
  await page.route("**/api/marketing/consent", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { environment: "dev", enabled: true, pixelId: "123456789012345" } });
    const body = route.request().postDataJSON();
    await context.addCookies([{ name: "mn_marketing", value: body.granted ? "granted" : "denied", url: baseURL! }]);
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
  await page.goto("/en");
  await expect(page.getByRole("button", { name: "Allow", exact: true })).toBeVisible();
  expect(events).toHaveLength(0); expect(pixelLoads).toBe(0);
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await expect.poll(() => events.some(e => e.name === "PageView")).toBe(true);
  await expect.poll(() => pixelLoads).toBe(1);
  expect(events.every(e => e.data.mn_env === "dev")).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pixelCalls: unknown[][] }).__pixelCalls.some(call => call[0] === "trackSingleCustom" && call[2] === "DEV_PageView"))).toBe(true);
  const beforeConfirm = events.length;
  await page.getByRole("button", { name: "Privacy choices", exact: true }).click();
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(page.getByRole("button", { name: "Privacy choices", exact: true })).toBeVisible();
  expect(events).toHaveLength(beforeConfirm);
  const before = pixelLoads;
  await page.goto("/en/nutrition/quiz");
  await expect(page.getByRole("button", { name: "Privacy choices", exact: true })).toBeVisible();
  expect(pixelLoads).toBe(before);
  expect(await page.evaluate(() => typeof window.fbq)).toBe("undefined");
  await page.getByRole("button", { name: "Privacy choices", exact: true }).click();
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  const after = events.length;
  await page.goto("/en");
  await expect(page.getByRole("button", { name: "Privacy choices", exact: true })).toBeVisible();
  expect(events).toHaveLength(after); expect(pixelLoads).toBe(before);
});
