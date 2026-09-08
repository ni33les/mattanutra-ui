import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { toolResult } from "../../lib/agentic/mcp/rpc.ts";
import { baseline } from "../mcp-payload/fixtures.ts";
import { projectPlan } from "../../lib/agentic/presentation/plan.ts";
test("conversation_text_is_a_short_summary", () => {
  const value = projectPlan(baseline.cases[0].plan, { responseView: "conversation" });
  value.questions = [{ questionId: "long-question", prompt: "Customer details ".repeat(80), promptKey: "long-question", choices: [] }];
  const result = process.env.MCP_HOSTED_RESPONSE ? JSON.parse(readFileSync(process.env.MCP_HOSTED_RESPONSE, "utf8")) : toolResult(value);
  const text = result.content.map((row: { text: string }) => row.text).join("\n");
  assert.ok(text.length < 800); assert.equal(result.content.length, 1); assert.match(text, /Next:/);
  assert.notEqual(text, JSON.stringify(result.structuredContent)); assert.ok(Buffer.byteLength(JSON.stringify(result)) < 22000);
  const long = { ...value, summary: "An option with disclosed trade-offs. ".repeat(80) };
  const bounded = toolResult(long);
  assert.ok(bounded.content[0].text.length < 800); assert.match(bounded.content[0].text, /Next:/);
  assert.equal(bounded.structuredContent.summary, long.summary);
});
test("status_body_stays_tiny", () => {
  const value = { ok: true, responseView: "status", planHandle: "cap_" + "x".repeat(650), revision: 2, status: "processing", operationStatus: "running", nextActions: ["poll_plan"], resultVersion: "v".repeat(64) };
  const result = toolResult(value); assert.ok(Buffer.byteLength(JSON.stringify(result)) < 2000);
  assert.ok(!("options" in result.structuredContent) && !("advice" in result.structuredContent));
});
