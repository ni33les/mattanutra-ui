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
        "Food Guidance Engine",
        "HealthScore Engine",
        "Human Reviewer",
        "Nutrition Plan Advisor",
        "Nutrition Plan Formulator",
        "Product Matcher",
        "Safety Scanner",
        "Scheduler"
      ].sort()
    );
  });

  it("routes each current work task to an agent with the required capability", () => {
    for (const taskType of [
      "analyze_healthscore",
      "client_safety_followup",
      "content_status_change",
      "discover_products",
      "generate_example_food_guidance",
      "generate_example_supplement_guidance",
      "generate_food_guidance",
      "generate_nutrition_report",
      "generate_product_recommendations",
      "generate_supplement_guidance",
      "nutrition_plan_chat_reply",
      "parse_product_label",
      "refine_nutrition_plan",
      "refresh_marketplace_product",
      "send_example_email",
      "send_reassessment_email",
      "sync_digitalocean_billing"
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
