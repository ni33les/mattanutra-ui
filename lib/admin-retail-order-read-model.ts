import {
  customerOrderPickupInProgress,
  expectedTaskTypeForStage,
  workflowActionForStage
} from "@/lib/retail-order-workflow-rules";
import {
  integerOrDefault,
  numberMetadata,
  numberOrNull,
  objectRecord,
  stringMetadata
} from "@/lib/admin-retail-stock-codecs";
import type {
  AdminRetailAuditEvent,
  AdminRetailCustomerOrderActionStates,
  AdminRetailCustomerOrderAddress,
  AdminRetailCustomerOrderDeliveryDetails,
  AdminRetailCustomerOrderLine,
  AdminRetailCustomerOrderPricingSnapshot,
  AdminRetailCustomerOrderPromise,
  AdminRetailCustomerOrderRoutingSnapshot,
  AdminRetailCustomerOrderShipment,
  AdminRetailCustomerOrderWorkflowHealth,
  AdminRetailCustomerOrderWorkflowTimeline,
  AdminRetailOperationsTask,
  AdminRetailStockPipelineRow,
  RetailCustomerOrderStatus,
  RetailOrderWorkflowStage
} from "@/lib/admin-retail-stock";

export function routingSnapshotFromMetadata(
  value: unknown
): AdminRetailCustomerOrderRoutingSnapshot | null {
  const metadata = objectRecord(value);
  const routing = objectRecord(metadata.regionalRouting);

  if (Object.keys(routing).length === 0) {
    return null;
  }

  const unavailableLines = Array.isArray(routing.unavailableLines)
    ? routing.unavailableLines
        .map((line) => objectRecord(line))
        .map((line) => ({
          productId: stringMetadata(line.productId) ?? "",
          quantityRequested: integerOrDefault(line.quantityRequested, 0),
          reason: stringMetadata(line.reason) ?? ""
        }))
        .filter((line) => line.productId)
    : [];

  return {
    etaDate: stringMetadata(routing.etaDate),
    payableLineCount: integerOrDefault(routing.payableLineCount, 0),
    preference:
      routing.preference === "cheapest_price" ||
      routing.preference === "fastest_delivery"
        ? routing.preference
        : null,
    selectedRetailerName: stringMetadata(routing.selectedRetailerName),
    selectedRetailerOrganisationId:
      stringMetadata(routing.selectedRetailerOrganisationId),
    shippingCountry: stringMetadata(routing.shippingCountry),
    subtotalAmount: numberOrNull(routing.subtotalAmount),
    unavailableLines
  };
}

export function pricingSnapshotFromMetadata(
  value: unknown,
  fallbackCurrency: string
): AdminRetailCustomerOrderPricingSnapshot | null {
  const metadata = objectRecord(value);
  const pricing = objectRecord(metadata.pricingSnapshot);

  if (Object.keys(pricing).length === 0) {
    return null;
  }

  return {
    currency: stringMetadata(pricing.currency) ?? fallbackCurrency,
    fxFallbackUsed: Boolean(pricing.fxFallbackUsed),
    fxRateId: stringMetadata(pricing.fxRateId),
    shippingAmount: numberMetadata(pricing.shippingAmount),
    subtotalAmount: numberMetadata(pricing.subtotalAmount),
    taxAmount: numberMetadata(pricing.taxAmount),
    totalAmount: numberMetadata(pricing.totalAmount),
    usdRate: numberMetadata(pricing.usdRate, 1)
  };
}

export function fulfillmentPromiseFromMetadata(
  value: unknown
): AdminRetailCustomerOrderPromise | null {
  const metadata = objectRecord(value);
  const promise = objectRecord(metadata.fulfillmentPromise);

  if (Object.keys(promise).length === 0) {
    return null;
  }

  return {
    backorderLineCount: integerOrDefault(promise.backorderLineCount, 0),
    etaDate: stringMetadata(promise.etaDate),
    mode: promise.mode === "backorder" ? "backorder" : "stock"
  };
}

