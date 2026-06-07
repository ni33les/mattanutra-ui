import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  requiredCapabilitiesForWorkTaskType,
  SYSTEM_AGENT_LIST,
  systemAgentForWorkTaskType
} from "../lib/system-agents.ts";
import { hasRequiredCapabilities } from "../lib/task-service-utils.ts";
import {
  RUNTIME_WORKER_CREDENTIAL_PROFILES,
  RUNTIME_WORKER_PROFILES
} from "../lib/worker-agent-credentials.ts";

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
        "Food Guidance Worker",
        "HealthScore Engine",
        "Human Reviewer",
        "Nutrition Plan Advisor",
        "Nutrition Plan Formulator",
        "Product Matcher",
        "Retail Stock Planner",
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
      "dispatch_chat_communication_message",
      "dispatch_email_communication_message",
      "generate_example_supplement_guidance",
      "generate_food_gap_guidance",
      "generate_food_guidance",
      "generate_nutrition_report",
      "generate_product_recommendations",
      "generate_supplement_guidance",
      "nutrition_plan_chat_reply",
      "refine_nutrition_plan",
      "retail_customer_order_allocate",
      "retail_stock_forecast_refresh",
      "retail_shopping_list_review",
      "route_admin_communication",
      "send_example_email",
      "send_reassessment_email",
      "send_retail_order_workflow_email",
      "source_product_fda_approvals",
      "source_product_identifiers",
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

  it("keeps human retail workflow tasks out of worker capability routing", () => {
    for (const taskType of [
      "retail_order_cancel_review",
      "retail_order_delivery_confirm",
      "retail_order_pack",
      "retail_order_pick",
      "retail_order_return_review",
      "retail_order_ship",
      "retail_stock_expiry_review",
      "retail_stock_low_stock_digest",
      "retail_stock_low_stock_review",
      "retail_stock_movement_review",
      "retail_stock_reorder_review"
    ]) {
      assert.deepEqual(requiredCapabilitiesForWorkTaskType(taskType), []);
    }
  });

  it("keeps inactive marketplace-era refresh tasks out of the active roster", () => {
    for (const inactiveTaskType of [
      "generate_example_food_guidance",
      "discover_products",
      "parse_product_label",
      "refresh_marketplace_product"
    ]) {
      assert.deepEqual(requiredCapabilitiesForWorkTaskType(inactiveTaskType), []);
    }
  });

  it("starts the stock planner from the default worker roster with membership-scoped keys", () => {
    const runner = readFileSync("workers/runner.ts", "utf8");
    const profiles = readFileSync("lib/worker-agent-credentials.ts", "utf8");

    assert.match(runner, /const WORKER_PROFILE_MODES = RUNTIME_WORKER_PROFILE_MODES/);
    assert.match(profiles, /RUNTIME_WORKER_PROFILES[\s\S]*"stock"/);
    assert.match(runner, /WORKER_STOCK_AGENT_API_KEYS/);
    assert.match(runner, /function workerAgentKeys/);
    assert.match(runner, /configs\.flatMap/);
    assert.match(runner, /runtimeWorkerProfileForMode\(mode\)/);
    assert.match(runner, /agentProfile\(runtimeProfile\.agentKey, runtimeProfile\.taskTypes\)/);
    assert.match(profiles, /"chat", "chatDispatcher"[\s\S]*"dispatch_chat_communication_message"/);
    assert.match(profiles, /"stock", "retailStockPlanner"[\s\S]*RETAIL_AGENT_EXECUTABLE_TASK_TYPES/);
    assert.doesNotMatch(runner, /"retail_order_ship"/);
    assert.doesNotMatch(runner, /"retail_purchase_order_receive"/);
  });

  it("keeps worker runtime env profiles centralized for auth and UAT seeding", () => {
    const envKeys = RUNTIME_WORKER_CREDENTIAL_PROFILES.map((profile) => profile.envKey);

    assert.deepEqual(envKeys.sort(), [
      "WORKER_ADVISOR_AGENT_API_KEY",
      "WORKER_CHAT_AGENT_API_KEY",
      "WORKER_COMMUNICATIONS_AGENT_API_KEY",
      "WORKER_CONTENT_AGENT_API_KEY",
      "WORKER_EMAIL_AGENT_API_KEY",
      "WORKER_FOOD_AGENT_API_KEY",
      "WORKER_FORMULATION_AGENT_API_KEY",
      "WORKER_HEALTHSCORE_AGENT_API_KEY",
      "WORKER_HOSTING_AGENT_API_KEY",
      "WORKER_PRODUCTS_AGENT_API_KEY",
      "WORKER_STOCK_AGENT_API_KEY"
    ].sort());
    assert.equal(
      RUNTIME_WORKER_CREDENTIAL_PROFILES.find(
        (profile) => profile.envKey === "WORKER_STOCK_AGENT_API_KEY"
      )?.role,
      "retail_agent"
    );

    for (const profile of RUNTIME_WORKER_PROFILES) {
      const agent = SYSTEM_AGENT_LIST.find(
        (candidate) => candidate.id === systemAgentForWorkTaskType(profile.taskTypes[0] ?? "").id
      );
      const required = profile.taskTypes.flatMap((taskType) =>
        requiredCapabilitiesForWorkTaskType(taskType)
      );

      assert.equal(Boolean(agent), true, `${profile.mode} must map to a system agent`);
      assert.equal(
        hasRequiredCapabilities(required, agent?.capabilities ?? []),
        true,
        `${profile.mode} must advertise every capability it claims`
      );
    }
  });
});
