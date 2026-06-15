import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerOrderStatus,
  integerOrDefault,
  isoDateOrNull,
  movementDelta,
  movementType,
  normalizeCurrency,
  priorityBand,
  stockBackorderPolicy
} from "@/lib/admin-retail-stock-codecs";
import {
  customerOrderWorkflowTimeline,
  deliveryDetailsFromMetadata,
  getRetailCustomerOrderActionStates,
  getRetailCustomerOrderWorkflowHealth,
  lineAvailabilityFromMetadata,
  mergeCustomerOrderShipment,
  pricingSnapshotFromMetadata,
  routingSnapshotFromMetadata,
  shipmentFromMetadata
} from "@/lib/admin-retail-order-read-model";
import {
  mapRetailCarrierAccountRow,
  mapRetailProductOptionRow,
  mapRetailShoppingListLineRow,
  mapRetailShoppingListRow,
  mapRetailStockLotRow,
  mapRetailStockMovementRow,
  mapRetailStockReorderAdviceRow,
  mapRetailStockRow
} from "@/lib/admin-retail-stock-read-model";
import type {
  AdminRetailAuditEvent,
  AdminRetailCustomerOrderShipment,
  AdminRetailStockPipelineRow
} from "@/lib/admin-retail-stock";

function pipeline(
  overrides: Partial<AdminRetailStockPipelineRow> = {}
): AdminRetailStockPipelineRow {
  return {
    allocatedUnits: 2,
    availableNowUnits: 2,
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

function shipment(
  overrides: Partial<AdminRetailCustomerOrderShipment> = {}
): AdminRetailCustomerOrderShipment {
  return {
    carrierId: null,
    carrierName: null,
    exceptionCode: null,
    exceptionMessage: null,
    labelContentBase64: null,
    labelContentType: null,
    labelStatus: null,
    labelUrl: null,
    pickupBookedAt: null,
    pickupProviderStatus: null,
    pickupWindowEnd: null,
    pickupWindowStart: null,
    shippedAt: null,
    shippedByPersonId: null,
    shipmentNotes: null,
    status: null,
    trackingNumber: null,
    trackingUrl: null,
    ...overrides
  };
}

function event(
  overrides: Partial<AdminRetailAuditEvent>
): AdminRetailAuditEvent {
  return {
    action: "admin.retail_customer_order_advanced",
    actorEmail: null,
    actorName: null,
    agentName: null,
    details: {},
    id: "event-1",
    occurredAt: "2026-06-01T10:00:00.000Z",
    organisationId: "org-1",
    organisationName: "Retailer",
    resourceId: "order-1",
    resourceType: "retail_customer_order",
    severity: null,
    source: "admin",
    status: null,
    ...overrides
  };
}

describe("admin retail stock codecs", () => {
  it("normalizes stock and order primitive values", () => {
    assert.equal(normalizeCurrency(" thb ", "tenant"), "THB");
    assert.equal(normalizeCurrency("", "platform"), "USD");
    assert.equal(normalizeCurrency("", "tenant"), "THB");
    assert.equal(stockBackorderPolicy("deny"), "deny");
    assert.equal(stockBackorderPolicy("unexpected"), "allow");
    assert.equal(customerOrderStatus("packed"), "packed");
    assert.equal(customerOrderStatus("unknown"), "draft");
    assert.equal(movementType("sale"), "sale");
    assert.equal(movementType("unknown"), "receive");
    assert.equal(integerOrDefault("2.6", 0), 3);
    assert.equal(isoDateOrNull("2026-06-15T05:00:00.000Z"), "2026-06-15");
  });

  it("keeps movement signs and priority bands stable", () => {
    assert.equal(movementDelta("sale", 3), -3);
    assert.equal(movementDelta("transfer_out", -4), -4);
    assert.equal(movementDelta("receive", -5), 5);
    assert.equal(movementDelta("adjustment", -2), -2);
    assert.throws(() => movementDelta("receive", 0), /Movement quantity is required/);
    assert.equal(priorityBand(800), "urgent");
    assert.equal(priorityBand(500), "high");
    assert.equal(priorityBand(100), "low");
    assert.equal(priorityBand(250), "normal");
  });
});

describe("admin retail order read model", () => {
  it("parses routing, pricing, delivery, shipment, and line metadata", () => {
    assert.deepEqual(
      routingSnapshotFromMetadata({
        regionalRouting: {
          etaDate: "2026-06-20",
          payableLineCount: "2",
          preference: "fastest_delivery",
          selectedRetailerName: "Delight",
          selectedRetailerOrganisationId: "org-1",
          shippingCountry: "TH",
          subtotalAmount: "1200.50",
          unavailableLines: [
            { productId: "product-2", quantityRequested: "3", reason: "No stock" },
            { productId: "", quantityRequested: 1, reason: "Ignored" }
          ]
        }
      }),
      {
        etaDate: "2026-06-20",
        payableLineCount: 2,
        preference: "fastest_delivery",
        selectedRetailerName: "Delight",
        selectedRetailerOrganisationId: "org-1",
        shippingCountry: "TH",
        subtotalAmount: 1200.5,
        unavailableLines: [
          { productId: "product-2", quantityRequested: 3, reason: "No stock" }
        ]
      }
    );
    assert.deepEqual(
      pricingSnapshotFromMetadata(
        {
          pricingSnapshot: {
            currency: "",
            shippingAmount: "50",
            subtotalAmount: "1200",
            taxAmount: null,
            totalAmount: "1250",
            usdRate: "35.5"
          }
        },
        "THB"
      ),
      {
        currency: "THB",
        fxFallbackUsed: false,
        fxRateId: null,
        shippingAmount: 50,
        subtotalAmount: 1200,
        taxAmount: 0,
        totalAmount: 1250,
        usdRate: 35.5
      }
    );
    assert.deepEqual(
      deliveryDetailsFromMetadata({
        billingSameAsShipping: false,
        shippingAddress: { customerName: "Nok", city: "Chiang Mai" },
        billingAddress: { customerEmail: "billing@example.com" }
      }),
      {
        billingAddress: {
          addressLine1: null,
          addressLine2: null,
          city: null,
          country: null,
          customerEmail: "billing@example.com",
          customerName: null,
          notes: null,
          phone: null,
          postalCode: null,
          province: null
        },
        billingSameAsShipping: false,
        shippingAddress: {
          addressLine1: null,
          addressLine2: null,
          city: "Chiang Mai",
          country: null,
          customerEmail: null,
          customerName: "Nok",
          notes: null,
          phone: null,
          postalCode: null,
          province: null
        }
      }
    );
    assert.equal(
      shipmentFromMetadata({
        shipment: { pickup: { providerStatus: "requested" }, trackingNumber: "KEX1" }
      })?.pickupProviderStatus,
      "requested"
    );
    assert.deepEqual(lineAvailabilityFromMetadata({
      availabilityStatus: "available_now",
      backorderQuantity: "1",
      etaDate: "2026-06-18",
      quantityAvailableNow: "3",
      usdRate: "35"
    }), {
      availabilityStatus: "available_now",
      backorderQuantity: 1,
      etaDate: "2026-06-18",
      fxRateId: null,
      priceSource: null,
      quantityAvailableNow: 3,
      reason: null,
      retailSellableProductId: null,
      usdRate: 35
    });
  });

  it("merges latest shipment state without losing generated label content", () => {
    assert.deepEqual(
      mergeCustomerOrderShipment(
        shipment({
          carrierName: "Manual",
          labelContentBase64: "PDF",
          shippedByPersonId: "person-1",
          trackingNumber: "OLD"
        }),
        shipment({
          carrierName: "KEX",
          labelStatus: "ready",
          pickupBookedAt: "2026-06-16T08:00:00.000Z",
          pickupProviderStatus: "booked",
          trackingNumber: "NEW"
        })
      ),
      shipment({
        carrierName: "KEX",
        labelContentBase64: "PDF",
        labelStatus: "ready",
        pickupBookedAt: "2026-06-16T08:00:00.000Z",
        pickupProviderStatus: "booked",
        shippedByPersonId: "person-1",
        trackingNumber: "NEW"
      })
    );
  });

  it("builds action states and workflow health without the service module", () => {
    assert.equal(
      getRetailCustomerOrderActionStates("allocated", pipeline()).pack.enabled,
      true
    );
    assert.equal(
      getRetailCustomerOrderActionStates(
        "packed",
        pipeline(),
        shipment({ pickupProviderStatus: "requested" })
      ).ship.enabled,
      true
    );
    assert.deepEqual(
      getRetailCustomerOrderWorkflowHealth({
        openTasks: [],
        pipeline: pipeline({
          allocatedUnits: 1,
          availableNowUnits: 1,
          customerDemandUnits: 2,
          unorderedNeedUnits: 1
        }),
        status: "placed",
        workflowStage: "allocate"
      }),
      {
        expectedTaskType: "retail_customer_order_allocate",
        isStuck: true,
        nextAction: "allocate_available",
        reason: "Available stock exists for this order. Allocate available units."
      }
    );
  });

  it("derives workflow timeline milestones from audit and task events", () => {
    assert.deepEqual(
      customerOrderWorkflowTimeline({
        deliveredAt: null,
        events: [
          event({
            action: "admin.retail_customer_order_allocated",
            details: { status: "allocated" },
            occurredAt: "2026-06-01T11:00:00.000Z"
          }),
          event({
            details: { action: "mark_packed" },
            occurredAt: "2026-06-01T12:00:00.000Z"
          }),
          event({
            action: "retail_order_workflow_task_completed",
            details: { workflowAction: "mark_shipped" },
            occurredAt: "2026-06-01T13:00:00.000Z"
          })
        ],
        placedAt: "2026-06-01T09:00:00.000Z",
        pickupBookedAt: "2026-06-01T12:30:00.000Z",
        shippedAt: null,
        status: "packed",
        updatedAt: "2026-06-01T14:00:00.000Z"
      }),
      {
        allocatedAt: "2026-06-01T11:00:00.000Z",
        awaitingStockAt: null,
        boxedAt: "2026-06-01T12:00:00.000Z",
        orderedAt: "2026-06-01T09:00:00.000Z",
        pickupBookedAt: "2026-06-01T12:30:00.000Z",
        sentAt: "2026-06-01T13:00:00.000Z"
      }
    );
  });
});

describe("admin retail stock dashboard read model", () => {
  it("maps carrier, product, stock, lot, and movement rows", () => {
    assert.deepEqual(
      mapRetailCarrierAccountRow({
        capabilities: ["label", "pickup"],
        carrier_id: "kex",
        display_name: "KEX",
        id: "carrier-1",
        last_test_status: "ok",
        last_tested_at: "2026-06-01T10:00:00.000Z",
        organisation_id: "org-1",
        status: "active",
        updated_at: "2026-06-01T11:00:00.000Z"
      }),
      {
        capabilities: ["label", "pickup"],
        carrierId: "kex",
        displayName: "KEX",
        id: "carrier-1",
        lastTestStatus: "ok",
        lastTestedAt: "2026-06-01T10:00:00.000Z",
        organisationId: "org-1",
        status: "active",
        updatedAt: "2026-06-01T11:00:00.000Z"
      }
    );
    assert.deepEqual(
      mapRetailProductOptionRow({
        brand_name: "Brand",
        id: "product-1",
        image_url: "/product.webp",
        product_kind: "supplement",
        title: "Product"
      }),
      {
        brandName: "Brand",
        id: "product-1",
        imageUrl: "/product.webp",
        productKind: "supplement",
        title: "Product"
      }
    );
    assert.deepEqual(
      mapRetailStockRow({
        backorder_policy: "deny",
        brand_name: "Brand",
        currency: "THB",
        id: "stock-1",
        image_url: "/product.webp",
        lead_time_days: "3",
        notes: "Cold chain",
        organisation_id: "org-1",
        organisation_name: "Delight",
        product_id: "product-1",
        product_kind: "supplement",
        product_status: "approved",
        product_title: "Product",
        retail_override_price_amount: "120",
        retail_price_amount: "120",
        retail_sellable_product_id: "sellable-1",
        status: "disabled",
        stock_quantity: "9",
        updated_at: "2026-06-01T11:00:00.000Z",
        wholesale_price_amount: "80"
      }),
      {
        backorderPolicy: "deny",
        brandName: "Brand",
        currency: "THB",
        id: "stock-1",
        imageUrl: "/product.webp",
        leadTimeDays: 3,
        notes: "Cold chain",
        organisationId: "org-1",
        organisationName: "Delight",
        productId: "product-1",
        productKind: "supplement",
        productStatus: "approved",
        productTitle: "Product",
        retailOverridePriceAmount: 120,
        retailPriceAmount: 120,
        retailSellableProductId: "sellable-1",
        status: "disabled",
        stockQuantity: 9,
        updatedAt: "2026-06-01T11:00:00.000Z",
        wholesalePriceAmount: 80
      }
    );
    assert.equal(
      mapRetailStockLotRow({
        currency: "THB",
        expires_at: "2026-12-31T00:00:00.000Z",
        id: "lot-1",
        notes: null,
        organisation_id: "org-1",
        product_id: "product-1",
        product_title: "Product",
        received_at: "2026-06-01T09:00:00.000Z",
        received_quantity: "12",
        remaining_quantity: "7",
        retail_product_stock_id: "stock-1",
        status: "depleted",
        wholesale_price_amount: "75"
      }).expiresAt,
      "2026-12-31"
    );
    assert.deepEqual(
      mapRetailStockMovementRow({
        currency: "THB",
        id: "movement-1",
        is_voided: true,
        lot_id: "lot-1",
        movement_type: "sale",
        notes: "Order",
        occurred_at: "2026-06-01T10:00:00.000Z",
        organisation_id: "org-1",
        organisation_name: "Delight",
        product_id: "product-1",
        product_title: "Product",
        quantity_delta: "2",
        reason: "sale",
        retail_price_amount: "120",
        retail_product_stock_id: "stock-1",
        unit_cost_amount: "80",
        voids_movement_id: null
      }),
      {
        currency: "THB",
        id: "movement-1",
        isVoided: true,
        lotId: "lot-1",
        movementType: "sale",
        notes: "Order",
        occurredAt: "2026-06-01T10:00:00.000Z",
        organisationId: "org-1",
        organisationName: "Delight",
        productId: "product-1",
        productTitle: "Product",
        quantityDelta: 2,
        reason: "sale",
        retailPriceAmount: 120,
        stockId: "stock-1",
        unitCostAmount: 80,
        voidsMovementId: null
      }
    );
  });

  it("maps reorder advice and shopping-list rows", () => {
    assert.deepEqual(
      mapRetailStockReorderAdviceRow({
        calculated_at: "2026-06-01T10:00:00.000Z",
        confidence: "unexpected",
        current_stock_quantity: "1",
        days_cover: "2.5",
        id: "advice-1",
        lead_time_days: "4",
        organisation_id: "org-1",
        organisation_name: "Delight",
        outflow_units_30d: "20",
        product_id: "product-1",
        product_title: "Product",
        recommendation_pressure_count: "3",
        reorder_by: "2026-06-10T00:00:00.000Z",
        retail_product_stock_id: "stock-1",
        risk_level: "unexpected",
        suggested_order_quantity: "12"
      }),
      {
        calculatedAt: "2026-06-01T10:00:00.000Z",
        confidence: "low",
        currentStockQuantity: 1,
        daysCover: 2.5,
        id: "advice-1",
        leadTimeDays: 4,
        organisationId: "org-1",
        organisationName: "Delight",
        outflowUnits30d: 20,
        productId: "product-1",
        productTitle: "Product",
        recommendationPressureCount: 3,
        reorderBy: "2026-06-10",
        riskLevel: "ok",
        stockId: "stock-1",
        suggestedOrderQuantity: 12
      }
    );
    assert.deepEqual(
      mapRetailShoppingListLineRow({
        actual_quantity: "6",
        assigned_quantity: "5",
        brand_name: "Brand",
        current_stock_quantity: "2",
        ean13: "8851234567890",
        id: "line-1",
        manufacturer_sku: "SKU-1",
        organisation_id: "org-1",
        product_id: "product-1",
        product_title: "Product",
        required_quantity: "8",
        retail_price_amount: "120",
        shopping_list_id: "list-1",
        stocked_quantity: "3",
        unordered_need_quantity: "4",
        wholesale_price_amount: "80"
      }),
      {
        actualQuantity: 6,
        assignedQuantity: 5,
        brandName: "Brand",
        currentStockQuantity: 2,
        ean13: "8851234567890",
        id: "line-1",
        manufacturerSku: "SKU-1",
        organisationId: "org-1",
        productId: "product-1",
        productTitle: "Product",
        requiredQuantity: 8,
        retailPriceAmount: 120,
        shoppingListId: "list-1",
        stockedQuantity: 3,
        unorderedNeedQuantity: 4,
        wholesalePriceAmount: 80
      }
    );
    assert.equal(
      mapRetailShoppingListRow({
        actual_units: "3",
        created_at: "2026-06-01T09:00:00.000Z",
        currency: "THB",
        id: "list-1",
        line_count: "2",
        list_number: "SL-1",
        organisation_id: "org-1",
        organisation_name: "Delight",
        required_units: "5",
        status: "closed",
        stocked_units: "4",
        updated_at: "2026-06-01T10:00:00.000Z"
      }).status,
      "closed"
    );
  });
});
