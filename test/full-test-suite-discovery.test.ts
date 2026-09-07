import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fullTestInventory, fullTestPreflight, nodeExecutionProof, browserExecutionProof, testSourceHygiene } from "../scripts/run-full-test-suite.mjs";
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
    for (const file of ["test/product-matcher-worker.test.ts", "test/recommendation-selection-projections.test.ts", "test/retail-checkout-session.integration.test.ts", "test/web-advisory.integration.test.ts"]) assert.ok(inventory.mcp.includes(file), file);
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


it("V5-INFRA-01 browser discovery recurses into nested suites", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = mkdtempSync(join(tmpdir(), "matcher-browser-discovery-"));
  try {
    mkdirSync(join(directory, "test/e2e/nested"), { recursive: true });
    writeFileSync(join(directory, "test/e2e/nested/journey.spec.ts"), "");
    writeFileSync(join(directory, "test/e2e/root.spec.ts"), "");
    writeFileSync(join(directory, "test/root.test.ts"), "");
    assert.deepEqual(fullTestInventory(directory).browser, ["test/e2e/nested/journey.spec.ts", "test/e2e/root.spec.ts"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("V5-INFRA-02 Node evidence rejects omitted files, skipped/cancelled cases and empty suites", () => {
  const file = "test/example.test.ts";
  const row = { file, name: "checks a result", line: 3, column: 1, nesting: 0, type: "test", passed: true, skip: false, todo: false, failureType: null };
  assert.equal(nodeExecutionProof([file], [row]).passed, true);
  assert.equal(nodeExecutionProof([file, "test/missing.test.ts"], [row]).passed, false);
  assert.equal(nodeExecutionProof([file], [{ ...row, skip: "missing fixture" }]).passed, false);
  assert.equal(nodeExecutionProof([file], [{ ...row, passed: false, failureType: "cancelledByParent" }]).passed, false);
  assert.equal(nodeExecutionProof([file], [{ ...row, type: "suite" }]).passed, false);
  assert.equal(nodeExecutionProof([file], [{ ...row, name: file, line: undefined }]).passed, false);
  assert.equal(nodeExecutionProof([file], [row, { ...row, file: "test/unexpected.test.ts" }]).passed, false);
});

it("V5-INFRA-03 browser evidence reconciles discovered cases and rejects empty, flaky and skipped runs", () => {
  const entry = (status: string, results: unknown[] = [{ status: "passed" }]) => ({
    suites: [{ file: "nested/journey.spec.ts", specs: [{ id: "one", title: "checkout", file: "nested/journey.spec.ts", line: 4,
      tests: [{ projectName: "chromium", status, results }] }] }],
    stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 }, errors: []
  });
  const discovery = entry("skipped", []);
  const files = ["test/e2e/nested/journey.spec.ts"];
  assert.equal(browserExecutionProof(files, discovery, entry("expected")).passed, true);
  assert.equal(browserExecutionProof(files, discovery, entry("flaky")).passed, false);
  assert.equal(browserExecutionProof(files, discovery, entry("skipped")).passed, false);
  assert.equal(browserExecutionProof(files, discovery, entry("expected", [])).passed, false);
  assert.equal(browserExecutionProof(files, discovery, { suites: [], stats: { expected: 1 } }).passed, false);
});

it("V5-INFRA-04 test hygiene detects executable focus, quarantine, todo and empty tests without matching assertion strings", () => {
  for (const source of ["test.only('x', () => { check(); });", "test.describe.only('x', () => { check(); });", "it.todo('later');", "test('x', { skip: true }, () => { check(); });", "test('empty', () => {});", "test('[quarantined] regression', () => { check(); });"]) {
    assert.ok(testSourceHygiene(source, "fixture.test.ts").length > 0, source);
  }
  assert.deepEqual(testSourceHygiene("it('a result', () => { assert.equal(output, 'test.only('); });", "fixture.test.ts"), []);
});
