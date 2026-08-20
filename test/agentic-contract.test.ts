import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  AGENTIC_PUBLIC_TOOLS,
  AGENTIC_SERVER_INSTRUCTIONS,
  AGENTIC_TOOL_DESCRIPTIONS,
  AGENTIC_TOOL_SCHEMAS,
  validateToolInput
} from "../lib/agentic/contract/index.ts";
import { handleJsonRpc } from "../lib/agentic/mcp/dispatcher.ts";
import { createAgenticRuntime } from "../lib/agentic/runtime.ts";

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
    assert.equal(Object.keys(AGENTIC_TOOL_DESCRIPTIONS).length, 6);
  });

  it("keeps the checked-in contract snapshot in sync", () => {
    const snapshot = JSON.parse(
      readFileSync(new URL("../contract/mcp/3.0.0/tools.json", import.meta.url), "utf8")
    ) as {
      tools: Array<{ description: string; inputSchema: unknown; name: string }>;
    };

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

    assert.ok(response);
    assert.equal(response.result.instructions, AGENTIC_SERVER_INSTRUCTIONS);
    assert.equal(response.result.serverInfo.version, "3.0.0");
  });

  it("tools/list returns the six schemas with additionalProperties false", async () => {
    const runtime = createAgenticRuntime();
    const response = await handleJsonRpc(runtime, {
      id: 2,
      method: "tools/list"
    });
    const names = response.result.tools.map((tool: { name: string }) => tool.name);

    assert.deepEqual(names, [...AGENTIC_PUBLIC_TOOLS]);

    for (const tool of response.result.tools) {
      const schema = JSON.stringify(tool.inputSchema);
      assert.match(schema, /"additionalProperties":false/);
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
      const issue = validateToolInput(AGENTIC_TOOL_SCHEMAS[name], payload);
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
    const payload = JSON.stringify(response.result.structuredContent);

    assert.equal(response.result.structuredContent.ok, true);
    assert.doesNotMatch(payload, /sandbox/i);
    assert.doesNotMatch(payload, /simulate/i);
    assert.equal(response.result.structuredContent.continuation, "polling_only");
  });
});