export function orderAddressFromMetadata(
  value: unknown
): AdminRetailCustomerOrderAddress | null {
  const address = objectRecord(value);

  if (Object.keys(address).length === 0) {
    return null;
  }

  const parsed = {
    addressLine1: stringMetadata(address.addressLine1),
    addressLine2: stringMetadata(address.addressLine2),
    city: stringMetadata(address.city),
    country: stringMetadata(address.country),
    customerEmail: stringMetadata(address.customerEmail),
    customerName: stringMetadata(address.customerName),
    notes: stringMetadata(address.notes),
    phone: stringMetadata(address.phone),
    postalCode: stringMetadata(address.postalCode),
    province: stringMetadata(address.province)
  };

  return Object.values(parsed).some(Boolean) ? parsed : null;
}

export function deliveryDetailsFromMetadata(
  value: unknown
): AdminRetailCustomerOrderDeliveryDetails | null {
  const metadata = objectRecord(value);
  const shippingAddress = orderAddressFromMetadata(metadata.shippingAddress);
  const billingSameAsShipping = metadata.billingSameAsShipping !== false;
  const billingAddress = billingSameAsShipping
    ? shippingAddress
    : orderAddressFromMetadata(metadata.billingAddress);

  if (!shippingAddress && !billingAddress) {
    return null;
  }

  return {
    billingAddress,
    billingSameAsShipping,
    shippingAddress
  };
}

export function shipmentFromMetadata(
  value: unknown
): AdminRetailCustomerOrderShipment | null {
  const shipment = objectRecord(objectRecord(value).shipment);
  const pickup = objectRecord(shipment.pickup);

  if (Object.keys(shipment).length === 0) {
    return null;
  }

  const parsed = {
    carrierId: stringMetadata(shipment.carrierId),
    carrierName: stringMetadata(shipment.carrierName),
    exceptionCode: stringMetadata(shipment.exceptionCode),
    exceptionMessage: stringMetadata(shipment.exceptionMessage),
    labelContentBase64: stringMetadata(shipment.labelContentBase64),
    labelContentType: stringMetadata(shipment.labelContentType),
    labelStatus: stringMetadata(shipment.labelStatus),
    labelUrl: stringMetadata(shipment.labelUrl),
    pickupBookedAt:
      stringMetadata(pickup.bookedAt) ??
      stringMetadata(shipment.pickupBookedAt),
    pickupProviderStatus:
      stringMetadata(pickup.providerStatus) ??
      stringMetadata(shipment.pickupProviderStatus),
    pickupWindowEnd:
      stringMetadata(pickup.windowEnd) ??
      stringMetadata(shipment.pickupWindowEnd),
    pickupWindowStart:
      stringMetadata(pickup.windowStart) ??
      stringMetadata(shipment.pickupWindowStart),
    shippedAt: stringMetadata(shipment.shippedAt),
    shippedByPersonId: stringMetadata(shipment.shippedByPersonId),
    shipmentNotes: stringMetadata(shipment.shipmentNotes),
    status: stringMetadata(shipment.status),
    trackingNumber: stringMetadata(shipment.trackingNumber),
    trackingUrl: stringMetadata(shipment.trackingUrl)
  };

  return Object.values(parsed).some(Boolean) ? parsed : null;
}

