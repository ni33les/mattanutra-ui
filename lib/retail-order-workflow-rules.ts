export type RetailWorkflowCustomerOrderStatus =
  | "allocated"
  | "awaiting_stock"
  | "cancelled"
  | "delivered"
  | "draft"
  | "packed"
  | "picking"
  | "placed"
  | "returned"
  | "shipped";

export type RetailWorkflowStage =
  | "allocate"
  | "awaiting_stock"
  | "cancelled"
  | "deliver"
  | "delivered"
  | "pack"
  | "pickup_booked"
  | "pick"
  | "returned"
  | "ship"
  | "terminal";

export type RetailWorkflowShipment = Readonly<{
  pickupBookedAt?: string | null;
  pickupProviderStatus?: string | null;
  status?: string | null;
}>;

export type RetailWorkflowTaskDetails = Readonly<{
  description: string;
  priorityReason: string;
  priorityScore: number;
  title: string;
}>;

export function workflowStageForStatus(
  status: RetailWorkflowCustomerOrderStatus
): RetailWorkflowStage {
  if (status === "cancelled") {
    return "cancelled";
  }

  if (status === "returned") {
    return "returned";
  }

  if (status === "delivered") {
    return "delivered";
  }

  if (status === "shipped") {
    return "deliver";
  }

  if (status === "packed") {
    return "ship";
  }

  if (status === "picking" || status === "allocated") {
    return "pack";
  }

  if (status === "awaiting_stock") {
    return "awaiting_stock";
  }

  if (status === "placed" || status === "draft") {
    return "allocate";
  }

  return "terminal";
}

export function customerOrderPickupInProgress(
  status: RetailWorkflowCustomerOrderStatus,
  shipment: RetailWorkflowShipment | null
) {
  if (
    !shipment ||
    status === "shipped" ||
    status === "delivered" ||
    status === "cancelled" ||
    status === "returned"
  ) {
    return false;
  }

  const providerStatus = shipment.pickupProviderStatus?.trim().toLowerCase();

  return Boolean(
    shipment.pickupBookedAt ||
      shipment.status === "pickup_booked" ||
      providerStatus === "booked" ||
      providerStatus === "queued" ||
      providerStatus === "requested"
  );
}

export function expectedTaskTypeForStage(stage: RetailWorkflowStage) {
  if (stage === "allocate") {
    return "retail_customer_order_allocate";
  }

  if (stage === "awaiting_stock") {
    return "retail_shopping_list_review";
  }

  if (stage === "pick") {
    return "retail_order_pick";
  }

  if (stage === "pack") {
    return "retail_order_pack";
  }

  if (stage === "pickup_booked") {
    return "retail_order_ship";
  }

  if (stage === "ship") {
    return "retail_order_ship";
  }

  if (stage === "deliver") {
    return "retail_order_delivery_confirm";
  }

  return null;
}

export function workflowActionForStage(stage: RetailWorkflowStage) {
  if (stage === "allocate") {
    return "allocate";
  }

  if (stage === "awaiting_stock") {
    return "resolve_stock";
  }

  if (stage === "pick") {
    return "mark_picking";
  }

  if (stage === "pack") {
    return "mark_packed";
  }

  if (stage === "pickup_booked") {
    return "mark_shipped";
  }

  if (stage === "ship") {
    return "mark_shipped";
  }

  if (stage === "deliver") {
    return "mark_delivered";
  }

  return null;
}

export function workflowTaskTypeForAction(action: string) {
  if (action === "cancel") {
    return "retail_order_cancel_review";
  }

  if (action === "mark_delivered") {
    return "retail_order_delivery_confirm";
  }

  if (action === "mark_packed") {
    return "retail_order_pack";
  }

  if (action === "mark_picking") {
    return "retail_order_pick";
  }

  if (action === "mark_shipped") {
    return "retail_order_ship";
  }

  if (action === "return") {
    return "retail_order_return_review";
  }

  return null;
}

export function retailOrderWorkflowTaskDetails(
  taskType: string
): RetailWorkflowTaskDetails {
  if (taskType === "retail_customer_order_allocate") {
    return {
      description: "Allocate live stock to this customer order.",
      priorityReason:
        "Workflow repair restored allocation work because live stock is available.",
      priorityScore: 700,
      title: "Allocate customer order"
    };
  }

  if (taskType === "retail_shopping_list_review") {
    return {
      description: "Review reorder advice for this waiting order.",
      priorityReason: "Workflow repair restored stock-gap review work.",
      priorityScore: 780,
      title: "Review customer order stock gap"
    };
  }

  if (taskType === "retail_order_ship") {
    return {
      description: "Pack the allocated order and mark it shipped when handed over.",
      priorityReason: "Workflow repair restored ship-ready order work.",
      priorityScore: 720,
      title: "Ship customer order"
    };
  }

  if (taskType === "retail_order_delivery_confirm") {
    return {
      description: "Confirm the shipped order has been delivered.",
      priorityReason: "Workflow repair restored delivery confirmation work.",
      priorityScore: 360,
      title: "Confirm customer delivery"
    };
  }

  if (taskType === "retail_order_cancel_review") {
    return {
      description: "Review and confirm cancellation of this customer order.",
      priorityReason: "Cancellation requires an auditable workflow task.",
      priorityScore: 520,
      title: "Review customer order cancellation"
    };
  }

  if (taskType === "retail_order_return_review") {
    return {
      description: "Review and confirm return of this customer order.",
      priorityReason: "Return handling requires an auditable workflow task.",
      priorityScore: 540,
      title: "Review customer order return"
    };
  }

  return {
    description: "Continue this customer order workflow.",
    priorityReason: "Workflow repair restored missing order work.",
    priorityScore: 650,
    title: "Continue customer order"
  };
}
