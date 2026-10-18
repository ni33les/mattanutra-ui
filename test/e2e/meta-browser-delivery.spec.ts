import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// Same local runtime fixture as meta-pixel-header.spec.ts; all Meta traffic and
// browser API requests are intercepted. Receipts represent authoritative CAPI events.
const pixelId = "123456789012345";
const config = { enabled: true, environment: "dev", pixelId };
const authoritativeNames = ["Lead", "EmailCapture", "OrderSubmitted", "McpConnectionVerified", "Purchase"] as const;
type Receipt = {
  eventId: string;
  name: typeof authoritativeNames[number];
  occurredAt: string;
  data: Record<string, unknown>;
};
type NativeEvent = { command: unknown; pixelId: unknown; name: unknown; data: Record<string, unknown>; eventId: string };
type ProbeWindow = Window & { __pixelCalls?: unknown[][] };

function receipt(name: Receipt["name"], data: Record<string, unknown> = {}): Receipt {
  return { eventId: randomUUID(), name, occurredAt: new Date().toISOString(), data: {
    mn_env: "dev", event_schema: "1", locale: "en", channel: "web", funnel_stage: "results", ...data
  } };
}

async function deliveryFixture(page: Page, context: BrowserContext, baseURL: string, initialReceipts: Receipt[], denied = false) {
  let receipts = initialReceipts;
  const counts = { receiptReads: 0, libraryLoads: 0, configReads: 0 };
  await context.clearCookies();
  if (denied) await context.addCookies([{ name: "mn_marketing", value: "denied", url: baseURL }]);
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    if (url.href === "https://connect.facebook.net/en_US/fbevents.js") {
      counts.libraryLoads += 1;
      return route.fulfill({ contentType: "application/javascript", body: `
        window.__pixelCalls = Array.from(window.fbq.queue, call => Array.from(call));
        window.fbq.callMethod = (...args) => window.__pixelCalls.push(args);
      ` });
    }
    return route.abort();
  });
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: { error: "Unrelated fixture API unavailable" } }));
  await page.route("**/api/marketing/consent", async route => {
    if (route.request().method() === "GET") {
      counts.configReads += 1;
      return route.fulfill({ json: config });
    }
    const granted = route.request().postDataJSON().granted === true;
    await context.addCookies([{ name: "mn_marketing", value: granted ? "granted" : "denied", url: baseURL }]);
    return route.fulfill({ json: { ...config, granted } });
  });
  await page.route("**/api/marketing/events*", route => {
    if (route.request().method() === "GET") {
      counts.receiptReads += 1;
      return route.fulfill({ json: { ...config, events: receipts } });
    }
    const event = route.request().postDataJSON();
    return route.fulfill({ json: { accepted: true, eventId: event.eventId } });
  });
  return { counts, setReceipts: (events: Receipt[]) => { receipts = events; } };
}

async function nativeAuthoritativeEvents(page: Page): Promise<NativeEvent[]> {
  return page.evaluate(names => ((window as ProbeWindow).__pixelCalls ?? [])
    .filter(call => ["trackSingle", "trackSingleCustom"].includes(String(call[0])) && names.includes(String(call[2])))
    .map(call => ({ command: call[0], pixelId: call[1], name: call[2], data: call[3] as Record<string, unknown>,
      eventId: (call[4] as { eventID: string }).eventID })), authoritativeNames.map(name => `DEV_${name}`));
}

