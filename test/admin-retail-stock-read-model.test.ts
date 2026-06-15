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
