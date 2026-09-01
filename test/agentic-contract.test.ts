import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  AGENTIC_PUBLIC_TOOLS,
  AGENTIC_SERVER_INSTRUCTIONS,
  AGENTIC_TOOL_DESCRIPTIONS,
  AGENTIC_PRD_SERVER_INSTRUCTIONS,
  AGENTIC_PRD_TOOL_DESCRIPTIONS,
  AGENTIC_UAT_SERVER_INSTRUCTIONS,
  AGENTIC_INPUT_SCHEMAS,
  AGENTIC_TOOL_SCHEMAS,
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
    assert.equal(JSON.stringify(AGENTIC_TOOL_SCHEMAS).includes("intersex"), false);
    assert.equal(JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan).includes("unspecified"), false);
    assert.match(JSON.stringify(PLAN_INPUT_SCHEMA), /"sex"/);
    assert.equal(JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan), JSON.stringify(AGENTIC_INPUT_SCHEMAS.plan));
    assert.equal(Object.keys(AGENTIC_TOOL_DESCRIPTIONS).length, 6);
    const planRequest = JSON.stringify(AGENTIC_TOOL_SCHEMAS.plan);
    assert.match(planRequest, /info\.medicationCodes/);
    assert.match(planRequest, /info\.conditionCodes/);
    assert.match(planRequest, /excludeSupplementIds/);
    assert.match(planRequest, /name, amount, and unit/);
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
    assert.match(String(result.instructions), /plan, then execute/);
    assert.match(String(result.instructions), /Never prefix mattanutra_dev/);
    assert.equal(/D1-01 through D10-10/.test(String(result.instructions)), false);
    assert.equal(/\/api\/mcp\/qa/.test(String(result.instructions)), false);
    assert.equal(/dev-mcp-qa-token/.test(String(result.instructions)), false);
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

  it("uses live PRD instructions without Stripe Test Mode", async () => {
    const runtime = createAgenticRuntime({
      config: {
        ...createAgenticRuntime().config,
        environment: "prd",
        internalQaHarness: false,
        paymentProvider: "stripe_live",
        thailandRetailerAdapter: "thailand_live",
        capabilitySecret: "prd-test-capability-key-not-for-dev"
      }
    });
    const response = await handleJsonRpc(runtime, {
      id: 1,
      jsonrpc: "2.0",
      method: "initialize"
    });
    const result = rpcResult(response);
    assert.equal(result.instructions, AGENTIC_PRD_SERVER_INSTRUCTIONS);
    assert.match(String(result.instructions), /Polling is the only continuation method/);
    assert.match(String(result.instructions), /order\(orderHandle\)/);
    assert.equal(String(result.instructions).includes("Stripe Test Mode"), false);
    assert.equal(String(result.instructions).includes("4242"), false);
    assert.equal(String(result.instructions).includes("dev-mcp-qa-token"), false);
    assert.equal(AGENTIC_PRD_TOOL_DESCRIPTIONS.execute.includes("Stripe Test Mode"), false);
    const listed = await handleJsonRpc(runtime, { id: 2, method: "tools/list" });
    const execute = ((listed?.result?.tools as Array<{ description: string; name: string }>) ?? [])
      .find((tool) => tool.name === "execute");
    assert.equal(execute?.description.includes("Stripe Test Mode"), false);
    assert.equal((result.serverInfo as { name: string }).name, "MattaNutra");
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
      assert.match(schema, /"additionalProperties":false/);
      if (tool.name === "plan") {
        assert.match(schema, /"oneOf"/);
        continue;
      }
      assert.equal(/"oneOf"/.test(schema), false);
      assert.equal(/\$defs/.test(schema), false);
    }

    const plan = tools.find((tool) => tool.name === "plan");
    const planSchema = JSON.stringify(plan?.inputSchema);
    assert.match(planSchema, /"medicationCodes"/);
    assert.match(planSchema, /"conditionCodes"/);
    assert.match(planSchema, /"ageYears"/);
    assert.match(planSchema, /"lifeStage"/);
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
