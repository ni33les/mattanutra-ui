import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fullTestInventory, fullTestPreflight } from "../scripts/run-full-test-suite.mjs";
import { allTestFiles } from "../scripts/dev-cycle-utils.mjs";
import { semanticTestEvent } from "../scripts/test-semantic-reporter.mjs";

describe("full repository test gate", () => {
  it("includes all Node and browser suites, with a distinct PostgreSQL batch", () => {
    const inventory = fullTestInventory();
    assert.deepEqual(inventory.node, allTestFiles());
    assert.ok(inventory.browser.includes("test/e2e/admin-associate-agent.spec.ts"));
    assert.ok(inventory.browser.includes("test/e2e/web-funnel-recovery.spec.ts"));
    assert.ok(inventory.integration.includes("test/commerce-transactions.integration.test.ts"));
    assert.ok(inventory.integration.includes("test/web-payment-fulfillment.integration.test.ts"));
    assert.deepEqual(inventory.mcp, inventory.node.filter(file => /^test\/(?:agentic|matcher)/.test(file)));
  });
  it("acceptance compares every test outcome while excluding elapsed time", () => {
    const event = { type: "test:pass", data: { file: `${process.cwd()}/test/agentic-p1.test.ts`, name: "retains payment", nesting: 1, details: { type: "test", duration_ms: 5 } } };
    assert.deepEqual(semanticTestEvent(event), semanticTestEvent({ ...event, data: { ...event.data, details: { ...event.data.details, duration_ms: 5000 } } }));
    assert.notDeepEqual(semanticTestEvent(event), semanticTestEvent({ ...event, type: "test:fail" }));
    assert.notDeepEqual(semanticTestEvent(event), semanticTestEvent({ ...event, data: { ...event.data, skip: true } }));
  });
  it("fails missing fixtures instead of permitting environment-based skips", () => {
    const failures = fullTestPreflight({});
    for (const key of ["TEST_DB_URL", "PLAYWRIGHT_BASE_URL", "REVEAL_VISUAL_SMOKE_URL", "MOBILE_UX_CHECKOUT_URL", "MOBILE_UX_ORDER_URL"]) assert.ok(failures.some(item => item.includes(key)));
  });
  it("rejects shared databases and nonisolated browser fixture URLs", () => {
    const failures = fullTestPreflight({ TEST_DB_URL: "postgres://localhost/shared", DB_URL: "fixture", PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3100",
      REVEAL_VISUAL_SMOKE_URL: "https://uat.mattanutra.com/en/nutrition/reveal", MOBILE_UX_CHECKOUT_URL: "/checkout", MOBILE_UX_ORDER_URL: "/order" });
    assert.ok(failures.some(item => item.includes("TEST_DB_URL")));
    assert.ok(failures.some(item => item.includes("REVEAL_VISUAL_SMOKE_URL")));
    assert.ok(fullTestPreflight({ ...process.env, PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3000" })
      .some(item => item.includes("PLAYWRIGHT_BASE_URL")));
    assert.ok(fullTestPreflight({ TEST_DB_URL: "postgres://127.0.0.1:55436/mattanutra_lock_review", DB_WORKER_URL: "postgres://remote/shared" })
      .some(item => item.includes("DB_WORKER_URL")));
  });
});