export function mergeCustomerOrderShipment(
  metadataShipment: AdminRetailCustomerOrderShipment | null,
  latestShipment: AdminRetailCustomerOrderShipment | null
): AdminRetailCustomerOrderShipment | null {
  if (!metadataShipment) {
    return latestShipment;
  }

  if (!latestShipment) {
    return metadataShipment;
  }

  return {
    carrierId: latestShipment.carrierId ?? metadataShipment.carrierId,
    carrierName: latestShipment.carrierName ?? metadataShipment.carrierName,
    exceptionCode: latestShipment.exceptionCode ?? metadataShipment.exceptionCode,
    exceptionMessage:
      latestShipment.exceptionMessage ?? metadataShipment.exceptionMessage,
    labelContentBase64:
      metadataShipment.labelContentBase64 ?? latestShipment.labelContentBase64,
    labelContentType:
      latestShipment.labelContentType ?? metadataShipment.labelContentType,
    labelStatus: latestShipment.labelStatus ?? metadataShipment.labelStatus,
    labelUrl: latestShipment.labelUrl ?? metadataShipment.labelUrl,
    pickupBookedAt:
      latestShipment.pickupBookedAt ?? metadataShipment.pickupBookedAt,
    pickupProviderStatus:
      latestShipment.pickupProviderStatus ?? metadataShipment.pickupProviderStatus,
    pickupWindowEnd:
      latestShipment.pickupWindowEnd ?? metadataShipment.pickupWindowEnd,
    pickupWindowStart:
      latestShipment.pickupWindowStart ?? metadataShipment.pickupWindowStart,
    shippedAt: latestShipment.shippedAt ?? metadataShipment.shippedAt,
    shippedByPersonId:
      metadataShipment.shippedByPersonId ?? latestShipment.shippedByPersonId,
    shipmentNotes: latestShipment.shipmentNotes ?? metadataShipment.shipmentNotes,
    status: latestShipment.status ?? metadataShipment.status,
    trackingNumber: latestShipment.trackingNumber ?? metadataShipment.trackingNumber,
    trackingUrl: latestShipment.trackingUrl ?? metadataShipment.trackingUrl
  };
}

export function lineAvailabilityFromMetadata(value: unknown): Pick<
  AdminRetailCustomerOrderLine,
  | "availabilityStatus"
  | "backorderQuantity"
  | "etaDate"
  | "fxRateId"
  | "priceSource"
  | "quantityAvailableNow"
  | "reason"
  | "retailSellableProductId"
  | "usdRate"
> {
  const metadata = objectRecord(value);
  const status = metadata.availabilityStatus;

  return {
    availabilityStatus:
      status === "available_now" ||
      status === "backorder" ||
      status === "unavailable"
        ? status
        : null,
    backorderQuantity:
      metadata.backorderQuantity === null ||
      metadata.backorderQuantity === undefined
        ? null
        : integerOrDefault(metadata.backorderQuantity, 0),
    etaDate: stringMetadata(metadata.etaDate),
    fxRateId: stringMetadata(metadata.fxRateId),
    priceSource: stringMetadata(metadata.priceSource),
    quantityAvailableNow:
      metadata.quantityAvailableNow === null ||
      metadata.quantityAvailableNow === undefined
        ? null
        : integerOrDefault(metadata.quantityAvailableNow, 0),
    reason: stringMetadata(metadata.reason),
    retailSellableProductId: stringMetadata(metadata.retailSellableProductId),
    usdRate: numberOrNull(metadata.usdRate)
  };
}

