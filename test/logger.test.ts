import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { createLogger, sanitizeLogFields } from "../lib/logger.ts";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;
const originalDebug = console.debug;

afterEach(() => {
  console.info = originalInfo;
  console.warn = originalWarn;
  console.error = originalError;
  console.debug = originalDebug;
});

describe("structured logger", () => {
  it("redacts secrets and partially masks emails", () => {
    const sanitized = sanitizeLogFields({
      authorization: "Bearer super-secret",
      contactEmail: "alice@example.com",
      nested: {
        apiKey: "abc123",
        token: "tok_live_xxx",
        safe: "ok"
      },
      password: "hunter2",
      planId: "plan-1"
    });

    assert.deepEqual(sanitized, {
      authorization: "[redacted]",
      contactEmail: "a***@example.com",
      nested: {
        apiKey: "[redacted]",
        token: "[redacted]",
        safe: "ok"
      },
      password: "[redacted]",
      planId: "plan-1"
    });
  });

  it("emits JSON lines with scope and level", () => {
    const lines: string[] = [];
    console.info = ((line?: unknown) => {
      lines.push(String(line));
    }) as typeof console.info;

    const log = createLogger("api.payments.checkout-session");
    log.info("Stripe checkout session requested", {
      locale: "en",
      stripeSecret: "sk_live_should_redact"
    });

    assert.equal(lines.length, 1);
    const payload = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    assert.equal(payload.level, "info");
    assert.equal(payload.scope, "api.payments.checkout-session");
    assert.equal(payload.message, "Stripe checkout session requested");
    assert.equal(payload.locale, "en");
    assert.equal(payload.stripeSecret, "[redacted]");
    assert.equal(typeof payload.ts, "string");
  });

  it("serializes Error objects without leaking secrets on sibling fields", () => {
    const lines: string[] = [];
    console.error = ((line?: unknown) => {
      lines.push(String(line));
    }) as typeof console.error;

    const log = createLogger("api.assessment");
    log.error("Unable to persist assessment submission", {
      error: new Error("db unavailable"),
      resumeToken: "secret-token-value"
    });

    const payload = JSON.parse(lines[0] ?? "{}") as {
      error?: { message?: string; name?: string };
      resumeToken?: string;
    };
    assert.equal(payload.error?.name, "Error");
    assert.equal(payload.error?.message, "db unavailable");
    assert.equal(payload.resumeToken, "[redacted]");
  });

  it("migrates priority public API routes off raw console.*", () => {
    const priorityRoutes = [
      "../app/api/assessment/route.ts",
      "../app/api/assessment/resume-link/route.ts",
      "../app/api/assessment/[planId]/route.ts",
      "../app/api/payments/checkout-session/route.ts",
      "../app/api/retail/checkout/session/route.ts",
      "../app/api/stripe/webhook/[payloadShape]/route.ts"
    ];

    for (const route of priorityRoutes) {
      const text = source(route);
      assert.match(text, /createLogger/, route);
      assert.doesNotMatch(text, /console\.(log|info|warn|error|debug)\(/, route);
    }
  });
});
