import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  retailCommandIds,
  retailCommandRegistry,
  retailRouteCommandIds
} from "../lib/retail-command-registry.ts";

const route = readFileSync("app/api/admin/retail-stock/route.ts", "utf8");
const taskExecution = readFileSync("lib/task-execution.ts", "utf8");
const taskWorkItems = readFileSync("lib/task-work-items.ts", "utf8");
const service = readFileSync("lib/admin-retail-stock.ts", "utf8");

const routeActions = [
  "advance_customer_order",
  "allocate_customer_order",
  "create_customer_order",
  "create_shopping_list",
  "record_stock_movement",
  "reconcile_customer_order_lifecycle",
  "reopen_shopping_list",
  "set_stock_status",
  "update_shopping_list",
  "upsert_stock_item",
  "void_stock_movement"
].sort();

describe("retail command registry", () => {
  it("classifies every retail stock route mutation", () => {
    assert.deepEqual([...retailRouteCommandIds].sort(), routeActions);
    assert.match(route, /executeRetailCommand/);
    assert.match(route, /retailStockRouteHandlers/);
    assert.doesNotMatch(route, /if \(action === "upsert_stock_item"/);
    assert.doesNotMatch(route, /if \(action === "record_stock_movement"/);
    assert.doesNotMatch(route, /if \(action === "advance_customer_order"/);

    for (const action of routeActions) {
      assert.match(route, new RegExp(`${action}\\(context, body\\)`));
    }
  });

  it("requires policy, observability, idempotency, and actor metadata on every command", () => {
    for (const commandId of retailCommandIds) {
      const command = retailCommandRegistry[commandId];

      assert.equal(command.id, commandId);
      assert.ok(command.allowedActorKinds.length > 0, `${commandId} actor policy`);
      assert.match(command.auditEvent, /^admin\.retail_command\./);
      assert.match(command.bpmEvent, /^retail_command_/);
      assert.ok(command.idempotencyStrategy, `${commandId} idempotency`);
      assert.equal(command.permission, "stock.write");
      assert.ok(command.resourceType, `${commandId} resource type`);
      assert.ok(command.riskClass, `${commandId} risk class`);
      assert.ok(command.taskPolicy, `${commandId} task policy`);

      if (command.agentExecution === "execute_low_risk") {
        assert.ok(command.allowedActorKinds.includes("agent"), `${commandId} agent actor`);
        assert.ok(command.requiredAgentCapability, `${commandId} capability`);
        assert.notEqual(command.taskPolicy, "admin_bypass");
        assert.ok(command.taskTypes.length > 0, `${commandId} task types`);
      }
    }
  });

  it("keeps physical-world and price-changing actions non-agent-executable", () => {
    assert.deepEqual(
      [...retailCommandRegistry.advance_customer_order.taskTypes].sort(),
      [
        "retail_order_cancel_review",
        "retail_order_delivery_confirm",
        "retail_order_pack",
        "retail_order_pick",
        "retail_order_return_review",
        "retail_order_ship"
      ].sort()
    );

    for (const commandId of [
      "advance_customer_order",
      "create_shopping_list",
      "record_stock_movement",
      "reopen_shopping_list",
      "set_stock_status",
      "update_shopping_list",
      "upsert_stock_item",
      "void_stock_movement"
    ] as const) {
      assert.notEqual(
        retailCommandRegistry[commandId].agentExecution,
        "execute_low_risk",
        `${commandId} must not be executable by agents`
      );
    }
  });

  it("routes agent retail tasks through the command executor instead of passive acceptance", () => {
    assert.match(taskExecution, /executeRetailAgentCommand/);
    assert.doesNotMatch(taskExecution, /humanApprovalRequired: true/);
    assert.match(taskWorkItems, /isRetailAgentExecutableTaskType/);
    assert.match(taskWorkItems, /human-only or not agent-executable/);
    assert.match(service, /assertRetailAgentCommandTask/);
    assert.match(service, /Retail task \$\{input\.taskType\} is not agent-executable/);
    assert.match(service, /commandId === "allocate_customer_order"/);
    assert.match(service, /commandId === "sync_order_shortages_to_shopping_list"/);
    assert.match(service, /commandId === "refresh_stock_reorder_advice"/);
    assert.match(
      readFileSync("lib/retail-command-registry.ts", "utf8"),
      /Retail command task is missing an idempotency key/
    );
  });
});
