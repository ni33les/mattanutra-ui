import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import {
  consumeRateLimit,
  enforceRateLimit,
  getRateLimitStoreSizeForTests,
  publicRateLimits,
  rateLimitClientKey,
  rateLimitExceededResponse,
  resetRateLimitStoreForTests,
  setRateLimitMaxStoreEntriesForTests,
  setRateLimitNowForTests,
  setRateLimitPurgeIntervalForTests
} from "../lib/rate-limit.ts";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function requestWithIp(ip: string) {
  return new Request("https://www.mattanutra.com/api/assessment", {
    headers: {
      "x-forwarded-for": ip
    },
    method: "POST"
  });
}

const previousTrustProxy = process.env.TRUST_PROXY;
const previousTrustedClientIpHeader = process.env.TRUSTED_CLIENT_IP_HEADER;

afterEach(() => {
  resetRateLimitStoreForTests();
  setRateLimitNowForTests(null);
  if (previousTrustProxy === undefined) {
    delete process.env.TRUST_PROXY;
  } else {
    process.env.TRUST_PROXY = previousTrustProxy;
  }
  if (previousTrustedClientIpHeader === undefined) {
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
  } else {
    process.env.TRUSTED_CLIENT_IP_HEADER = previousTrustedClientIpHeader;
  }
});

describe("rate limit", () => {
  it("allows traffic under the fixed window budget and then returns 429", () => {
    setRateLimitNowForTests(1_000_000);
    const config = { name: "test-bucket", limit: 3, windowMs: 60_000 };
    const key = "test-bucket:1.2.3.4";

    assert.equal(consumeRateLimit(key, config).allowed, true);
    assert.equal(consumeRateLimit(key, config).allowed, true);
    const third = consumeRateLimit(key, config);
    assert.equal(third.allowed, true);
    assert.equal(third.remaining, 0);

    const blocked = consumeRateLimit(key, config);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSeconds >= 1);

    const response = rateLimitExceededResponse(blocked);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), String(blocked.retryAfterSeconds));
    assert.equal(response.headers.get("RateLimit-Limit"), "3");
    assert.equal(response.headers.get("RateLimit-Remaining"), "0");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  });

  it("resets the window after windowMs elapses", () => {
    setRateLimitNowForTests(5_000);
    const config = { name: "reset-bucket", limit: 1, windowMs: 1_000 };
    const key = "reset-bucket:ip";

    assert.equal(consumeRateLimit(key, config).allowed, true);
    assert.equal(consumeRateLimit(key, config).allowed, false);

    setRateLimitNowForTests(6_001);
    assert.equal(consumeRateLimit(key, config).allowed, true);
  });

  it("purges expired keys so the store cannot grow without bound", () => {
    setRateLimitNowForTests(10_000);
    setRateLimitPurgeIntervalForTests(0);
    const config = { name: "expire", limit: 1, windowMs: 1_000 };

    for (let i = 0; i < 50; i += 1) {
      consumeRateLimit(`expire:ip-${i}`, config);
    }
    assert.equal(getRateLimitStoreSizeForTests(), 50);

    setRateLimitNowForTests(12_000);
    // Touching the limiter after expiry should sweep dead buckets.
    consumeRateLimit("expire:fresh", config);
    assert.equal(getRateLimitStoreSizeForTests(), 1);
  });

  it("prunes the least-recent keys when the max store size is exceeded", () => {
    setRateLimitNowForTests(20_000);
    setRateLimitMaxStoreEntriesForTests(10);
    setRateLimitPurgeIntervalForTests(60_000);
    const config = { name: "cap", limit: 5, windowMs: 60_000 };

    for (let i = 0; i < 25; i += 1) {
      setRateLimitNowForTests(20_000 + i);
      consumeRateLimit(`cap:ip-${i}`, config);
    }

    assert.ok(getRateLimitStoreSizeForTests() <= 10);
    // Most recent keys should still be present after pruning.
    assert.equal(consumeRateLimit("cap:ip-24", config).allowed, true);
  });

  it("keys clients by trusted forwarded IP and config name", () => {
    process.env.TRUST_PROXY = "1";
    const request = requestWithIp("203.0.113.9, 10.0.0.1");
    assert.equal(
      rateLimitClientKey(request, "checkout-session"),
      "checkout-session:203.0.113.9"
    );

    setRateLimitNowForTests(10_000);
    const config = { name: "per-ip", limit: 1, windowMs: 60_000 };

    assert.equal(enforceRateLimit(requestWithIp("1.1.1.1"), config), null);
    assert.equal(enforceRateLimit(requestWithIp("1.1.1.1"), config)?.status, 429);
    assert.equal(enforceRateLimit(requestWithIp("2.2.2.2"), config), null);
  });

  it("collapses untrusted forwarded IPs onto a shared unknown bucket", () => {
    // Do not mutate NODE_ENV (read-only under tsc). Clear trust flags so
    // headers are ignored outside production.
    delete process.env.TRUST_PROXY;
    delete process.env.TRUSTED_CLIENT_IP_HEADER;

    assert.equal(
      rateLimitClientKey(requestWithIp("203.0.113.9"), "assessment-post"),
      "assessment-post:unknown"
    );
    assert.equal(
      rateLimitClientKey(requestWithIp("198.51.100.1"), "assessment-post"),
      "assessment-post:unknown"
    );
  });

  it("wires enforceRateLimit into highest-risk public mutation routes", () => {
    const routes = [
      "../app/api/assessment/route.ts",
      "../app/api/assessment/resume-link/route.ts",
      "../app/api/assessment/[planId]/route.ts",
      "../app/api/assessment/[planId]/refine/route.ts",
      "../app/api/assessment/[planId]/line-connect/route.ts",
      "../app/api/assessment/[planId]/communication-channel/route.ts",
      "../app/api/assessment/[planId]/product-recommendations/route.ts",
      "../app/api/payments/checkout-session/route.ts",
      "../app/api/payments/[paymentId]/mock-complete/route.ts",
      "../app/api/retail/checkout/session/route.ts",
      "../app/api/retail/checkout/[paymentId]/mock-complete/route.ts",
      "../app/api/retail/basket/availability/route.ts",
      "../app/api/bpm/route.ts",
      "../app/api/products/click/route.ts"
    ];

    for (const route of routes) {
      const text = source(route);
      assert.match(text, /enforceRateLimit/, route);
      assert.match(text, /publicRateLimits/, route);
    }

    assert.equal(publicRateLimits.checkoutSession.limit, 10);
    assert.equal(publicRateLimits.assessmentResumeLink.limit, 5);
  });
});