export function getRetailCustomerOrderActionStates(
  status: RetailCustomerOrderStatus,
  pipeline: AdminRetailStockPipelineRow | null,
  shipment: AdminRetailCustomerOrderShipment | null = null
): AdminRetailCustomerOrderActionStates {
  const canConsiderAllocation = status === "placed" || status === "awaiting_stock";
  const allocationRemaining = pipeline
    ? pipeline.customerDemandUnits > pipeline.allocatedUnits
    : false;
  const allocationEnabled = Boolean(
    canConsiderAllocation &&
      pipeline &&
      allocationRemaining &&
      pipeline.availableNowUnits > 0
  );
  const allocationReason = allocationEnabled
    ? null
    : !canConsiderAllocation
      ? "Order status does not allow allocation."
      : !pipeline
        ? "Pipeline unavailable. Recheck workflow."
        : !allocationRemaining
        ? "No unallocated order quantity remains."
        : "No live stock is available to allocate.";
  const canConsiderFulfillment =
    status === "allocated" || status === "picking" || status === "packed";
  const allocationsBacked = Boolean(
    pipeline &&
      pipeline.customerDemandUnits > 0 &&
      pipeline.backedAllocatedUnits >= pipeline.customerDemandUnits &&
      pipeline.unorderedNeedUnits < 1
  );
  const pickupInProgress = customerOrderPickupInProgress(status, shipment);
  const packEnabled =
    allocationsBacked &&
    (status === "allocated" || status === "picking") &&
    !pickupInProgress;
  const bookPickupEnabled =
    allocationsBacked && status === "packed" && !pickupInProgress;
  const shipEnabled =
    allocationsBacked &&
    pickupInProgress &&
    (status === "allocated" || status === "picking" || status === "packed");
  const fulfillmentBlockedReason = !canConsiderFulfillment
    ? "Order must be allocated first."
    : !pipeline
      ? "Pipeline unavailable. Recheck workflow."
      : "Allocated stock is no longer available. Recheck workflow.";

  return {
    allocateAvailable: {
      enabled: allocationEnabled,
      reason: allocationReason
    },
    bookPickup: {
      enabled: bookPickupEnabled,
      reason: bookPickupEnabled
        ? null
        : !allocationsBacked
          ? fulfillmentBlockedReason
          : status !== "packed"
            ? "Order must be packed before pickup can be booked."
            : "Pickup is already requested or booked."
    },
    deliver: {
      enabled: status === "shipped",
      reason: status === "shipped" ? null : "Order must be shipped first."
    },
    pack: {
      enabled: packEnabled,
      reason: packEnabled
        ? null
        : !allocationsBacked
          ? fulfillmentBlockedReason
          : status === "packed" || pickupInProgress
            ? "Order is already packed."
            : "Order is not ready to pack."
    },
    pick: {
      enabled: false,
      reason: "Picking is handled inside the packing workflow."
    },
    recheckWorkflow: {
      enabled: true,
      reason: null
    },
    ship: {
      enabled: shipEnabled,
      reason:
        shipEnabled
          ? null
          : !allocationsBacked
            ? fulfillmentBlockedReason
            : !pickupInProgress
              ? "Book pickup before marking the order shipped."
              : "Order is not ready to ship."
    }
  };
}

export function getRetailCustomerOrderWorkflowHealth(input: Readonly<{
  openTasks: readonly AdminRetailOperationsTask[];
  pipeline: AdminRetailStockPipelineRow | null;
  status: RetailCustomerOrderStatus;
  workflowStage: RetailOrderWorkflowStage;
}>): AdminRetailCustomerOrderWorkflowHealth {
  let expectedTaskType: string | null = null;
  let nextAction: string | null = null;
  let reason: string | null = null;

  if (input.status === "placed" || input.status === "awaiting_stock") {
    if (!input.pipeline) {
      reason = "Pipeline unavailable. Recheck workflow.";
      nextAction = "recheck_workflow";
    } else if (
      input.pipeline.customerDemandUnits > input.pipeline.allocatedUnits &&
      input.pipeline.availableNowUnits > 0
    ) {
      expectedTaskType = "retail_customer_order_allocate";
      nextAction = "allocate_available";
      reason = "Available stock exists for this order. Allocate available units.";
    } else if (input.pipeline.unorderedNeedUnits > 0) {
      expectedTaskType = "retail_shopping_list_review";
      nextAction = "review_shopping_list";
      reason = "Unallocated demand exists. Review reorder advice.";
    }
  } else if (
    input.workflowStage === "ship" &&
    input.pipeline &&
    input.pipeline.backedAllocatedUnits < input.pipeline.customerDemandUnits
  ) {
    expectedTaskType = "retail_shopping_list_review";
    nextAction = "review_shopping_list";
    reason = "Allocated stock is no longer available. Recheck workflow.";
  } else {
    expectedTaskType = expectedTaskTypeForStage(input.workflowStage);
    nextAction = workflowActionForStage(input.workflowStage);
    reason = nextAction ? null : null;
  }

  const expectedTaskTypes = expectedTaskType ? [expectedTaskType] : [];
  const hasExpectedTask =
    expectedTaskTypes.length === 0
      ? true
      : input.openTasks.some((task) =>
          expectedTaskTypes.includes(task.taskType)
        );
  const isStuck = Boolean(expectedTaskType && !hasExpectedTask);

  return {
    expectedTaskType,
    isStuck,
    nextAction,
    reason: isStuck ? reason : null
  };
}

