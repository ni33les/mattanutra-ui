import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { latencyProof } from "../lib/agentic/qa/proofs.ts";
import { infoTool } from "../lib/agentic/info.ts";
import { canonicalJson } from "./agentic/det-v3/harness.ts";
import {
  beginDetRun,
  createDetRuntime,
  endDetRun
} from "./agentic/det-v3/harness.ts";
import { handleQaJsonRpc } from "../lib/agentic/mcp/qa-dispatcher.ts";
import { TECH07_FIXED_BUDGET } from "../lib/agentic/qa/latency-score.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function queryBudget(proof: Record<string, unknown>) {
  return asRecord(proof.queryBudget);
}

describe("Slice B deterministic Technical/AX proof", () => {
  beforeEach(() => {
    beginDetRun("ax-proof");
  });
  afterEach(() => {
    endDetRun();
  });

  it("AX-RED-01 latencyProof contains queryBudget", async () => {
    const proof = asRecord(await latencyProof(createDetRuntime()));
    assert.equal(typeof proof.queryBudget, "object");
    assert.equal(proof.queryBudget == null, false);
  });

  it("AX-RED-02 plan.p95Ms exists numeric and <= 5000", async () => {
    const plan = asRecord(asRecord(await latencyProof(createDetRuntime())).plan);
    assert.equal(typeof plan.p95Ms, "number");
    assert.ok(Number(plan.p95Ms) <= TECH07_FIXED_BUDGET.p95BudgetMs);
  });

  it("AX-RED-03 plan.p50Ms exists numeric and <= 3000", async () => {
    const plan = asRecord(asRecord(await latencyProof(createDetRuntime())).plan);
    assert.equal(typeof plan.p50Ms, "number");
    assert.ok(Number(plan.p50Ms) <= TECH07_FIXED_BUDGET.p50BudgetMs);
  });

  it("AX-RED-04 zero sleeps and polling", async () => {
    const proof = asRecord(await latencyProof(createDetRuntime()));
    const budget = queryBudget(proof);
    assert.equal(proof.sleeps, 0);
    assert.equal(proof.polling, false);
    assert.equal(budget.sleeps, 0);
    assert.equal(budget.polling, false);
  });

  it("AX-RED-05 one hundred calls are byte-identical", async () => {
    const runtime = createDetRuntime();
    const first = canonicalJson(await latencyProof(runtime));
    for (let index = 0; index < 99; index += 1) {
      assert.equal(canonicalJson(await latencyProof(runtime)), first);
    }
  });

  it("AX-RED-06 two namespaces receive byte-identical proof", async () => {
    const runtime = createDetRuntime();
    const a = await handleQaJsonRpc(runtime, {
      id: 1,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: { runId: "A" }, name: "beginRun" }
    });
    const b = await handleQaJsonRpc(runtime, {
      id: 2,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: { runId: "B" }, name: "beginRun" }
    });
    const nsA = String(asRecord(asRecord(a?.result).structuredContent).namespace ?? asRecord(a?.result).namespace);
    const nsB = String(asRecord(asRecord(b?.result).structuredContent).namespace ?? asRecord(b?.result).namespace);
    assert.notEqual(nsA, nsB);
    const proofA = await handleQaJsonRpc(runtime, {
      id: 3,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: { namespace: nsA }, name: "latencyProof" }
    });
    await infoTool({ config: runtime.config });
    const proofB = await handleQaJsonRpc(runtime, {
      id: 4,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: { namespace: nsB }, name: "latencyProof" }
    });
    assert.equal(
      canonicalJson(asRecord(proofA?.result).structuredContent ?? proofA?.result),
      canonicalJson(asRecord(proofB?.result).structuredContent ?? proofB?.result)
    );
  });

  it("AX-RED-07 unrelated public calls do not change the proof", async () => {
    const runtime = createDetRuntime();
    const first = canonicalJson(await latencyProof(runtime));
    await infoTool({ config: runtime.config, locale: "en" });
    await infoTool({ config: runtime.config, locale: "th" });
    assert.equal(canonicalJson(await latencyProof(runtime)), first);
  });

  it("AX-RED-08 proof buildId equals the runtime build", async () => {
    const runtime = createDetRuntime();
    const proof = asRecord(await latencyProof(runtime));
    assert.equal(proof.buildId, runtime.config.buildId);
  });
});