async function resumeVisibleDelivery(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

test("confirmed funnel milestones and both purchase types preserve their CAPI IDs and amounts", async ({ page, context, baseURL }) => {
  const planId = randomUUID();
  const receipts = [
    receipt("Lead", { plan_id: planId }),
    receipt("EmailCapture", { plan_id: planId }),
    receipt("OrderSubmitted", { plan_id: planId, funnel_stage: "checkout", purchase_type: "products", value: 849.5, currency: "THB" }),
    receipt("McpConnectionVerified", { channel: "mcp", funnel_stage: "connect_verified", provider: "claude" }),
    receipt("Purchase", { plan_id: planId, funnel_stage: "confirmation", purchase_type: "plan", value: 2490, currency: "THB" }),
    receipt("Purchase", { funnel_stage: "confirmation", purchase_type: "products", value: 849.5, currency: "THB" })
  ];
  const fixture = await deliveryFixture(page, context, baseURL!, receipts);
  await page.goto("/en");
  await expect.poll(() => nativeAuthoritativeEvents(page)).toHaveLength(receipts.length);
  const calls = await nativeAuthoritativeEvents(page);
  for (const source of receipts) {
    expect(calls.find(call => call.eventId === source.eventId)).toEqual({
      command: "trackSingleCustom", pixelId, name: `DEV_${source.name}`, eventId: source.eventId, data: source.data
    });
  }
  expect(calls.filter(call => call.name === "DEV_Purchase").map(call => call.data.purchase_type).sort()).toEqual(["plan", "products"]);
  expect(fixture.counts.libraryLoads).toBe(1);
});

test("repeated receipt polls and reloading the document do not resend confirmed events", async ({ page, context, baseURL }) => {
  const receipts = [receipt("Lead"), receipt("Purchase", { purchase_type: "plan", value: 2990, currency: "THB", funnel_stage: "confirmation" })];
  const fixture = await deliveryFixture(page, context, baseURL!, receipts);
  await page.goto("/en");
  await expect.poll(() => nativeAuthoritativeEvents(page)).toHaveLength(2);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = fixture.counts.receiptReads;
    await resumeVisibleDelivery(page);
    await expect.poll(() => fixture.counts.receiptReads).toBeGreaterThan(before);
    expect(await nativeAuthoritativeEvents(page)).toHaveLength(2);
  }

  const readsBeforeReload = fixture.counts.receiptReads;
  await page.reload();
  await expect.poll(() => fixture.counts.libraryLoads).toBe(2);
  await expect.poll(() => fixture.counts.receiptReads).toBeGreaterThan(readsBeforeReload);
  expect(await nativeAuthoritativeEvents(page)).toEqual([]);
  const before = fixture.counts.receiptReads;
  await resumeVisibleDelivery(page);
  await expect.poll(() => fixture.counts.receiptReads).toBeGreaterThan(before);
  expect(await nativeAuthoritativeEvents(page)).toEqual([]);
});

test("an opt-out suppresses receipt delivery and an explicit privacy choice starts and stops it", async ({ page, context, baseURL }) => {
  const initial = receipt("Lead");
  const fixture = await deliveryFixture(page, context, baseURL!, [initial], true);
  await page.goto("/en/privacy");
  await expect(page.getByRole("button", { name: "Turn on", exact: true })).toBeEnabled();
  await expect.poll(() => fixture.counts.configReads).toBe(1);
  await resumeVisibleDelivery(page);
  expect(fixture.counts.receiptReads).toBe(0);
  expect(fixture.counts.libraryLoads).toBe(0);
  expect(await nativeAuthoritativeEvents(page)).toEqual([]);

  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(page.getByRole("button", { name: "Turn off", exact: true })).toBeEnabled();
  await expect.poll(() => nativeAuthoritativeEvents(page)).toHaveLength(1);
  expect((await nativeAuthoritativeEvents(page))[0].eventId).toBe(initial.eventId);

  await page.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(page.getByRole("button", { name: "Turn on", exact: true })).toBeEnabled();
  fixture.setReceipts([initial, receipt("Purchase", { purchase_type: "products", value: 350, currency: "THB" })]);
  const readsAfterOptOut = fixture.counts.receiptReads;
  await resumeVisibleDelivery(page);
  expect(fixture.counts.receiptReads).toBe(readsAfterOptOut);
  expect(await nativeAuthoritativeEvents(page)).toHaveLength(1);
});

test("an order awaiting payment emits no Purchase until its confirmed receipt is available", async ({ page, context, baseURL }) => {
  const pendingOrder = receipt("OrderSubmitted", { purchase_type: "products", value: 1250, currency: "THB", funnel_stage: "checkout" });
  const fixture = await deliveryFixture(page, context, baseURL!, [pendingOrder]);
  await page.goto("/en?payment_status=pending");
  await expect.poll(() => nativeAuthoritativeEvents(page)).toHaveLength(1);
  expect((await nativeAuthoritativeEvents(page)).map(event => event.name)).toEqual(["DEV_OrderSubmitted"]);
  const readsBeforeConfirmation = fixture.counts.receiptReads;
  await resumeVisibleDelivery(page);
  await expect.poll(() => fixture.counts.receiptReads).toBeGreaterThan(readsBeforeConfirmation);
  expect((await nativeAuthoritativeEvents(page)).filter(event => event.name === "DEV_Purchase")).toEqual([]);

  const confirmed = receipt("Purchase", { purchase_type: "products", value: 1250, currency: "THB", funnel_stage: "confirmation" });
  fixture.setReceipts([pendingOrder, confirmed]);
  await resumeVisibleDelivery(page);
  await expect.poll(() => nativeAuthoritativeEvents(page)).toHaveLength(2);
  expect((await nativeAuthoritativeEvents(page)).find(event => event.name === "DEV_Purchase")).toEqual({
    command: "trackSingleCustom", pixelId, name: "DEV_Purchase", data: confirmed.data, eventId: confirmed.eventId
  });
});
