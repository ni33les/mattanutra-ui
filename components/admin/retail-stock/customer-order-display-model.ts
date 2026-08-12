import type {
  AdminRetailCustomerOrder,
  RetailCustomerOrderStatus
} from "@/lib/admin-retail-stock";
import type { AdminContent } from "@/components/admin/dashboard-content";

const customerOrderMetricColors = {
  active: "#3A7BD5",
  medium: "#F59E0B",
  processing: "#3A7BD5",
  queued: "#0EA5E9",
  succeeded: "#126B4F"
};

function readableToken(value: string) {
  if (value === "completed") {
    return "Succeeded";
  }

  return value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type CustomerOrderMetricKey =
  | "allocated"
  | "awaiting_stock"
  | "packed"
  | "pickup_booked"
  | "placed"
  | "shipped";

export type CustomerOrderFilter = "all" | CustomerOrderMetricKey;

export const customerOrderStatusFilters: CustomerOrderMetricKey[] = [
  "placed",
  "awaiting_stock",
  "allocated",
  "packed",
  "pickup_booked",
  "shipped"
];

const customerOrderAllExcludedStatuses = new Set<RetailCustomerOrderStatus>([
  "shipped",
  "delivered",
  "cancelled",
  "returned"
]);

const customerOrderVisibleStatusSet = new Set<CustomerOrderMetricKey>(
  customerOrderStatusFilters
);

export function customerOrderRetailValue(order: AdminRetailCustomerOrder) {
  return order.pricingSnapshot?.totalAmount ?? order.totalRetailAmount;
}

/** Line-items subtotal from pricing snapshot (excludes processing fee). */
export function customerOrderSubtotalAmount(order: AdminRetailCustomerOrder) {
  const snapshot = order.pricingSnapshot;
  if (snapshot && typeof snapshot.subtotalAmount === "number") {
    return snapshot.subtotalAmount;
  }

  return order.totalRetailAmount;
}

/**
 * Platform flat shipping stored on the order, shown to retail as processing fee.
 */
export function customerOrderProcessingFeeAmount(
  order: AdminRetailCustomerOrder
) {
  const snapshot = order.pricingSnapshot;
  if (snapshot && typeof snapshot.shippingAmount === "number") {
    return Math.max(0, snapshot.shippingAmount);
  }

  return 0;
}

export function customerOrderHasPickupBooked(order: AdminRetailCustomerOrder) {
  const providerStatus = order.shipment?.pickupProviderStatus?.trim().toLowerCase();

  if (
    order.status === "shipped" ||
    order.status === "delivered" ||
    order.status === "cancelled" ||
    order.status === "returned"
  ) {
    return false;
  }

  return Boolean(
    order.shipment?.pickupBookedAt ||
      (providerStatus && ["booked", "queued", "requested"].includes(providerStatus))
  );
}

export function customerOrderStatusFilterLabel(status: CustomerOrderMetricKey) {
  if (status === "allocated") {
    return "Ready to pack";
  }

  if (status === "packed") {
    return "Ready to ship";
  }

  if (status === "pickup_booked") {
    return "Pickup booked";
  }

  return readableToken(status);
}

export function customerOrderStatusMetricKey(
  orderOrStatus: AdminRetailCustomerOrder | RetailCustomerOrderStatus
): CustomerOrderMetricKey | null {
  const status =
    typeof orderOrStatus === "string" ? orderOrStatus : orderOrStatus.status;

  if (
    typeof orderOrStatus !== "string" &&
    customerOrderHasPickupBooked(orderOrStatus)
  ) {
    return "pickup_booked";
  }

  if (
    typeof orderOrStatus !== "string" &&
    orderOrStatus.workflowStage === "awaiting_stock"
  ) {
    return "awaiting_stock";
  }

  if (status === "picking") {
    return "packed";
  }

  return customerOrderVisibleStatusSet.has(status as CustomerOrderMetricKey)
    ? status as CustomerOrderMetricKey
    : null;
}

export function customerOrderIncludedInAllMetric(order: AdminRetailCustomerOrder) {
  return !customerOrderAllExcludedStatuses.has(order.status);
}

export function customerOrderMatchesFilter(
  order: AdminRetailCustomerOrder,
  filter: CustomerOrderFilter
) {
  if (filter === "all") {
    return customerOrderIncludedInAllMetric(order);
  }

  return customerOrderStatusMetricKey(order) === filter;
}

export function customerOrderStatusDisplay(order: AdminRetailCustomerOrder) {
  if (customerOrderHasPickupBooked(order)) {
    return "Pickup booked";
  }

  if (order.status === "awaiting_stock" || order.workflowStage === "awaiting_stock") {
    return "Awaiting stock";
  }

  if (order.status === "allocated") {
    return "Ready to pack";
  }

  if (order.status === "picking" || order.status === "packed") {
    return "Ready to ship";
  }

  return readableToken(order.status);
}

export function customerOrderStatusPillClass(order: AdminRetailCustomerOrder) {
  if (
    order.status === "awaiting_stock" ||
    order.workflowStage === "awaiting_stock" ||
    customerOrderHasPickupBooked(order)
  ) {
    return "bg-amber-50 text-amber-800 ring-amber-100";
  }

  return "bg-gray-100 text-gray-700 ring-gray-200";
}

export function customerOrderMetricColor(status: CustomerOrderMetricKey) {
  if (status === "awaiting_stock" || status === "pickup_booked") {
    return customerOrderMetricColors.medium;
  }

  if (status === "allocated") {
    return customerOrderMetricColors.active;
  }

  if (status === "packed") {
    return customerOrderMetricColors.processing;
  }

  if (status === "shipped") {
    return customerOrderMetricColors.succeeded;
  }

  return customerOrderMetricColors.queued;
}

export function buildCustomerOrderWorkflowSteps(
  labels: AdminContent,
  order: AdminRetailCustomerOrder
) {
  const current =
    order.status === "shipped" || order.status === "delivered"
      ? "sent"
      : customerOrderHasPickupBooked(order)
        ? "pickup_booked"
        : order.status === "awaiting_stock" ||
            order.workflowStage === "awaiting_stock"
          ? "awaiting_stock"
          : order.status === "allocated"
            ? "ready_to_pack"
            : order.status === "picking" || order.status === "packed"
              ? "ready_to_ship"
              : "ordered";

  return [
    {
      active: current === "ordered",
      at: order.workflowTimeline.orderedAt,
      complete: Boolean(order.workflowTimeline.orderedAt),
      key: "ordered",
      label: labels.stock.ordered
    },
    {
      active: current === "awaiting_stock",
      at: order.workflowTimeline.awaitingStockAt,
      complete:
        Boolean(order.workflowTimeline.awaitingStockAt) ||
        current === "awaiting_stock" ||
        current === "ready_to_pack" ||
        current === "ready_to_ship" ||
        current === "pickup_booked" ||
        current === "sent",
      key: "awaiting_stock",
      label: labels.stock.awaitingStock
    },
    {
      active: current === "ready_to_pack",
      at: order.workflowTimeline.allocatedAt,
      complete:
        Boolean(order.workflowTimeline.allocatedAt) ||
        current === "ready_to_pack" ||
        current === "ready_to_ship" ||
        current === "pickup_booked" ||
        current === "sent",
      key: "ready_to_pack",
      label: labels.stock.readyToPack
    },
    {
      active: current === "ready_to_ship",
      at: order.workflowTimeline.boxedAt ?? order.workflowTimeline.allocatedAt,
      complete:
        Boolean(order.workflowTimeline.boxedAt) ||
        current === "ready_to_ship" ||
        current === "pickup_booked" ||
        current === "sent",
      key: "ready_to_ship",
      label: labels.stock.readyToShip
    },
    {
      active: false,
      at: order.workflowTimeline.pickupBookedAt,
      complete:
        Boolean(order.workflowTimeline.pickupBookedAt) ||
        current === "pickup_booked" ||
        current === "sent",
      key: "pickup_booked",
      label: labels.stock.pickupBooked
    },
    {
      active: current === "pickup_booked",
      at: order.workflowTimeline.sentAt,
      complete: Boolean(order.workflowTimeline.sentAt) || current === "sent",
      key: "sent",
      label: labels.stock.sent
    }
  ] as const;
}
