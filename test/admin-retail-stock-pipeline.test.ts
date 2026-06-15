import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateRetailStockPipelineRows,
  retailStockPipelineKey,
  retailStockPipelineStatus
} from "@/lib/admin-retail-stock-pipeline";
import type { AdminRetailStockPipelineRow } from "@/lib/admin-retail-stock";

function pipelineRow(
  overrides: Partial<AdminRetailStockPipelineRow> = {}
): AdminRetailStockPipelineRow {
  return {
    allocatedUnits: 2,
    availableNowUnits: 0,
    backedAllocatedUnits: 2,
    customerDemandUnits: 2,
    customerOrderId: "order-1",
    customerOrderLineId: "line-1",
    organisationId: "org-1",
    orderNumber: "SO-1",
    productId: "product-1",
    productTitle: "Product 1",
    shippedUnits: 0,
    status: "available_now",
    unorderedNeedUnits: 0,
    ...overrides
  };
}

describe("admin retail stock pipeline", () => {
  it("derives stable pipeline statuses", () => {
    assert.equal(
      retailStockPipelineStatus({
        allocatedUnits: 0,
        availableNowUnits: 0,
        customerDemandUnits: 3,
        unorderedNeedUnits: 2
      }),
      "unordered"
    );
    assert.equal(
      retailStockPipelineStatus({
        allocatedUnits: 1,
        availableNowUnits: 0,
        customerDemandUnits: 3,
        unorderedNeedUnits: 0
      }),
      "partially_allocated"
    );
    assert.equal(
      retailStockPipelineStatus({
        allocatedUnits: 3,
        availableNowUnits: 0,
        customerDemandUnits: 3,
        unorderedNeedUnits: 0
      }),
      "available_now"
    );
    assert.equal(
      retailStockPipelineStatus({
        allocatedUnits: 0,
        availableNowUnits: 0,
        customerDemandUnits: 3,
        unorderedNeedUnits: 0
      }),
      "backorder"
    );
  });

  it("aggregates order rows using backed allocation for workflow readiness", () => {
    assert.deepEqual(
      aggregateRetailStockPipelineRows(
        [
          pipelineRow({
            allocatedUnits: 3,
            backedAllocatedUnits: 1,
            customerDemandUnits: 3,
            customerOrderLineId: "line-1",
            productId: "product-1",
            unorderedNeedUnits: 2
          }),
          pipelineRow({
            allocatedUnits: 2,
            backedAllocatedUnits: 2,
            customerDemandUnits: 2,
            customerOrderLineId: "line-2",
            productId: "product-2"
          })
        ],
        "order-1"
      ),
      {
        allocatedUnits: 5,
        availableNowUnits: 0,
        backedAllocatedUnits: 3,
        customerDemandUnits: 5,
        customerOrderId: "order-1",
        customerOrderLineId: null,
        organisationId: "org-1",
        orderNumber: "SO-1",
        productId: null,
        productTitle: null,
        shippedUnits: 0,
        status: "unordered",
        unorderedNeedUnits: 2
      }
    );
  });

  it("uses line and product identifiers for pipeline map keys", () => {
    assert.equal(retailStockPipelineKey("line-1", "product-1"), "line-1:product-1");
    assert.equal(retailStockPipelineKey(null, "product-1"), "product:product-1");
    assert.equal(retailStockPipelineKey("line-1", null), "line-1:all");
  });
});