function firstWorkflowEventAt(
  events: readonly AdminRetailAuditEvent[],
  predicate: (event: AdminRetailAuditEvent) => boolean
) {
  return events
    .filter(predicate)
    .map((event) => event.occurredAt)
    .sort()
    .at(0) ?? null;
}

function workflowEventAction(event: AdminRetailAuditEvent) {
  return stringMetadata(event.details.action);
}

export function workflowEventStatus(event: AdminRetailAuditEvent) {
  return (
    stringMetadata(event.details.toStatus) ??
    stringMetadata(event.details.status) ??
    event.status ??
    null
  );
}

function workflowEventTaskAction(event: AdminRetailAuditEvent) {
  return (
    stringMetadata(event.details.workflowAction) ??
    stringMetadata(event.details.action)
  );
}

export function customerOrderWorkflowTimeline(input: Readonly<{
  deliveredAt: string | null;
  events: readonly AdminRetailAuditEvent[];
  placedAt: string | null;
  pickupBookedAt: string | null;
  shippedAt: string | null;
  status: RetailCustomerOrderStatus;
  updatedAt: string;
}>): AdminRetailCustomerOrderWorkflowTimeline {
  const awaitingStockAt =
    firstWorkflowEventAt(
      input.events,
      (event) =>
        (event.action === "admin.retail_customer_order_created" ||
          event.action === "admin.retail_customer_order_allocated" ||
          event.action === "retail_order_allocation_blocked") &&
        workflowEventStatus(event) === "awaiting_stock"
    ) ??
    (input.status === "awaiting_stock" ? input.updatedAt : null);
  const allocatedAt =
    firstWorkflowEventAt(
      input.events,
      (event) =>
        (event.action === "admin.retail_customer_order_allocated" ||
          event.action === "retail_order_allocated") &&
        workflowEventStatus(event) === "allocated"
    ) ??
    (input.status === "allocated" ? input.updatedAt : null);
  const boxedAt =
    firstWorkflowEventAt(
      input.events,
      (event) =>
        (event.action === "admin.retail_customer_order_advanced" &&
          (workflowEventAction(event) === "mark_packed" ||
            workflowEventStatus(event) === "packed")) ||
        (event.action === "retail_order_workflow_task_completed" &&
          workflowEventTaskAction(event) === "mark_packed")
    ) ??
    (input.status === "packed" ? input.updatedAt : null);
  const sentAt =
    input.shippedAt ??
    firstWorkflowEventAt(
      input.events,
      (event) =>
        (event.action === "admin.retail_customer_order_advanced" &&
          (workflowEventAction(event) === "mark_shipped" ||
            workflowEventStatus(event) === "shipped")) ||
        (event.action === "retail_order_workflow_task_completed" &&
          workflowEventTaskAction(event) === "mark_shipped")
    ) ??
    (input.status === "shipped" ? input.updatedAt : null);

  return {
    allocatedAt,
    awaitingStockAt,
    boxedAt,
    orderedAt: input.placedAt,
    pickupBookedAt: input.pickupBookedAt,
    sentAt
  };
}

export function isTerminalTaskStatus(status: string) {
  return status === "completed" || status === "cancelled" || status === "skipped";
}
