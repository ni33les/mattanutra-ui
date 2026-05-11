import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  requiredCapabilitiesForWorkTaskType,
  SYSTEM_AGENT_LIST,
  systemAgentForWorkTaskType
} from "../lib/system-agents.ts";
import { hasRequiredCapabilities } from "../lib/task-service-utils.ts";

describe("system agents", () => {
  it("defines a unique operational roster without OpenClaw", () => {
    const names = SYSTEM_AGENT_LIST.map((agent) => agent.name);

    assert.equal(new Set(names).size, names.length);
    assert.equal(names.includes("OpenClaw"), false);
    assert.deepEqual(
      names.sort(),
      [
        "Chat Dispatcher",
        "Communications Coordinator",
        "Content Publisher",
        "Email Dispatcher",
        "HealthScore Engine",
        "Human Reviewer",
        "Nutrition Plan Formulator",
        "Safety Scanner",
        "Scheduler"
      ].sort()
    );
  });

  it("routes each current work task to an agent with the required capability", () => {
    for (const taskType of [
      "analyze_healthscore",
      "content_status_change",
      "generate_example_formulation",
      "generate_formulation",
      "send_example_email",
      "send_reassessment_email"
    ]) {
      const agent = systemAgentForWorkTaskType(taskType);
      const required = requiredCapabilitiesForWorkTaskType(taskType);

      assert.equal(
        hasRequiredCapabilities(required, agent.capabilities),
        true,
        `${agent.name} should satisfy ${taskType}`
      );
    }
  });
});
