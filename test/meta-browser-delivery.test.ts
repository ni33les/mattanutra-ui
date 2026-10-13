import assert from "node:assert/strict";
import { beforeEach, afterEach, describe, it } from "node:test";
import { deliverMetaReceipts } from "../lib/meta-browser-delivery.ts";

const config = { enabled: true, environment: "prd" as const, pixelId: "27629903823308584" };
const globals = ["window", "document", "location", "localStorage", "navigator"] as const;
let originals: Map<string, PropertyDescriptor | undefined>;
let calls: unknown[][];
let page: { cookie: string; visibilityState: string; referrer: string };
let storage: Map<string, string>;
const receipt = (name: string, data: Record<string, unknown> = {}) => ({ name, eventId: crypto.randomUUID(), occurredAt: new Date().toISOString(), data });
const response = (events: unknown[], override = {}) => Response.json({ ...config, events, ...override });

describe("confirmed Meta browser delivery", () => {
  beforeEach(() => {
    originals = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    calls = []; storage = new Map();
    page = { cookie: "mn_marketing=granted", visibilityState: "visible", referrer: "" };
    const values = {
      window: { fbq: Object.assign((...args: unknown[]) => calls.push(args), { callMethod() {} }) },
      document: page, location: new URL("https://www.mattanutra.com/en/basket/return"),
      localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
      navigator: {}
    };
    for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[key] });
  });
  afterEach(() => {
    for (const key of globals) {
      const original = originals.get(key);
      if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key);
    }
  });

  it("sends confirmed funnel events with original IDs and verified plan/product revenue, without capture POSTs", async t => {
    const events = [receipt("QuizSubmitted"), receipt("Lead"), receipt("EmailCapture"), receipt("OrderSubmitted"), receipt("McpConnectionVerified"),
      receipt("Purchase", { value: 1200, currency: "THB", purchase_type: "plan" }),
      receipt("Purchase", { value: 3150, currency: "THB", purchase_type: "products", email: "never@example.test", symptoms: "never" })];
    const fetch = t.mock.method(globalThis, "fetch", async (_url, init) => {
      assert.equal(init?.method, undefined); assert.equal(init?.cache, "no-store"); return response(events);
    });
    await deliverMetaReceipts(config);
    await deliverMetaReceipts(config);
    assert.equal(fetch.mock.callCount(), 2); assert.equal(calls.length, events.length);
    for (const event of events) {
      const call = calls.find(call => (call[4] as { eventID: string }).eventID === event.eventId)!;
      assert.equal(call[0], ["Purchase", "Lead"].includes(event.name) ? "trackSingle" : "trackSingleCustom");
      assert.equal(call[2], event.name);
      if (event.name === "Purchase") {
        assert.equal((call[3] as Record<string, unknown>).value, event.data.value);
        assert.equal((call[3] as Record<string, unknown>).purchase_type, event.data.purchase_type);
      }
      assert.equal((call[3] as Record<string, unknown>).email, undefined);
      assert.equal((call[3] as Record<string, unknown>).symptoms, undefined);
    }
  });

  it("isolates nonproduction event names and destinations", async t => {
    Object.defineProperty(globalThis, "location", { value: new URL("https://uat.mattanutra.com/en") });
    const uat = { ...config, environment: "uat" as const, pixelId: "123456789" };
    const event = receipt("Purchase", { value: 99, currency: "THB", purchase_type: "plan" });
    t.mock.method(globalThis, "fetch", async () => response([event], uat));
    await deliverMetaReceipts(uat);
    assert.equal(calls[0][0], "trackSingleCustom"); assert.equal(calls[0][1], uat.pixelId); assert.equal(calls[0][2], "UAT_Purchase");
  });

  it("rejects mismatched destinations, invalid receipts and unverified purchase data", async t => {
    t.mock.method(globalThis, "fetch", async () => response([receipt("Lead")], { pixelId: "wrong" }));
    await deliverMetaReceipts(config); assert.equal(calls.length, 0);
    t.mock.method(globalThis, "fetch", async () => response([
      receipt("Purchase", { value: 100 }), receipt("PageView"), { ...receipt("Lead"), eventId: "invalid" },
      { ...receipt("Lead"), occurredAt: "invalid" }, receipt("Purchase", { value: -1, currency: "THB", purchase_type: "plan" })
    ]));
    await deliverMetaReceipts(config); assert.equal(calls.length, 0);
  });

  it("does not poll without consent, on hidden/internal pages or when Meta is blocked", async t => {
    const fetch = t.mock.method(globalThis, "fetch", async () => response([receipt("Lead")]));
    page.cookie = "mn_marketing=denied"; await deliverMetaReceipts(config);
    page.cookie = "mn_marketing=granted"; page.visibilityState = "hidden"; await deliverMetaReceipts(config);
    page.visibilityState = "visible";
    Object.defineProperty(globalThis, "location", { value: new URL("https://www.mattanutra.com/en/admin") });
    await deliverMetaReceipts(config);
    Object.defineProperty(globalThis, "location", { value: new URL("https://www.mattanutra.com/en") });
    window.fbq!.callMethod = undefined; await deliverMetaReceipts(config);
    assert.equal(fetch.mock.callCount(), 0); assert.equal(calls.length, 0);
  });

  it("rechecks consent and cancellation after the API responds", async t => {
    const controller = new AbortController();
    t.mock.method(globalThis, "fetch", async () => { page.cookie = "mn_marketing=denied"; return response([receipt("Lead")]); });
    await deliverMetaReceipts(config); assert.equal(calls.length, 0);
    page.cookie = "mn_marketing=granted";
    t.mock.method(globalThis, "fetch", async () => { controller.abort(); return response([receipt("Lead")]); });
    await deliverMetaReceipts(config, controller.signal); assert.equal(calls.length, 0);
  });

  it("honors previous-tab delivery and serializes concurrent polls with a browser lock", async t => {
    const event = receipt("Lead");
    storage.set(`mn:meta:delivered:prd:${config.pixelId}`, JSON.stringify({ [event.eventId]: Date.now() }));
    let locks = 0;
    Object.defineProperty(globalThis, "navigator", { value: { locks: { request: async (_key: string, _options: unknown, work: () => void) => { locks++; work(); } } } });
    t.mock.method(globalThis, "fetch", async () => response([event]));
    await deliverMetaReceipts(config); assert.equal(locks, 1); assert.equal(calls.length, 0);
  });

  it("retries SDK delivery after a failed fetch without inventing events", async t => {
    const event = receipt("Lead"); let attempts = 0;
    t.mock.method(globalThis, "fetch", async () => { if (!attempts++) throw new Error("offline"); return response([event]); });
    await deliverMetaReceipts(config); assert.equal(calls.length, 0);
    await deliverMetaReceipts(config); assert.equal(calls.length, 1);
  });
});
