import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMatcherBatches } from "../scripts/run-matcher-test-suite.mjs";
import { isolatedMcpClientHeaders } from "../scripts/mcp-test-target.mjs";
import { consumeRateLimit, rateLimitClientKey, resetRateLimitStoreForTests } from "../lib/rate-limit.ts";

test("MCP-INFRA-01 database concurrency fixtures have exclusive control of their execution owners", async () => {
  const evidence = mkdtempSync(join(tmpdir(), "mcp-worker-isolation-"));
  const events: string[] = [];
  let active = false;
  const common = { TEST_DB_URL: "isolated" };
  try {
    const results = await runMatcherBatches({ common, evidence,
      inventory: { files: ["client.test.ts", "ownership.integration.test.ts"], integration: ["ownership.integration.test.ts"] },
      args: [], runs: ["a", "b"],
      start: async () => {
        assert.equal(active, false); active = true; events.push("start");
        return { identity: { origin: "http://127.0.0.1:12345" }, stop: async () => { active = false; events.push("stop"); } };
      },
      batch: async (label: string, files: string[], env: Record<string, string>) => {
        events.push(label);
        if (label.includes("postgres")) {
          assert.equal(active, false, "An unrelated durable worker must not claim controlled PostgreSQL test tasks");
          assert.equal(env.MCP_URL, undefined);
          assert.deepEqual(files, ["ownership.integration.test.ts"]);
        } else {
          assert.equal(active, true);
          assert.equal(env.MCP_URL, "http://127.0.0.1:12345/api/mcp");
          assert.deepEqual(files, ["client.test.ts"]);
        }
        return { passed: true };
      }
    });
    assert.equal(results.length, 4);
    assert.deepEqual(events, ["start", "node-matcher-a", "stop", "node-matcher-postgres-a", "start", "node-matcher-b", "stop", "node-matcher-postgres-b"]);
    assert.deepEqual(common, { TEST_DB_URL: "isolated" });
  } finally { rmSync(evidence, { recursive: true, force: true }); }
});

test("MCP-INFRA-02 failed client execution releases its worker before propagating failure", async () => {
  const evidence = mkdtempSync(join(tmpdir(), "mcp-worker-failure-"));
  let stopped = 0;
  try {
    await assert.rejects(runMatcherBatches({ common: {}, evidence, inventory: { files: ["client.test.ts"], integration: [] }, args: [], runs: ["a"],
      start: async () => ({ identity: { origin: "http://127.0.0.1:12345" }, stop: async () => { stopped++; } }),
      batch: async () => { throw new Error("controlled client failure"); }
    }), /controlled client failure/);
    assert.equal(stopped, 1);
  } finally { rmSync(evidence, { recursive: true, force: true }); }
});

test("MCP-INFRA-03 independent isolated clients do not consume one another's request allowance", () => {
  const previous = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = "1";
  resetRateLimitStoreForTests();
  try {
    const key = (client: number) => rateLimitClientKey(new Request("http://127.0.0.1:12345/api/mcp", {
      headers: isolatedMcpClientHeaders({ isolatedCandidate: true }, client)
    }), "mcp-fixture");
    const config = { name: "mcp-fixture", limit: 2, windowMs: 60_000 };
    assert.equal(consumeRateLimit(key(101), config).allowed, true);
    assert.equal(consumeRateLimit(key(101), config).allowed, true);
    assert.equal(consumeRateLimit(key(101), config).allowed, false, "A single client retains the real request limit");
    assert.equal(consumeRateLimit(key(202), config).allowed, true, "Another test file represents a different client");
    assert.deepEqual(isolatedMcpClientHeaders({ isolatedCandidate: false }, 101), {}, "Never inject proxy identity when calling a deployed endpoint");
  } finally {
    resetRateLimitStoreForTests();
    if (previous === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = previous;
  }
});

test("FULL-CYCLE-06 full application execution starts a durable worker and releases it before controlled database cases", async () => {
  const full = await import("../scripts/run-full-test-suite.mjs");
  const run = (full as unknown as { runNodePair: (options: Record<string, unknown>) => Promise<unknown[]> }).runNodePair;
  assert.equal(typeof run, "function");
  const evidence = mkdtempSync(join(tmpdir(), "full-worker-isolation-"));
  const events: string[] = [];
  let active = false;
  try {
    const results = await run({ common: { MCP_URL: "http://127.0.0.1:3100/api/mcp" }, evidence, args: [],
      unitLabel: "node-application", postgresLabel: "node-postgres", httpLabel: "full-http",
      files: ["unit.test.ts", "client.test.ts", "ownership.integration.test.ts"], integration: ["ownership.integration.test.ts"],
      start: async () => { active = true; events.push("start"); return { identity: { origin: "http://127.0.0.1:12345" }, stop: async () => { active = false; events.push("stop"); } }; },
      batch: async (label: string, files: string[], env: Record<string, string>) => {
        events.push(label);
        if (label === "node-postgres") {
          assert.equal(active, false);assert.deepEqual(files, ["ownership.integration.test.ts"]);
          assert.equal(env.MCP_URL, "http://127.0.0.1:3100/api/mcp");
        } else {
          assert.equal(active, true);assert.deepEqual(files, ["unit.test.ts", "client.test.ts"]);
          assert.equal(env.MCP_URL, "http://127.0.0.1:12345/api/mcp");
        }
        return { passed: true };
      }
    });
    assert.equal(results.length, 2);
    assert.deepEqual(events, ["start", "node-application", "stop", "node-postgres"]);
  } finally { rmSync(evidence, { recursive: true, force: true }); }
});
