import assert from "node:assert/strict";
import { test } from "node:test";
import { agentCard } from "../../lib/agentic/contract/agent-card.ts";
import { toolList } from "../../lib/agentic/mcp/rpc.ts";
import { AGENTIC_CONTRACT_VERSION } from "../../lib/agentic/config.ts";
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
