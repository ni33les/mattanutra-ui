import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  AGENTIC_PUBLIC_TOOLS,
  AGENTIC_SERVER_INSTRUCTIONS,
  AGENTIC_TOOL_DESCRIPTIONS,
  AGENTIC_UAT_SERVER_INSTRUCTIONS,
  AGENTIC_INPUT_SCHEMAS,
  AGENTIC_TOOL_SCHEMAS,
  PLAN_ADVERTISED_SCHEMA,
  PLAN_INPUT_SCHEMA,
  validateToolInput
} from "../lib/agentic/contract/index.ts";
import {
  handleJsonRpc,
  type JsonRpcResponse
} from "../lib/agentic/mcp/dispatcher.ts";
import { createAgenticRuntime } from "../lib/agentic/runtime.ts";

function rpcResult(response: JsonRpcResponse | null) {
  assert.ok(response);
  assert.ok(response.result && typeof response.result === "object");
  return response.result;
}

describe("agentic MCP contract 3.0.0", () => {
  it("exposes exactly six public tools", () => {
    assert.deepEqual([...AGENTIC_PUBLIC_TOOLS], [
      "info",
      "plan",
      "execute",
      "order",
      "support",
      "feedback"
    ]);
    assert.equal(Object.keys(AGENTIC_TOOL_SCHEMAS).length, 6);
    assert.equal(JSON.stringify(AGENTIC_TOOL_SCHEMAS).includes("sexAtBirth"), false);
    assert.match(JSON.stringify(PLAN_INPUT_SCHEMA), /"sex"/);
    assert.equal(/"oneOf"/.test(JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan)), false);
    assert.equal(/\$defs/.test(JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan)), false);
    assert.equal(Object.keys(AGENTIC_TOOL_DESCRIPTIONS).length, 6);
  });

  it("keeps the checked-in contract snapshot in sync", () => {
    const snapshot = JSON.parse(
      readFileSync(new URL("../contract/mcp/3.0.0/tools.json", import.meta.url), "utf8")
    ) as {
      instructions?: string;
      tools: Array<{ description: string; inputSchema: unknown; name: string }>;
    };

    assert.equal(snapshot.instructions, AGENTIC_SERVER_INSTRUCTIONS);
    assert.deepEqual(
      snapshot.tools.map((tool) => tool.name),
      [...AGENTIC_PUBLIC_TOOLS]
    );

    for (const tool of snapshot.tools) {
      assert.deepEqual(
        tool.inputSchema,
        AGENTIC_TOOL_SCHEMAS[tool.name as keyof typeof AGENTIC_TOOL_SCHEMAS]
      );
      assert.equal(
        tool.description,
        AGENTIC_TOOL_DESCRIPTIONS[tool.name as keyof typeof AGENTIC_TOOL_DESCRIPTIONS]
      );
    }
  });

  it("initialize reports contract instructions and version", async () => {
    const runtime = createAgenticRuntime();
    const response = await handleJsonRpc(runtime, {
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26"
      }
    });

    const result = rpcResult(response);
    assert.equal(result.instructions, AGENTIC_SERVER_INSTRUCTIONS);
    assert.match(
      String(result.instructions),
      /HARD RULE 1 — OFFICIAL PACK SCORING/
    );
    assert.match(String(result.instructions), /D1-01 through D10-10/);
    assert.match(String(result.instructions), /12-row happy-path/);
    assert.match(String(result.instructions), /first reply/);
    assert.match(String(result.instructions), /100 minus FAIL count/);
    assert.match(String(result.instructions), /Zero FAIL means 100\/100/);
    assert.match(String(result.instructions), /STOP\. FIRST REPLY RULE/);
    assert.match(String(result.instructions), /line 1 of your FIRST reply MUST be exactly: Official MattaNutra DEV QA Pack/);
    assert.match(String(result.instructions), /Do not mark D1-09, D5-07, D5-09, D7-09, D7-10, or D10-10 as NOT TESTED/);
    assert.match(String(result.instructions), /medicationCodes=\["apixaban"\]/);
    assert.match(String(result.instructions), /conditionCodes=\["ckd"\]/);
    assert.match(String(result.instructions), /You MUST call D5-07 and D5-09/);
    assert.match(String(result.instructions), /info\.schemaChecksum/);
    assert.match(String(result.instructions), /scenario=refund/);
    assert.match(String(result.instructions), /two different idempotencyKeys/);
    assert.match(String(result.instructions), /HARD RULE 5 — DEV INTERNAL EVIDENCE/);
    assert.match(String(result.instructions), /\/api\/mcp\/qa/);
    assert.match(String(result.instructions), /never raw order IDs/);
    assert.match(String(result.instructions), /info\.latency is present on every DEV info response/);
    assert.match(String(result.instructions), /HARD RULE 2 — DEV CHECKOUT FORM POST/);
    assert.match(String(result.instructions), /unpaid order is not complete/);
    assert.match(String(result.instructions), /Never prefix mattanutra_dev/);
    assert.match(String(result.instructions), /mattanutra_dev\.mattanutra_dev\.\*/);
    assert.match(String(result.instructions), /application\/x-www-form-urlencoded/);
    assert.match(String(result.instructions), /customerName, phone, customerEmail, addressLine1/);
    assert.match(String(result.instructions), /scenario=decline_insufficient_funds/);
    assert.match(String(result.instructions), /scenario=success/);
    assert.match(String(result.instructions), /HARD RULE 4 — REMAINING PACK CASES/);
    assert.match(String(result.instructions), /lifeStage=pregnant/);
    assert.match(String(result.instructions), /Folate/);
    assert.match(String(result.instructions), /planHandle stays valid 7 days/);
    assert.match(String(result.instructions), /scenario=expire/);
    assert.match(String(result.instructions), /scenario=three_ds_cancelled/);
    assert.match(String(result.instructions), /acknowledge_safety/);
    assert.match(String(result.instructions), /revision_conflict/);
    assert.match(String(result.instructions), /HARD RULE 6 — HOST FEEDBACK/);
    assert.match(String(result.instructions), /plan_feedback/);
    assert.match(String(result.instructions), /Official MattaNutra Agentic QA Pack/);
    assert.match(String(result.instructions), /A1–A13 = 13\/13/);
    assert.match(String(result.instructions), /A9 is GET-only/);
    assert.match(String(result.instructions), /leftover not_in_catalogue/);
    assert.equal(
      (result.serverInfo as { version: string }).version,
      "3.0.0"
    );
    assert.equal((result.serverInfo as { name: string }).name, "mattanutra_dev");
  });

  it("uses polling-only UAT instructions without the DEV harness", async () => {
    const runtime = createAgenticRuntime({
      config: {
        ...createAgenticRuntime().config,
        environment: "uat",
        internalQaHarness: false,
        paymentProvider: "stripe_test",
        thailandRetailerAdapter: "thailand_uat",
        capabilitySecret: "uat-test-capability-key-not-for-dev"
      }
    });
    const response = await handleJsonRpc(runtime, {
      id: 1,
      jsonrpc: "2.0",
      method: "initialize"
    });
    const result = rpcResult(response);
    assert.equal(result.instructions, AGENTIC_UAT_SERVER_INSTRUCTIONS);
    assert.match(String(result.instructions), /Polling is the only continuation method/);
    assert.match(String(result.instructions), /order\(orderHandle\)/);
    assert.match(String(result.instructions), /Stripe Test Mode/);
    assert.match(String(result.instructions), /HARD RULE 6 — HOST FEEDBACK/);
    assert.match(String(result.instructions), /after 3 plan calls/);
    assert.match(String(result.instructions), /plan_feedback/);
    assert.equal(String(result.instructions).includes("dev-mcp-qa-token"), false);
    assert.equal(String(result.instructions).includes("scenario=decline_insufficient_funds"), false);
    const listed = await handleJsonRpc(runtime, { id: 2, method: "tools/list" });
    const names = ((listed?.result?.tools as Array<{ name: string }>) ?? []).map(
      (item) => item.name
    );
    assert.deepEqual(names, [...AGENTIC_PUBLIC_TOOLS]);
    assert.equal((result.serverInfo as { name: string }).name, "mattanutra_uat");
  });

  it("accepts bare, single-prefixed and double-prefixed tools/call names", async () => {
    const runtime = createAgenticRuntime();

    for (const name of AGENTIC_PUBLIC_TOOLS) {
      for (const called of [
        name,
        `mattanutra_dev.${name}`,
        `mattanutra_dev.mattanutra_dev.${name}`
      ]) {
        const response = await handleJsonRpc(runtime, {
          id: 1,
          method: "tools/call",
          params: { arguments: {}, name: called }
        });
        assert.notEqual(
          response?.error?.code,
          -32601,
          `${called} must not be Unknown tool`
        );
        assert.notEqual(
          response?.error?.code,
          -32001,
          `${called} must not be client-catalog -32001`
        );
        assert.ok(response?.result, `${called} must dispatch`);
      }
    }
  });

  it("tools/list advertises shallow commercial envelopes", async () => {
    const runtime = createAgenticRuntime();
    const response = await handleJsonRpc(runtime, {
      id: 2,
      method: "tools/list"
    });
    const result = rpcResult(response);
    const tools = result.tools as Array<{ inputSchema: unknown; name: string }>;
    const names = tools.map((tool) => tool.name);

    assert.deepEqual(names, [...AGENTIC_PUBLIC_TOOLS]);

    for (const tool of tools) {
      const schema = JSON.stringify(tool.inputSchema);
      if (tool.name === "info") {
        assert.match(schema, /"additionalProperties":false/);
        continue;
      }
      assert.match(schema, /"additionalProperties":true/);
      assert.equal(/"oneOf"/.test(schema), false);
      assert.equal(/\$defs/.test(schema), false);
    }
  });

  it("rejects unexpected properties on every tool", () => {
    const samples: Array<[keyof typeof AGENTIC_TOOL_SCHEMAS, Record<string, unknown>]> = [
      ["info", { locale: "en", sandboxProof: true }],
      ["order", { orderHandle: "x".repeat(32), orderId: "ord_1" }],
      ["execute", {
        expectedRevision: 1,
        idempotencyKey: "k".repeat(16),
        planHandle: "h".repeat(32),
        productIds: ["prd_1"]
      }],
      ["feedback", {
        consentConfirmed: true,
        expectedRevision: 1,
        idempotencyKey: "k".repeat(16),
        planHandle: "h".repeat(32),
        transcript: "nope"
      }]
    ];

    for (const [name, payload] of samples) {
      const issue = validateToolInput(AGENTIC_INPUT_SCHEMAS[name], payload);
      assert.equal(issue?.reasonCode, "unexpected_property", name);
    }
  });

  it("info never advertises QA mutation controls", async () => {
    const runtime = createAgenticRuntime();
    const response = await handleJsonRpc(runtime, {
      id: 3,
      method: "tools/call",
      params: { arguments: {}, name: "info" }
    });
    const content = rpcResult(response).structuredContent as Record<string, unknown>;
    const payload = JSON.stringify(content);

    assert.equal(content.ok, true);
    assert.doesNotMatch(payload, /sandbox/i);
    assert.doesNotMatch(payload, /simulate/i);
    assert.equal(content.continuation, "polling_only");
  });
});
