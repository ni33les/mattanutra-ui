import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import { publicLocales } from "../lib/i18n.ts";
import type { MetaPublicConfig } from "../lib/meta-event-policy.ts";
import { metaPixelBootstrapScript } from "../lib/meta-pixel-bootstrap.ts";

const pixelId = "27629903823308584";
const config: MetaPublicConfig = { enabled: true, environment: "prd", pixelId };
const pageData = { mn_env: "prd", event_schema: "1", locale: "en", funnel_stage: "landing", channel: "web" };
type ScriptElement = { src?: string; id?: string; async?: boolean };
type PixelQueue = ((...args: unknown[]) => void) & { queue: ArrayLike<unknown>[] };
type BootstrapBridge = { eventId: string; sourceUrl: string; pixelId: string; environment: string };

function runBootstrap(script: string, options: { href?: string; cookie?: string; existingScript?: boolean } = {}) {
  const inserted: ScriptElement[] = [];
  const head = {
    appendChild(element: ScriptElement) { inserted.push(element); return element; },
    insertBefore(element: ScriptElement) { inserted.push(element); return element; }
  };
  const existing = options.existingScript === false ? [] : [{ parentNode: head }];
  const location = new URL(options.href ?? "https://www.mattanutra.com/en");
  const sandbox: Record<string, unknown> = {
    location,
    crypto: { randomUUID },
    URL,
    document: {
      cookie: options.cookie ?? "",
      referrer: "https://business.facebook.com/",
      head,
      createElement(tag: string) { assert.equal(tag, "script"); return {}; },
      getElementsByTagName(tag: string) { return tag === "script" ? existing : tag === "head" ? [head] : []; },
      getElementById(id: string) { return inserted.find(element => element.id === id) ?? null; }
    }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  runInNewContext(script, sandbox, { timeout: 1000 });
  const fbq = sandbox.fbq as PixelQueue | undefined;
  // The official stub queues arguments objects; normalize these and VM prototypes.
  const calls = JSON.parse(JSON.stringify(Array.from(fbq?.queue ?? [], call => Array.from(call)))) as unknown[][];
  const bridge = sandbox.__mnMetaPageView as BootstrapBridge | undefined;
  return { inserted, calls, bridge, fbq, sandbox };
}

describe("Meta pre-React head bootstrap", () => {
  it("initializes the production Pixel and immediately queues a PageView without React or APIs", () => {
    const sourceUrl = "https://www.mattanutra.com/en?fbclid=opaque-click&campaign_id=123#start";
    const result = runBootstrap(metaPixelBootstrapScript(config, pageData), { href: sourceUrl });

    assert.equal(result.inserted.length, 1);
    assert.equal(result.inserted[0].src, "https://connect.facebook.net/en_US/fbevents.js");
    assert.equal(result.inserted[0].async, true);
    assert.equal(result.sandbox._fbq, result.fbq);
    assert.ok(result.bridge);
    assert.match(result.bridge.eventId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(result.bridge.sourceUrl, sourceUrl);
    assert.equal(result.bridge.pixelId, pixelId);
    assert.equal(result.bridge.environment, "prd");
    assert.deepEqual(result.calls.filter(call => call[0] === "set"), [["set", "autoConfig", false, pixelId]]);
    assert.deepEqual(result.calls.filter(call => call[0] === "init"), [["init", pixelId]]);
    assert.deepEqual(result.calls.filter(call => call[0] === "track"), [["track", "PageView", pageData, { eventID: result.bridge.eventId }]]);
    assert.equal(result.calls.filter(call => call[0] === "trackCustom").length, 0);
    assert.ok(result.calls.findIndex(call => call[0] === "init") < result.calls.findIndex(call => call[0] === "track"));
  });

  it("loads the library when there is no earlier script element in the head", () => {
    const result = runBootstrap(metaPixelBootstrapScript(config, pageData), { existingScript: false });
    assert.equal(result.inserted.length, 1);
    assert.equal(result.inserted[0].src, "https://connect.facebook.net/en_US/fbevents.js");
    assert.equal(result.calls.filter(call => call[0] === "track").length, 1);
  });

  it("generates a fresh browser event ID for each document using the same server-rendered code", () => {
    const script = metaPixelBootstrapScript(config, pageData);
    const first = runBootstrap(script), second = runBootstrap(script);
    assert.ok(first.bridge?.eventId);
    assert.ok(second.bridge?.eventId);
    assert.notEqual(first.bridge.eventId, second.bridge.eventId);
  });

  it("respects a saved opt-out before loading any Meta code or creating a PageView", () => {
    for (const cookie of ["mn_marketing=denied", "NEXT_LOCALE=en; mn_marketing=denied; theme=light"]) {
      const result = runBootstrap(metaPixelBootstrapScript(config, pageData), { cookie });
      assert.equal(result.inserted.length, 0);
      assert.equal(result.fbq, undefined);
      assert.equal(result.bridge, undefined);
    }
  });

  it("starts with a granted preference or no saved preference", () => {
    for (const cookie of ["", "mn_marketing=granted", "unrelated_mn_marketing=denied"]) {
      const result = runBootstrap(metaPixelBootstrapScript(config, pageData), { cookie });
      assert.equal(result.inserted.length, 1);
      assert.equal(result.calls.filter(call => call[0] === "track").length, 1);
    }
  });

  it("covers each registered locale on both production hostnames", () => {
    const script = metaPixelBootstrapScript(config, pageData);
    for (const hostname of ["mattanutra.com", "www.mattanutra.com"]) {
      for (const locale of publicLocales) {
        const result = runBootstrap(script, { href: `https://${hostname}/${locale}/nutrition/quiz` });
        assert.equal(result.inserted.length, 1, `${hostname}/${locale}`);
      }
    }
  });

  it("does not load on internal paths, unsupported locales, or a different environment's origin", () => {
    const script = metaPixelBootstrapScript(config, pageData);
    for (const href of [
      "https://www.mattanutra.com/en/admin",
      "https://www.mattanutra.com/en/admin/login",
      "https://www.mattanutra.com/en/api/private",
      "https://www.mattanutra.com/admin/login",
      "https://www.mattanutra.com/api/marketing/consent",
      "https://www.mattanutra.com/not-a-locale",
      "https://www.mattanutra.com/",
      "https://uat.mattanutra.com/en",
      "https://dev.mattanutra.com/en",
      "https://mattanutra.com.example.org/en",
      "https://example.org/en",
      "http://mattanutra.com/en"
    ]) {
      const result = runBootstrap(script, { href });
      assert.equal(result.inserted.length, 0, href);
      assert.equal(result.calls.length, 0, href);
      assert.equal(result.bridge, undefined, href);
    }
  });

  it("uses prefixed custom PageViews for UAT and development", () => {
    for (const environment of ["dev", "uat"] as const) {
      const localConfig = { ...config, environment, pixelId: "111111111111111" };
      const data = { ...pageData, mn_env: environment };
      const result = runBootstrap(metaPixelBootstrapScript(localConfig, data), { href: `https://${environment}.mattanutra.com/en` });
      assert.equal(result.inserted.length, 1);
      assert.ok(result.bridge);
      assert.equal(result.bridge.environment, environment);
      assert.equal(result.bridge.pixelId, localConfig.pixelId);
      assert.deepEqual(result.calls.filter(call => call[0] === "trackCustom"), [
        ["trackCustom", `${environment.toUpperCase()}_PageView`, data, { eventID: result.bridge.eventId }]
      ]);
      assert.equal(result.calls.filter(call => call[0] === "track").length, 0);
    }
  });

  it("permits local development without permitting production code on localhost", () => {
    for (const hostname of ["localhost", "127.0.0.1"]) {
      const href = `http://${hostname}:3000/en`;
      assert.equal(runBootstrap(metaPixelBootstrapScript({ ...config, environment: "dev" }, pageData), { href }).inserted.length, 1);
      assert.equal(runBootstrap(metaPixelBootstrapScript(config, pageData), { href }).inserted.length, 0);
    }
  });

  it("produces no active Pixel for disabled or invalid configuration", () => {
    for (const value of [
      { ...config, enabled: false },
      { ...config, pixelId: "" },
      { ...config, pixelId: "1234" },
      { ...config, pixelId: "123456789012345678901" },
      { ...config, pixelId: "bad-pixel-id" },
      { ...config, pixelId: "12345');alert(1);//" }
    ]) {
      const result = runBootstrap(metaPixelBootstrapScript(value, pageData));
      assert.equal(result.inserted.length, 0);
      assert.equal(result.calls.length, 0);
      assert.equal(result.bridge, undefined);
    }
  });

  it("serializes only public configuration even when a server config includes credentials", () => {
    const serverConfig = { ...config, token: "server-only-access-token", testEventCode: "server-only-test-code" };
    const script = metaPixelBootstrapScript(serverConfig, pageData);
    assert.doesNotMatch(script, /server-only-access-token|server-only-test-code/);
    assert.equal(runBootstrap(script).inserted.length, 1);
  });
});
