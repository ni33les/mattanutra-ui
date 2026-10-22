import assert from "node:assert/strict";
import { register } from "node:module";
import { it, mock } from "node:test";
import type { BpmEventInput } from "../lib/bpm.ts";

register("../scripts/matcher-http-loader.mjs", import.meta.url);
const events: BpmEventInput[] = [];
mock.module("../lib/bpm-client.ts", { namedExports: { trackBpmEvent: (eventName: string, input: BpmEventInput) => events.push({ ...input, eventName }) } });
mock.module("../lib/bpm.ts", { namedExports: { writeBpmEvent: async (input: BpmEventInput) => { events.push(input); return "fixture-event"; } } });
mock.module("../lib/rate-limit.ts", { namedExports: { enforceRateLimit: () => null, publicRateLimits: {} } });
let canCheckout = true;
mock.module("../lib/retail-cart-availability.ts", { namedExports: {
  normalizeRetailRoutingPreference: () => "cheapest_price",
  resolveRegionalBasketAvailability: async () => ({ canCheckout, lines: [{}], payableLines: canCheckout ? [{}] : [], unavailableLines: canCheckout ? [] : [{}] })
} });
const { observeWebQuizLanding } = await import("../lib/web-quiz-landing-tracking.ts");
const { POST: availability } = await import("../app/api/retail/basket/availability/route.ts");
const { POST: browserEvent } = await import("../app/api/bpm/route.ts");

it("quiz arrival requires the real welcome to intersect in a visible tab and ignores non-quiz routes", () => {
  events.length = 0;
  const listeners = new Set<() => void>();
  let observe: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
  let disconnected = false;
  const saved = Object.fromEntries(["window", "document", "IntersectionObserver"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const browser = { location: { pathname: "/en/nutrition/quiz" } };
  const document = { visibilityState: "hidden", addEventListener: (_event: string, callback: () => void) => listeners.add(callback),
    removeEventListener: (_event: string, callback: () => void) => listeners.delete(callback) };
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: class {
    constructor(callback: typeof observe) { observe = callback; }
    observe() {} disconnect() { disconnected = true; }
  } });
  try {
    const cleanup = observeWebQuizLanding({} as HTMLElement, { locale: "en", sessionId: "welcome-session" });
    assert.equal(events.length, 0);
    observe!([{ isIntersecting: true }]);
    assert.equal(events.length, 0, "a background tab has not displayed the welcome");
    document.visibilityState = "visible";
    listeners.forEach(callback => callback());
    observe!([{ isIntersecting: true }]);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventName, "web_quiz_landing_viewed");
    assert.deepEqual(events[0].properties, { journeyVersion: "web-products-v1", channel: "web", sessionId: "welcome-session", questionnaireVersion: "v15.5-screens" });
    cleanup(); assert.equal(disconnected, true); assert.equal(listeners.size, 0);
    for (const path of ["/en", "/en/nutrition/reveal", "/th/retail/pharmacy/quiz", "/en/mcp/checkout"]) {
      browser.location.pathname = path; observe = undefined;
      observeWebQuizLanding({} as HTMLElement, { locale: "en", sessionId: "other" })();
      assert.equal(observe, undefined);
    }
    assert.equal(events.length, 1);
    browser.location.pathname = "/en/nutrition/quiz";
    Reflect.deleteProperty(globalThis, "IntersectionObserver");
    assert.doesNotThrow(() => observeWebQuizLanding({} as HTMLElement, { locale: "en", sessionId: "unsupported" })());
    assert.equal(events.length, 1, "unsupported visibility observation does not invent an arrival");
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

it("country quote previews and blocked baskets never claim delivery details were completed", async () => {
  const planId = "10000000-0000-4000-8000-000000000001";
  for (const payable of [true, false]) for (const previewOnly of [true, false]) {
    events.length = 0; canCheckout = payable;
    const response = await availability(new Request("http://localhost/api/retail/basket/availability", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId, locale: "en", previewOnly, shippingCountry: "TH", lines: [{ productId: planId, quantity: 1 }] })
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(events.map(event => event.eventName), [payable ? "retail_basket_routing_preview" : "retail_basket_no_payable_local_lines"]);
  }
});

it("the public BPM endpoint rejects a forged server-validated delivery completion", async () => {
  events.length = 0;
  const response = await browserEvent(new Request("http://localhost/api/bpm", { method: "POST",
    body: JSON.stringify({ eventName: "web_delivery_details_completed", properties: { journeyVersion: "web-products-v1" } }) }));
  assert.equal(response.status, 400);
  assert.equal(events.length, 0);
});
