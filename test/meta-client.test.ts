import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { configureMetaClient, trackMetaEvent } from "../lib/meta-client.ts";

const pixelId = "27629903823308584";
const sessionId = "843893a8-4c1b-44d9-86f4-092e16270d1a";
const receiptId = "500e9000-b443-4898-9d9b-0563cbfb5164";
const browserGlobals = ["window", "document", "location", "sessionStorage"] as const;
let originals: Map<string, PropertyDescriptor | undefined>;
let pixelCalls: unknown[][];
let page: { cookie: string; referrer: string };

function eventRequest(init?: RequestInit) {
  return JSON.parse(String(init?.body)) as { eventId: string; name: string };
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

describe("Meta browser event receipts", () => {
  beforeEach(() => {
    originals = new Map(browserGlobals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    pixelCalls = [];
    page = { cookie: "mn_marketing=granted", referrer: "" };
    const values = {
      window: { fbq: (...args: unknown[]) => pixelCalls.push(args) },
      document: page,
      location: new URL("https://mattanutra.com/en"),
      sessionStorage: { getItem: () => sessionId, setItem: () => {} }
    };
    for (const key of browserGlobals) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[key] });
    configureMetaClient({ enabled: true, environment: "prd", pixelId });
  });

  afterEach(() => {
    for (const key of browserGlobals) {
      const original = originals.get(key);
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  it("captures the header PageView using its original ID without replaying the browser copy", async t => {
    const bootstrap = { eventId: crypto.randomUUID(), sourceUrl: location.href, pixelId, environment: "prd" as const };
    const requests: ReturnType<typeof eventRequest>[] = [];
    t.mock.method(globalThis, "fetch", async (_url, init) => {
      const body = eventRequest(init); requests.push(body);
      return Response.json({ accepted: true, eventId: body.eventId });
    });
    const occurrence = crypto.randomUUID();
    await trackMetaEvent("PageView", {}, occurrence, location.href, bootstrap);
    await trackMetaEvent("PageView", {}, occurrence, location.href, bootstrap);
    assert.deepEqual(requests.map(request => request.eventId), [bootstrap.eventId]);
    assert.deepEqual(pixelCalls, []);
  });

  it("retains the header event ID across a lost capture response and later retry", async t => {
    const bootstrap = { eventId: crypto.randomUUID(), sourceUrl: location.href, pixelId, environment: "prd" as const };
    const requests: ReturnType<typeof eventRequest>[] = [];
    t.mock.method(globalThis, "fetch", async (_url, init) => {
      const body = eventRequest(init); requests.push(body);
      if (requests.length === 1) throw new Error("lost response");
      return Response.json({ accepted: true, eventId: body.eventId });
    });
    await trackMetaEvent("PageView", {}, crypto.randomUUID(), location.href, bootstrap);
    assert.deepEqual(requests.map(request => request.eventId), [bootstrap.eventId, bootstrap.eventId]);
    assert.deepEqual(pixelCalls, []);
  });

  it("does not use a bootstrap from another destination, source page, or for a conversion", async t => {
    const bootstrap = { eventId: crypto.randomUUID(), sourceUrl: location.href, pixelId, environment: "prd" as const };
    const requests: ReturnType<typeof eventRequest>[] = [];
    t.mock.method(globalThis, "fetch", async (_url, init) => {
      const body = eventRequest(init); requests.push(body);
      return Response.json({ accepted: true, eventId: body.eventId });
    });
    for (const invalid of [
      { ...bootstrap, pixelId: "123456789" }, { ...bootstrap, environment: "uat" as const },
      { ...bootstrap, sourceUrl: "https://mattanutra.com/th" }, { ...bootstrap, eventId: "invalid" }
    ]) await trackMetaEvent("PageView", {}, crypto.randomUUID(), location.href, invalid);
    await trackMetaEvent("ViewContent", {}, crypto.randomUUID(), location.href, bootstrap);
    assert.equal(requests.length, 5);
    assert.equal(pixelCalls.length, 5);
    assert.ok(requests.every(request => request.eventId !== bootstrap.eventId));
  });

  it("allows a rejected HTTP 200 receipt to be retried and emits only the accepted event", async t => {
    const occurrence = crypto.randomUUID();
    const requests: ReturnType<typeof eventRequest>[] = [];
    const fetch = t.mock.method(globalThis, "fetch", async (_url, init) => {
      const request = eventRequest(init);
      requests.push(request);
      return Response.json({ accepted: requests.length > 1, eventId: request.eventId });
    });

    await trackMetaEvent("PageView", { stage: "landing" }, occurrence);
    assert.equal(pixelCalls.length, 0);
    await trackMetaEvent("PageView", { stage: "landing" }, occurrence);
    await trackMetaEvent("PageView", { stage: "landing" }, occurrence);

    assert.equal(fetch.mock.callCount(), 2);
    assert.equal(pixelCalls.length, 1);
    assert.deepEqual(pixelCalls[0].slice(0, 3), ["trackSingle", pixelId, "PageView"]);
    assert.deepEqual(pixelCalls[0][4], { eventID: requests[1].eventId });
  });

  it("recovers from a lost response and transient server failure using one event ID", async t => {
    const requests: ReturnType<typeof eventRequest>[] = [];
    t.mock.method(globalThis, "fetch", async (_url, init) => {
      const body = eventRequest(init); requests.push(body);
      if (requests.length === 1) throw new Error("lost response");
      if (requests.length === 2) return new Response("retry", { status: 503 });
      return Response.json({ accepted: true, eventId: body.eventId });
    });
    await trackMetaEvent("PageView", {}, crypto.randomUUID());
    assert.equal(requests.length, 3);
    assert.equal(new Set(requests.map(request => request.eventId)).size, 1);
    assert.equal(pixelCalls.length, 1);
    assert.deepEqual(pixelCalls[0][4], { eventID: requests[0].eventId });
  });

  it("does not misattribute a delayed PageView to the next customer page", async t => {
    const response = deferredResponse();
    t.mock.method(globalThis, "fetch", () => response.promise);
    const sent = trackMetaEvent("PageView", {}, crypto.randomUUID());
    location.href = "https://mattanutra.com/en/nutrition/quiz";
    response.resolve(Response.json({ accepted: true, eventId: receiptId }));
    await sent;
    assert.equal(pixelCalls.length, 0);
  });

  it("does not emit or suppress retries for malformed acceptance receipts", async t => {
    const malformed = [null, {}, { accepted: "true", eventId: receiptId }, { accepted: 1, eventId: receiptId },
      { accepted: true }, { accepted: true, eventId: 123 }, { accepted: true, eventId: "invalid" }];
    let receipt: unknown;
    const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(receipt));
    for (const invalid of malformed) {
      const occurrence = crypto.randomUUID(), previousCalls = pixelCalls.length;
      receipt = invalid;
      await trackMetaEvent("PageView", {}, occurrence);
      assert.equal(pixelCalls.length, previousCalls);
      receipt = { accepted: true, eventId: receiptId };
      await trackMetaEvent("PageView", {}, occurrence);
      assert.equal(pixelCalls.length, previousCalls + 1);
    }
    assert.equal(fetch.mock.callCount(), malformed.length * 2);
  });

  it("coalesces pending sends and successful duplicates while preserving the server deduplication ID", async t => {
    const occurrence = crypto.randomUUID(), response = deferredResponse();
    const fetch = t.mock.method(globalThis, "fetch", () => response.promise);
    const first = trackMetaEvent("PageView", {}, occurrence);
    const duplicate = trackMetaEvent("PageView", {}, occurrence);
    assert.equal(duplicate, first);
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(pixelCalls.length, 0);

    response.resolve(Response.json({ accepted: true, eventId: receiptId }));
    await Promise.all([first, duplicate]);
    await trackMetaEvent("PageView", {}, occurrence);
    assert.equal(fetch.mock.callCount(), 1);
    assert.equal(pixelCalls.length, 1);
    assert.deepEqual(pixelCalls[0][4], { eventID: receiptId });
  });

  it("does not forward an accepted receipt after marketing consent has been revoked", async t => {
    const response = deferredResponse();
    t.mock.method(globalThis, "fetch", () => response.promise);
    const sent = trackMetaEvent("PageView", {}, crypto.randomUUID());
    page.cookie = "mn_marketing=denied";
    response.resolve(Response.json({ accepted: true, eventId: receiptId }));
    await sent;
    assert.equal(pixelCalls.length, 0);
  });

  it("checks the current page before forwarding a receipt after navigation", async t => {
    const response = deferredResponse();
    t.mock.method(globalThis, "fetch", () => response.promise);
    const sent = trackMetaEvent("PageView", {}, crypto.randomUUID());
    location.href = "https://mattanutra.com/en/admin/dashboard";
    response.resolve(Response.json({ accepted: true, eventId: receiptId }));
    await sent;
    assert.equal(pixelCalls.length, 0);
  });

  it("sends native funnel events on customer pages with the authoritative checkout receipt", async t => {
    const attemptId = crypto.randomUUID();
    location.href = "https://www.mattanutra.com/zh-CN/basket/checkout?access=opaque";
    page.referrer = "https://mattanutra.com/zh-CN/nutrition/reveal?planId=opaque";
    t.mock.method(globalThis, "fetch", async () => Response.json({ accepted: true, eventId: receiptId,
      data: { mn_env: "uat", event_schema: "1", locale: "zh-CN", funnel_stage: "checkout", purchase_type: "products", value: 250, currency: "THB", email: "excluded@example.com" } }));
    await trackMetaEvent("InitiateCheckout", { attemptId, value: 1, currency: "USD" });
    assert.deepEqual(pixelCalls, [["trackSingle", pixelId, "InitiateCheckout", {
      mn_env: "prd", event_schema: "1", locale: "zh-CN", funnel_stage: "checkout", purchase_type: "products", value: 250, currency: "THB"
    }, { eventID: receiptId }]]);
    await trackMetaEvent("InitiateCheckout", { attemptId });
    assert.equal(pixelCalls.length, 1);
    await trackMetaEvent("InitiateCheckout", { attemptId: crypto.randomUUID() });
    assert.equal(pixelCalls.length, 2);
  });

  it("retains the configured destination for an in-flight accepted event", async t => {
    const response = deferredResponse();
    t.mock.method(globalThis, "fetch", () => response.promise);
    const sent = trackMetaEvent("PageView", {}, crypto.randomUUID());
    configureMetaClient({ enabled: true, environment: "uat", pixelId: "different-pixel" });
    response.resolve(Response.json({ accepted: true, eventId: receiptId }));
    await sent;
    assert.equal(pixelCalls.length, 1);
    assert.deepEqual(pixelCalls[0].slice(0, 3), ["trackSingle", pixelId, "PageView"]);
  });
});
