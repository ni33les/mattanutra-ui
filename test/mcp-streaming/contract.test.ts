import assert from "node:assert/strict";
import { test } from "node:test";
import { agentCard } from "../../lib/agentic/contract/agent-card.ts";
import { toolList } from "../../lib/agentic/mcp/rpc.ts";
import { AGENTIC_CONTRACT_VERSION } from "../../lib/agentic/config.ts";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
for (const locale of ["en", "th", "zh-CN"]) {
  test(`STREAM-DOC-${locale} says wait for the active call and poll only a returned processing result`, () => {
    const card = agentCard("dev", locale), tools = toolList("dev", locale);
    assert.equal(AGENTIC_CONTRACT_VERSION, "11.1.0");
    assert.equal(tools.length, 6);
    for (const text of [card, tools.find(t => t.name === "plan")!.description]) {
      assert.match(text, /Wait for the current tool call to finish/);
      assert.match(text, /Poll only if its final result says processing/);
      assert.match(text, /15 seconds/);
      assert.doesNotMatch(text, /automatically resume|background subscription/);
    }
  });
}
test("STREAM-DOC-publication generated tools and native schemas retain the baseline contract", () => {
  const baseline = JSON.parse(readFileSync(new URL("schema-baseline.json", import.meta.url), "utf8"));
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const native = toolList("dev", "en");
  assert.deepEqual(native.map(({ name, inputSchema, outputSchema }) => ({ name, inputSha256: hash(inputSchema), outputSha256: hash(outputSchema) })), baseline.schemas);
  for (const file of ["contract/mcp/11.1.0/tools.json", "public/.well-known/mcp.json", "lib/agentic/adapters/openai.json", "lib/agentic/adapters/anthropic.json", "lib/agentic/adapters/xai.json"]) {
    const published = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(published.contractVersion, baseline.contractVersion);
    assert.match(published.instructions, /Poll only if its final result says processing/);
    const plan = published.tools.find((row: { name: string }) => row.name === "plan"); assert.ok(plan, file);
    assert.match(plan.description, /Wait for the current tool call to finish/);
  }
});
