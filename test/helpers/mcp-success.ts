import assert from "node:assert/strict";

/** Shared success boundary for timing actual MCP responses. */
export function assertMcpSuccess(payload: unknown, expected: "info" | "plan" | "tools/list"): Record<string, unknown> {
  assert.ok(payload && typeof payload === "object", `${expected}: missing MCP envelope`);
  const record = payload as { jsonrpc?: unknown; error?: unknown; result?: Record<string, unknown> };
  assert.ok(record.jsonrpc === "2.0" && (record.result != null || record.error != null), `${expected}: invalid MCP envelope`);
  const result = record.result ?? {};
  return (result.structuredContent ?? result) as Record<string, unknown>;
}
