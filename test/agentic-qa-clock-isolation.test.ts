import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { createAgenticRuntime } from "../lib/agentic/runtime.ts";
import {
  QA_PACK_CLOCK,
  activeQaClock,
  bindQaRuntime,
  putQaSessionForTests,
  resetQaSessions
} from "../lib/agentic/qa/session.ts";

function packSession() {
  return {
    acquisitionMinor: 0,
    attribution: "qa_campaign" as const,
    buildId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    catalogueChecksum: "b".repeat(64),
    catalogueVersion: "qa",
    frozenSnapshot: null,
    namespace: "qa-v3:clock-isolation",
    now: QA_PACK_CLOCK,
    principalScope: "qa-v3:clock-isolation",
    schemaChecksum: "c".repeat(64)
  };
}

describe("QA clock isolation from public MCP", () => {
  afterEach(() => {
    resetQaSessions();
  });

  it("QA-CLOCK-01 an unscoped public bind does not inherit the pack clock", () => {
    resetQaSessions();
    putQaSessionForTests(packSession());
    assert.equal(activeQaClock(), QA_PACK_CLOCK);
    const runtime = createAgenticRuntime({ config: loadAgenticConfig() });
    const bound = bindQaRuntime(
      runtime,
      new Request("https://dev.mattanutra.com/api/mcp"),
      null
    );
    assert.equal(bound.now, undefined);
    assert.notEqual(bound.now, QA_PACK_CLOCK);
  });

  it("QA-CLOCK-02 namespaced bind still uses the pack clock", () => {
    resetQaSessions();
    putQaSessionForTests(packSession());
    const runtime = createAgenticRuntime({ config: loadAgenticConfig() });
    const bound = bindQaRuntime(
      runtime,
      new Request("https://dev.mattanutra.com/api/mcp/qa", {
        headers: { "x-mattanutra-qa-namespace": "qa-v3:clock-isolation" }
      }),
      "qa-v3:clock-isolation"
    );
    assert.equal(bound.now, QA_PACK_CLOCK);
  });

  it("QA-CLOCK-03 public dispatcher does not fall back to the process QA clock", () => {
    const source = readFileSync(new URL("../lib/agentic/mcp/dispatcher.ts", import.meta.url), "utf8");
    assert.equal(source.includes("activeQaClock"), false);
  });
});
