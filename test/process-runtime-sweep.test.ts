import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

function functionBody(source: string, functionName: string) {
  const signature = new RegExp(
    `(?:export\\s+)?(?:async\\s+)?function\\s+${functionName}\\s*\\(`
  );
  const match = signature.exec(source);

  assert.ok(match, `${functionName} was not found`);

  const bodyMatch = /\)\s*(?::[^{]+)?\{/.exec(source.slice(match.index));

  assert.ok(bodyMatch, `${functionName} has no body`);

  const bodyStart =
    match.index + bodyMatch.index + bodyMatch[0].lastIndexOf("{");
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(bodyStart + 1, index);
      }
    }
  }

  throw new Error(`${functionName} body was not closed`);
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);

      return entry.isDirectory() ? filesUnder(path) : [path];
    })
  );

  return files.flat().filter((file) => /\.(mjs|ts|tsx)$/.test(file));
}

describe("process runtime technical debt sweep", () => {
  it("keeps paid checkout order creation wired to allocation, admin notifications, and customer email tasks", async () => {
    const checkout = await readFile("lib/retail-product-checkout.ts", "utf8");
    const createOrder = functionBody(checkout, "createRetailCustomerOrderFromPayment");
    const fulfillPayment = functionBody(checkout, "fulfillRetailCheckoutPayment");

    assert.match(
      createOrder,
      /const initialStatus = quoteLines\.some\(\(line\) => line\.etaDate\)[\s\S]*\? "awaiting_stock"[\s\S]*: "placed"/,
      "checkout orders with ETA/backorder lines must start awaiting stock"
    );
    assert.match(
      createOrder,
      /taskType: "retail_customer_order_allocate"/,
      "paid checkout orders must create the allocation task"
    );
    assert.match(
      createOrder,
      /requiredCapabilities: \[AGENT_CAPABILITIES\.retailStockPolicyReview\]/,
      "paid checkout allocation tasks must be worker-capability backed"
    );
    assert.match(createOrder, /eventKey: "retail_order_created"/);
    assert.match(createOrder, /eventKey: "retail_order_awaiting_stock"/);
    assert.match(fulfillPayment, /await recordRetailCheckoutFinance/);
    assert.match(fulfillPayment, /event: "confirmed"/);
    assert.match(
      fulfillPayment,
      /if \(orderStatus === "awaiting_stock"\)[\s\S]*event: "awaiting_stock"/,
      "awaiting-stock checkout orders must queue a customer-visible email task"
    );
  });

  it("keeps no-stock allocation repairing reorder advice without auto-creating shopping lists", async () => {
    const stock = await readFile("lib/admin-retail-stock.ts", "utf8");
    const allocate = functionBody(stock, "allocateRetailCustomerOrder");
    const adviceRepair = functionBody(
      stock,
      "ensureRetailOrderShortagesInReorderAdvice"
    );

    assert.match(allocate, /queueCustomerOrderStockGapTasks/);
    assert.match(allocate, /ensureRetailOrderShortagesInReorderAdvice/);
    assert.match(allocate, /set status = 'awaiting_stock'/);
    assert.match(allocate, /eventName: "retail_order_awaiting_stock"/);
    assert.match(allocate, /eventKey: "retail_order_awaiting_stock"/);
    assert.match(allocate, /event: "awaiting_stock"/);
    assert.match(
      allocate,
      /No live stock is available to allocate/,
      "no-stock allocation should block fulfillment while leaving shortage work visible"
    );
    assert.match(
      adviceRepair,
      /source: "retail_order_shortage_reorder_advice"[\s\S]*refreshRetailStockReorderAdvice/,
      "shortage sync should create/refresh reorder advice for zero-stock order demand"
    );
    assert.doesNotMatch(
      adviceRepair,
      /insert into public\.retail_shopping_lists|insert into public\.retail_shopping_list_lines/,
      "shortage sync must not create shopping lists until a human selects advice rows"
    );
  });

  it("keeps shopping-list saves as stock movement deltas and retries retailer allocation", async () => {
    const stock = await readFile("lib/admin-retail-stock.ts", "utf8");
    const route = await readFile("app/api/admin/retail-stock/route.ts", "utf8");
    const view = await readFile("components/admin/retail-stock-view.tsx", "utf8");
    const modal = await readFile(
      "components/admin/retail-shopping-list-modal.tsx",
      "utf8"
    );
    const updateList = functionBody(stock, "updateRetailShoppingList");
    const movementRecorder = functionBody(stock, "recordRetailStockMovement");
    const allocate = functionBody(stock, "allocateRetailCustomerOrder");

    assert.match(updateList, /const delta = actualQuantity - stockedQuantity/);
    assert.match(updateList, /movementType: delta > 0 \? "receive" : "adjustment"/);
    assert.match(updateList, /Shopping list stock count saved/);
    assert.match(updateList, /Shopping list stock count reduced/);
    assert.match(updateList, /releaseRetailStockOverAllocationsAfterStockCount/);
    assert.match(updateList, /stocked_quantity = \$\{actualQuantity\}/);
    assert.match(updateList, /const savedStatus: RetailShoppingListStatus = "closed"/);
    assert.match(updateList, /status = \$\{savedStatus\}/);
    assert.match(updateList, /requestedStatus: input\.status \? shoppingListStatus\(input\.status\) : null/);
    assert.match(route, /return value === "active" \? "active" : "closed"/);
    assert.match(route, /responseModeValue/);
    assert.match(view, /async function saveShoppingListDraft\(\)/);
    assert.match(view, /responseMode: "minimal"/);
    assert.match(view, /refreshRetailStockData\(\)\.catch/);
    assert.match(view, /status: "closed"/);
    assert.doesNotMatch(modal, /Close list/);
    assert.match(updateList, /where id = any\(\$\{lineIds\}::uuid\[\]\)/);
    assert.match(updateList, /deferReorderSideEffects: true/);
    assert.match(updateList, /awaitingOrderRows[\s\S]*allocateRetailCustomerOrder/);
    assert.match(
      updateList,
      /retail_customer_order_lines\.product_id = any\(\$\{changedProductIds\}::uuid\[\]\)[\s\S]*allocateRetailCustomerOrder/,
      "shopping-list save should retry allocation only for orders containing changed products"
    );
    assert.match(updateList, /productIds: changedProductIds/);
    assert.match(updateList, /refreshedReorderAdviceCount/);
    assert.match(
      allocate,
      /fullyAllocated[\s\S]*ensureRetailOrderShortagesInReorderAdvice/,
      "partial allocations after short-bought lists must repair reorder advice"
    );
    assert.match(
      movementRecorder,
      /if \(!input\.deferReorderSideEffects\)[\s\S]*refreshRetailStockReorderAdvice\(\{[\s\S]*stockId: recordedStockRow\.id/,
      "standalone movements should still recalculate advice, while shopping-list batches can defer it"
    );
  });

  it("repairs stale allocations before orders can be packed or shipped", async () => {
    const stock = await readFile("lib/admin-retail-stock.ts", "utf8");
    const carrier = await readFile("lib/retail-carrier-shipments.ts", "utf8");
    const customerOrderDisplay = await readFile(
      "components/admin/retail-stock/customer-order-display-model.ts",
      "utf8"
    );
    const pipeline = functionBody(stock, "getRetailStockPipeline");
    const actionStates = functionBody(stock, "getRetailCustomerOrderActionStates");
    const stockRepair = functionBody(stock, "repairRetailStockAllocationIntegrity");
    const orderRepair = functionBody(stock, "repairCustomerOrderAllocationIntegrity");
    const movementRecorder = functionBody(stock, "recordRetailStockMovement");
    const upsertStock = functionBody(stock, "upsertRetailStockItem");
    const setStatus = functionBody(stock, "setRetailStockStatus");
    const reconcile = functionBody(stock, "reconcileRetailOrderLifecycle");
    const advance = functionBody(stock, "advanceRetailCustomerOrder");
    const carrierShip = functionBody(carrier, "markOrderShippedFromCarrierEvent");

    assert.match(stock, /backedAllocatedUnits: number/);
    assert.match(pipeline, /const otherActiveAllocatedUnits = Math\.max/);
    assert.match(pipeline, /const stockPotentiallyBackingThisLine = Math\.max/);
    assert.match(pipeline, /const backedAllocatedUnits = Math\.min\(/);
    assert.match(
      pipeline,
      /customerDemandUnits - backedAllocatedUnits - availableNowUnits/,
      "stale allocated quantities must become unordered demand when stock is gone"
    );
    assert.match(actionStates, /pipeline\.backedAllocatedUnits >= pipeline\.customerDemandUnits/);
    assert.match(actionStates, /Allocated stock is no longer available\. Recheck workflow\./);
    assert.match(stock, /!orderPipelineFullyBacked\(pipeline\)[\s\S]*\? "awaiting_stock"/);
    assert.match(customerOrderDisplay, /order\.workflowStage === "awaiting_stock"/);
    assert.match(stockRepair, /retail_customer_orders\.status in \('placed', 'awaiting_stock', 'allocated', 'picking', 'packed'\)/);
    assert.match(stockRepair, /status = 'awaiting_stock'/);
    assert.match(stockRepair, /admin\.retail_stock_allocations_released/);
    assert.match(orderRepair, /ensureRetailOrderShortagesInReorderAdvice/);
    assert.match(orderRepair, /cancelStaleOrderWorkflowTasks/);
    assert.match(orderRepair, /taskType: "retail_shopping_list_review"/);
    assert.match(upsertStock, /repairRetailStockAllocationIntegrity[\s\S]*source: "admin_stock_update"/);
    assert.match(setStatus, /repairRetailStockAllocationIntegrity[\s\S]*source: "stock_status_changed"/);
    assert.match(movementRecorder, /delta < 0 && !input\.deferAllocationIntegrityRepair/);
    assert.match(reconcile, /source: "order_lifecycle_recheck"/);
    assert.match(advance, /source: "ship_order_preflight"/);
    assert.match(advance, /Stock changed after allocation\. The order has been moved back to Awaiting Stock\./);
    assert.match(advance, /deferAllocationIntegrityRepair: true/);
    assert.match(carrier, /repairRetailCustomerOrderAllocationIntegrityForSystem/);
    assert.match(carrierShip, /source: "carrier_event_ship_preflight"/);
  });

  it("keeps shipping one-click while preserving legacy pick-pack cleanup", async () => {
    const workflow = await readFile("lib/retail-order-workflow.ts", "utf8");
    const stock = await readFile("lib/admin-retail-stock.ts", "utf8");
    const advance = functionBody(stock, "advanceRetailCustomerOrder");

    assert.match(
      workflow,
      /mark_shipped:[\s\S]*requiredTaskTypes: \["retail_order_ship"\]/,
      "shipping eligibility should be centered on the ship task"
    );
    assert.match(advance, /input\.action === "mark_shipped"[\s\S]*"retail_order_pick"[\s\S]*"retail_order_pack"[\s\S]*"retail_order_ship"/);
    assert.match(advance, /movementType: "sale"/);
    assert.match(advance, /'\{shipment\}'/);
    assert.match(advance, /eventName: "retail_order_picking"[\s\S]*implicit: true/);
    assert.match(advance, /eventName: "retail_order_packed"[\s\S]*implicit: true/);
    assert.match(advance, /mark_shipped"[\s\S]*\? "retail_order_shipped"/);
  });

  it("keeps human retail workflow tasks out of worker reservation and execution", async () => {
    const runner = await readFile("workers/runner.ts", "utf8");
    const execution = await readFile("lib/task-execution.ts", "utf8");
    const taskService = await readFile("lib/task-service.ts", "utf8");
    const registry = await readFile("lib/retail-command-registry.ts", "utf8");
    const policy = await readFile("lib/retail-task-policy.ts", "utf8");
    const workerProfiles = await readFile("lib/worker-agent-credentials.ts", "utf8");

    assert.match(policy, /RETAIL_AGENT_EXECUTABLE_TASK_TYPES[\s\S]*retail_customer_order_allocate[\s\S]*retail_shopping_list_review[\s\S]*retail_stock_forecast_refresh/);
    assert.match(runner, /runtimeWorkerProfileForMode\(mode\)/);
    assert.match(workerProfiles, /"stock", "retailStockPlanner"[\s\S]*RETAIL_AGENT_EXECUTABLE_TASK_TYPES/);
    for (const humanTask of [
      "retail_order_cancel_review",
      "retail_order_delivery_confirm",
      "retail_order_pack",
      "retail_order_pick",
      "retail_order_return_review",
      "retail_order_ship",
      "retail_purchase_order_receive"
    ]) {
      assert.doesNotMatch(runner, new RegExp(`"${humanTask}"`));
    }
    assert.match(taskService, /coalesce\(tasks\.actor_type, 'system'\) <> 'human'/);
    assert.match(registry, /actorType: workerExecutable \? "system" : "human"/);
    assert.match(execution, /isRetailAgentExecutableTaskType\(workItem\.taskType\)/);
    assert.match(execution, /human-only or not agent-executable/);
  });

  it("cancels stale order workflow tasks during lifecycle reconciliation", async () => {
    const stock = await readFile("lib/admin-retail-stock.ts", "utf8");
    const reconcile = functionBody(stock, "reconcileRetailOrderLifecycle");

    assert.match(stock, /cancelStaleOrderWorkflowTasks/);
    assert.match(stock, /retail_order_stale_workflow_task_cancelled/);
    assert.match(reconcile, /const staleCancelledCount = await cancelStaleOrderWorkflowTasks/);
    assert.match(reconcile, /staleCancelledCount > 0 \? "repaired" : "on_track"/);
  });

  it("keeps admin communications as low-priority broadcast tasks for every enabled channel", async () => {
    const communications = await readFile("lib/communications.ts", "utf8");
    const queue = functionBody(communications, "queueAdminOrganisationCommunication");
    const route = functionBody(communications, "routeAdminCommunication");
    const dispatchTaskType = functionBody(
      communications,
      "adminCommunicationDispatchTaskType"
    );
    const dispatch = functionBody(communications, "queueCommunicationMessageDispatchTask");

    assert.match(communications, /ADMIN_COMMUNICATION_ROUTE_TASK_PRIORITY = 300/);
    assert.match(queue, /taskType: "route_admin_communication"/);
    assert.match(route, /const broadcastChannels =/);
    assert.match(route, /Organisation notifications are broadcasts/);
    assert.match(route, /for \(const channel of broadcastChannels\)/);
    assert.match(dispatch, /ADMIN_COMMUNICATION_DISPATCH_TASK_PRIORITY/);
    assert.match(dispatchTaskType, /dispatch_email_communication_message/);
    assert.match(dispatchTaskType, /dispatch_chat_communication_message/);
  });

  it("ships a non-destructive UAT smoke command for the manual round-trip gate", async () => {
    const packageJson = await readFile("package.json", "utf8");
    const script = await readFile("scripts/uat-smoke.mjs", "utf8");

    assert.match(packageJson, /"uat:smoke": "node --env-file-if-exists=\.env\.local scripts\/uat-smoke\.mjs"/);
    assert.match(script, /UAT_DB_URL/);
    assert.match(script, /retail_shopping_lists/);
    assert.match(script, /worker_sessions/);
    assert.match(script, /https:\/\/uat\.mattanutra\.com\/api\/line\/webhook/);
    assert.match(script, /No destructive database writes are performed/);
  });

  it("uses DB_URL as the only runtime database connection variable", async () => {
    const db = await readFile("lib/db.ts", "utf8");
    const getSqlBody = functionBody(db, "getSql");

    assert.match(getSqlBody, /process\.env\.DB_URL/);
    assert.doesNotMatch(
      getSqlBody,
      new RegExp(String.raw`process\.env\.DB_` + String.raw`CONNECTION`)
    );
  });

  it("keeps retired database connection env names out of committed runtime and operator code", async () => {
    const retiredNames = [
      ["DATA", "BASE_URL"].join(""),
      ["UAT_DATA", "BASE_URL"].join(""),
      ["DEV_DATA", "BASE_URL"].join(""),
      ["DB", "CONNECTION"].join("_")
    ];
    const files = [
      ".env.example",
      "package.json",
      ...(await filesUnder("app")),
      ...(await filesUnder("lib")),
      ...(await filesUnder("scripts")),
      ...(await filesUnder("test")),
      ...(await filesUnder("workers"))
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");

      for (const retiredName of retiredNames) {
        assert.ok(
          !source.includes(retiredName),
          `${file} contains retired database connection env name ${retiredName}`
        );
      }
    }
  });

  it("keeps DDL out of runtime app, lib, and worker code", async () => {
    const runtimeFiles = [
      ...(await filesUnder("app")),
      ...(await filesUnder("lib")),
      ...(await filesUnder("workers"))
    ];
    const ddl = /\b(create table|alter table|drop table|drop column|create index|drop constraint|add column)\b/i;

    for (const file of runtimeFiles) {
      const source = await readFile(file, "utf8");

      assert.doesNotMatch(source, ddl, `${file} contains runtime DDL`);
    }
  });
});
