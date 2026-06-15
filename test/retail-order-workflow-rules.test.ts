import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerOrderPickupInProgress,
  expectedTaskTypeForStage,
  retailOrderWorkflowTaskDetails,
  workflowActionForStage,
  workflowStageForStatus,
  workflowTaskTypeForAction
} from "../lib/retail-order-workflow-rules.ts";

describe("retail order workflow rules", () => {
  it("maps order status to the next workflow stage", () => {
    assert.equal(workflowStageForStatus("placed"), "allocate");
    assert.equal(workflowStageForStatus("awaiting_stock"), "awaiting_stock");
    assert.equal(workflowStageForStatus("allocated"), "pack");
    assert.equal(workflowStageForStatus("picking"), "pack");
    assert.equal(workflowStageForStatus("packed"), "ship");
    assert.equal(workflowStageForStatus("shipped"), "deliver");
    assert.equal(workflowStageForStatus("delivered"), "delivered");
    assert.equal(workflowStageForStatus("cancelled"), "cancelled");
    assert.equal(workflowStageForStatus("returned"), "returned");
  });

  it("keeps pickup-in-progress distinct from shipped and terminal states", () => {
    assert.equal(
      customerOrderPickupInProgress("packed", {
        pickupBookedAt: null,
        pickupProviderStatus: "requested",
        status: "pickup_booked"
      }),
      true
    );
    assert.equal(
      customerOrderPickupInProgress("packed", {
        pickupBookedAt: null,
        pickupProviderStatus: null,
        status: null
      }),
      false
    );
    assert.equal(
      customerOrderPickupInProgress("shipped", {
        pickupBookedAt: "2026-06-15T10:00:00.000Z",
        pickupProviderStatus: "booked",
        status: "pickup_booked"
      }),
      false
    );
  });

  it("maps workflow stages and actions to task types", () => {
    assert.equal(
      expectedTaskTypeForStage("allocate"),
      "retail_customer_order_allocate"
    );
    assert.equal(expectedTaskTypeForStage("awaiting_stock"), "retail_shopping_list_review");
    assert.equal(expectedTaskTypeForStage("pack"), "retail_order_pack");
    assert.equal(expectedTaskTypeForStage("ship"), "retail_order_ship");
    assert.equal(expectedTaskTypeForStage("deliver"), "retail_order_delivery_confirm");
    assert.equal(workflowActionForStage("pack"), "mark_packed");
    assert.equal(workflowActionForStage("ship"), "mark_shipped");
    assert.equal(workflowActionForStage("deliver"), "mark_delivered");
    assert.equal(workflowTaskTypeForAction("mark_packed"), "retail_order_pack");
    assert.equal(workflowTaskTypeForAction("mark_shipped"), "retail_order_ship");
    assert.equal(workflowTaskTypeForAction("return"), "retail_order_return_review");
  });

  it("keeps repair task copy and priority in one pure rule module", () => {
    assert.deepEqual(retailOrderWorkflowTaskDetails("retail_order_ship"), {
      description: "Pack the allocated order and mark it shipped when handed over.",
      priorityReason: "Workflow repair restored ship-ready order work.",
      priorityScore: 720,
      title: "Ship customer order"
    });
    assert.equal(
      retailOrderWorkflowTaskDetails("retail_order_delivery_confirm").title,
      "Confirm customer delivery"
    );
  });
});
