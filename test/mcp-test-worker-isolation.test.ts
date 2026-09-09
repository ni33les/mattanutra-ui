import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMatcherBatches } from "../scripts/run-matcher-test-suite.mjs";

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
