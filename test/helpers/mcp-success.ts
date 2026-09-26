import assert from "node:assert/strict";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Shared success boundary for timing actual structured MCP responses. */
export function assertMcpSuccess(payload: unknown, expected: "info" | "plan" | "tools/list"): Record<string, unknown> {
  assert.ok(record(payload), `${expected}: missing MCP envelope`);
  assert.equal(payload.jsonrpc, "2.0", `${expected}: invalid MCP version`);
  assert.equal(payload.error, undefined, `${expected}: JSON-RPC error is not a successful measurement`);
  const result = payload.result;
  assert.ok(record(result), `${expected}: missing MCP result`);
  assert.ok(result.isError === undefined || result.isError === false, `${expected}: tool error is not a successful measurement`);
  if (expected === "tools/list") {
    assert.ok(Array.isArray(result.tools) && result.tools.length > 0, "tools/list: missing tool discovery");
    assert.ok(result.tools.every(tool => record(tool) && typeof tool.name === "string" && tool.name.trim().length > 0),
      "tools/list: malformed tool discovery");
    return result;
  }
  const business = result.structuredContent;
  assert.ok(record(business), `${expected}: missing structured business payload`);
  assert.equal(business.ok, true, `${expected}: business rejection is not a successful measurement`);
  return business;
}
