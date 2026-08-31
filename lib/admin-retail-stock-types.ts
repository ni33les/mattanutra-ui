import type postgres from "postgres";
import type { AdminOrganisation } from "@/lib/admin-access";
import type { getSql } from "@/lib/db";
import type {
  BackorderPolicy,
  RetailAvailabilityStatus,
  RetailRoutingPreference
} from "@/lib/retail-cart-availability";

export type Db = NonNullable<ReturnType<typeof getSql>>;
export type StockDb = postgres.Sql | postgres.TransactionSql;

export type RetailStockStatus = "active" | "disabled" | "deleted";
export type RetailStockLotStatus = "active" | "depleted" | "disabled" | "deleted";
export type RetailStockMovementType =
  | "adjustment"
  | "expiry_write_off"
  | "receive"
  | "return"
  | "sale"
  | "transfer_in"
  | "transfer_out"
  | "void";
export type RetailStockReorderRisk = "ok" | "out_of_stock" | "reorder" | "watch";
export type RetailStockAdviceConfidence = "high" | "low" | "medium";
export type RetailShoppingListStatus = "active" | "closed";
export type RetailCustomerOrderStatus =
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
export type RetailOrderWorkflowStage =
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
export type RetailTaskPriorityBand = "high" | "low" | "normal" | "urgent";
export type RetailStockPipelineStatus =
  | "available_now"
  | "backorder"
  | "partially_allocated"
  | "unordered";

export type RetailAgentCommandInput = Readonly<{
  organisationId: string;
  payload: Record<string, unknown>;
  sourceEntityId: string | null;
  sourceEntityType: string | null;
  taskId: string;
  taskType: string;
}>;

export type AdminRetailStockPipelineRow = Readonly<{
  allocatedUnits: number;
  availableNowUnits: number;
  backedAllocatedUnits: number;
  customerDemandUnits: number;
  customerOrderId: string | null;
  customerOrderLineId: string | null;
  organisationId: string;
  orderNumber: string | null;
  productId: string | null;
  productTitle: string | null;
  shippedUnits: number;
  status: RetailStockPipelineStatus;
  unorderedNeedUnits: number;
}>;

export type AdminRetailStockOrganisation = Readonly<{
  countryCode: string;
  currency: string;
  id: string;
  name: string;
  status: AdminOrganisation["status"];
}>;

export type AdminRetailStockProductOption = Readonly<{
  brandName: string | null;
  ean13: string | null;
  id: string;
  imageUrl: string | null;
  manufacturerSku: string | null;
  productKind: string;
  title: string;
}>;

export type AdminRetailStockRow = Readonly<{
  backorderPolicy: BackorderPolicy;
  brandName: string | null;
  currency: string;
  ean13: string | null;
  id: string;
  imageUrl: string | null;
  leadTimeDays: number;
  manufacturerSku: string | null;
  notes: string | null;
  organisationId: string;
  organisationName: string;
  productId: string;
  productKind: string;
  productStatus: string;
  productTitle: string;
  retailPriceAmount: number | null;
  retailOverridePriceAmount: number | null;
  retailSellableProductId: string | null;
  status: RetailStockStatus;
  stockQuantity: number;
  updatedAt: string;
  wholesalePriceAmount: number | null;
}>;

export type AdminRetailStockLot = Readonly<{
  currency: string;
  expiresAt: string | null;
  id: string;
  notes: string | null;
  organisationId: string;
  productId: string;
  productTitle: string;
  receivedAt: string;
  receivedQuantity: number;
  remainingQuantity: number;
  status: RetailStockLotStatus;
  stockId: string;
  wholesalePriceAmount: number | null;
}>;

export type AdminRetailStockMovement = Readonly<{
  currency: string;
  id: string;
  isVoided: boolean;
  lotId: string | null;
  movementType: RetailStockMovementType;
  notes: string | null;
  occurredAt: string;
  organisationId: string;
  organisationName: string;
  productId: string;
  productTitle: string;
  quantityDelta: number;
  reason: string | null;
  retailPriceAmount: number | null;
  stockId: string;
  unitCostAmount: number | null;
  voidsMovementId: string | null;
}>;

export type AdminRetailStockReorderAdvice = Readonly<{
  calculatedAt: string;
  confidence: RetailStockAdviceConfidence;
  currentStockQuantity: number;
  daysCover: number | null;
  id: string;
  leadTimeDays: number;
  organisationId: string;
  organisationName: string;
  outflowUnits30d: number;
  productId: string;
  productTitle: string;
  recommendationPressureCount: number;
  reorderBy: string | null;
  riskLevel: RetailStockReorderRisk;
  stockId: string;
  suggestedOrderQuantity: number;
}>;

export type AdminRetailOperationsTask = Readonly<{
  actorType: string;
  agentName: string | null;
  claimedAt: string | null;
  claimedByEmail: string | null;
  claimedByName: string | null;
  claimedByPersonId: string | null;
  dueAt: string | null;
  id: string;
  isAgentTask: boolean;
  organisationId: string;
  organisationName: string;
  pipeline: AdminRetailStockPipelineRow | null;
  priorityBand: RetailTaskPriorityBand;
  priorityReason: string | null;
  priorityScore: number;
  profitImpactAmount: number | null;
  profitImpactCurrency: string | null;
  scheduledFor: string;
  sourceEntityId: string | null;
  sourceEntityType: string | null;
  status: string;
  taskType: string;
  title: string;
  updatedAt: string;
}>;

export type AdminRetailAuditEvent = Readonly<{
  action: string;
  actorEmail: string | null;
  actorName: string | null;
  agentName: string | null;
  details: Record<string, unknown>;
  id: string;
  occurredAt: string;
  organisationId: string;
  organisationName: string;
  resourceId: string | null;
  resourceType: string | null;
  severity: string | null;
  source: "admin" | "bpm" | "task";
  status: string | null;
}>;

export type AdminRetailCustomerOrderRoutingSnapshot = Readonly<{
  etaDate: string | null;
  payableLineCount: number;
  preference: RetailRoutingPreference | null;
  selectedRetailerName: string | null;
  selectedRetailerOrganisationId: string | null;
  shippingCountry: string | null;
  subtotalAmount: number | null;
  unavailableLines: readonly Readonly<{
    productId: string;
    quantityRequested: number;
    reason: string;
  }>[];
}>;

export type AdminRetailCustomerOrderPricingSnapshot = Readonly<{
  currency: string;
  fxFallbackUsed: boolean;
  fxRateId: string | null;
  shippingAmount: number;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  usdRate: number;
}>;

export type AdminRetailCustomerOrderPromise = Readonly<{
  backorderLineCount: number;
  etaDate: string | null;
  mode: "backorder" | "stock";
}>;

export type AdminRetailCustomerOrderAddress = Readonly<{
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string | null;
  customerEmail: string | null;
  customerName: string | null;
  notes: string | null;
  phone: string | null;
  postalCode: string | null;
  province: string | null;
}>;

export type AdminRetailCustomerOrderDeliveryDetails = Readonly<{
  billingAddress: AdminRetailCustomerOrderAddress | null;
  billingSameAsShipping: boolean;
  shippingAddress: AdminRetailCustomerOrderAddress | null;
}>;

export type AdminRetailCustomerOrderShipment = Readonly<{
  carrierId: string | null;
  carrierName: string | null;
  exceptionCode: string | null;
  exceptionMessage: string | null;
  labelContentBase64: string | null;
  labelContentType: string | null;
  labelStatus: string | null;
  labelUrl: string | null;
  pickupBookedAt: string | null;
  pickupProviderStatus: string | null;
  pickupWindowEnd: string | null;
  pickupWindowStart: string | null;
  shippedAt: string | null;
  shippedByPersonId: string | null;
  shipmentNotes: string | null;
  status: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
}>;

export type AdminRetailCustomerOrderActionState = Readonly<{
  enabled: boolean;
  reason: string | null;
}>;

export type AdminRetailCustomerOrderActionStates = Readonly<{
  allocateAvailable: AdminRetailCustomerOrderActionState;
  bookPickup: AdminRetailCustomerOrderActionState;
  deliver: AdminRetailCustomerOrderActionState;
  pack: AdminRetailCustomerOrderActionState;
  pick: AdminRetailCustomerOrderActionState;
  recheckWorkflow: AdminRetailCustomerOrderActionState;
  ship: AdminRetailCustomerOrderActionState;
}>;

export type AdminRetailCustomerOrderWorkflowHealth = Readonly<{
  expectedTaskType: string | null;
  isStuck: boolean;
  nextAction: string | null;
  reason: string | null;
}>;

export type AdminRetailCustomerOrderWorkflowTimeline = Readonly<{
  allocatedAt: string | null;
  awaitingStockAt: string | null;
  boxedAt: string | null;
  orderedAt: string | null;
  pickupBookedAt: string | null;
  sentAt: string | null;
}>;

export type AdminRetailCarrierAccount = Readonly<{
  capabilities: string[];
  carrierId: string;
  displayName: string | null;
  id: string;
  lastTestStatus: string | null;
  lastTestedAt: string | null;
  organisationId: string;
  status: string;
  updatedAt: string;
}>;

export type AdminRetailShoppingList = Readonly<{
  actualUnits: number;
  createdAt: string;
  currency: string;
  id: string;
  lineCount: number;
  listNumber: string;
  organisationId: string;
  organisationName: string;
  requiredUnits: number;
  status: RetailShoppingListStatus;
  stockedUnits: number;
  updatedAt: string;
}>;

export type AdminRetailShoppingListLine = Readonly<{
  actualQuantity: number;
  assignedQuantity: number;
  brandName: string | null;
  currentStockQuantity: number;
  ean13: string | null;
  id: string;
  manufacturerSku: string | null;
  organisationId: string;
  productId: string;
  productTitle: string;
  requiredQuantity: number;
  retailPriceAmount: number | null;
  shoppingListId: string;
  stockedQuantity: number;
  unorderedNeedQuantity: number;
  wholesalePriceAmount: number | null;
}>;

export type AdminRetailCustomerOrder = Readonly<{
  actionStates: AdminRetailCustomerOrderActionStates;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  deliveredAt: string | null;
  deliveryDetails: AdminRetailCustomerOrderDeliveryDetails | null;
  dueAt: string | null;
  fulfillmentPromise: AdminRetailCustomerOrderPromise | null;
  id: string;
  isStuck: boolean;
  lineCount: number;
  lastWorkflowEventAt: string | null;
  notes: string | null;
  nextExpectedAction: string | null;
  nextExpectedTaskType: string | null;
  openTaskCount: number;
  orderNumber: string;
  orderedUnits: number;
  organisationId: string;
  organisationName: string;
  planId: string | null;
  planInsertAvailable: boolean;
  placedAt: string | null;
  pipeline: AdminRetailStockPipelineRow | null;
  pricingSnapshot: AdminRetailCustomerOrderPricingSnapshot | null;
  routingSnapshot: AdminRetailCustomerOrderRoutingSnapshot | null;
  shippedAt: string | null;
  shippedUnits: number;
  shipment: AdminRetailCustomerOrderShipment | null;
  source: "checkout" | "manual";
  status: RetailCustomerOrderStatus;
  stuckReason: string | null;
  taskCount: number;
  totalRetailAmount: number | null;
  updatedAt: string;
  workflowStage: RetailOrderWorkflowStage;
  workflowHealth: AdminRetailCustomerOrderWorkflowHealth;
  workflowTimeline: AdminRetailCustomerOrderWorkflowTimeline;
  workflowTaskIds: readonly string[];
}>;

export type AdminRetailCustomerOrderLine = Readonly<{
  availabilityStatus: RetailAvailabilityStatus | null;
  backorderQuantity: number | null;
  customerOrderId: string;
  ean13: string | null;
  etaDate: string | null;
  fxRateId: string | null;
  id: string;
  manufacturerSku: string | null;
  notes: string | null;
  pipeline: AdminRetailStockPipelineRow | null;
  priceSource: string | null;
  productId: string;
  productTitle: string;
  quantityAllocated: number;
  quantityAvailableNow: number | null;
  quantityOrdered: number;
  quantityShipped: number;
  reason: string | null;
  retailPriceAmount: number | null;
  retailSellableProductId: string | null;
  usdRate: number | null;
}>;

export type AdminRetailStockData = Readonly<{
  canFilterOrganisation: boolean;
  canRouteRegionalCheckout: boolean;
  canWrite: boolean;
  approvedProductCount: number;
  auditEvents: AdminRetailAuditEvent[];
  carrierAccounts: AdminRetailCarrierAccount[];
  customerOrderLines: AdminRetailCustomerOrderLine[];
  customerOrders: AdminRetailCustomerOrder[];
  databaseAvailable: boolean;
  generatedAt: string;
  lots: AdminRetailStockLot[];
  movements: AdminRetailStockMovement[];
  organisations: AdminRetailStockOrganisation[];
  pipeline: AdminRetailStockPipelineRow[];
  productOptions: AdminRetailStockProductOption[];
  reorderAdvice: AdminRetailStockReorderAdvice[];
  rows: AdminRetailStockRow[];
  shoppingListLines: AdminRetailShoppingListLine[];
  shoppingLists: AdminRetailShoppingList[];
  tasks: AdminRetailOperationsTask[];
}>;

export type UpsertRetailStockItemInput = Readonly<{
  backorderPolicy?: BackorderPolicy | null;
  leadTimeDays?: number | null;
  notes?: string | null;
  organisationId?: string | null;
  productId: string;
  retailPriceAmount?: number | null;
  status?: RetailStockStatus;
  stockQuantity?: number | null;
  wholesalePriceAmount?: number | null;
}>;

export type RecordRetailStockMovementInput = Readonly<{
  deferAllocationIntegrityRepair?: boolean;
  deferReorderSideEffects?: boolean;
  expiresAt?: string | null;
  lotId?: string | null;
  movementType: Exclude<RetailStockMovementType, "void">;
  notes?: string | null;
  quantity: number;
  reason?: string | null;
  retailPriceAmount?: number | null;
  stockId: string;
  unitCostAmount?: number | null;
}>;

export type RetailCustomerOrderLineInput = Readonly<{
  notes?: string | null;
  productId: string;
  quantityOrdered: number;
  retailPriceAmount?: number | null;
}>;

export type RetailShoppingListLineInput = Readonly<{
  actualQuantity?: number | null;
  assignedQuantity?: number | null;
  currentStockQuantity?: number | null;
  productId: string;
  requiredQuantity: number;
  retailPriceAmount?: number | null;
  unorderedNeedQuantity?: number | null;
  wholesalePriceAmount?: number | null;
}>;

export type CreateRetailShoppingListInput = Readonly<{
  lines: RetailShoppingListLineInput[];
  notes?: string | null;
  organisationId?: string | null;
}>;

export type UpdateRetailShoppingListInput = Readonly<{
  lines: ReadonlyArray<RetailShoppingListLineInput & { id?: string | null }>;
  shoppingListId: string;
  status?: RetailShoppingListStatus | null;
}>;

export type UpdateRetailShoppingListResult = Readonly<{
  affectedOrderIds: readonly string[];
  affectedProductIds: readonly string[];
  movementCount: number;
  movementDeltaUnits: number;
  refreshPending: boolean;
  refreshedReorderAdviceCount: number;
  reorderAdviceUpdated: boolean;
  shoppingListId: string;
  status: RetailShoppingListStatus;
  timingsMs: Readonly<{
    allocationRetry: number;
    lineFetch: number;
    lineUpdates: number;
    movementCreation: number;
    reorderAdviceRefresh: number;
    total: number;
  }>;
}>;

export type ReopenRetailShoppingListInput = Readonly<{
  shoppingListId: string;
}>;

export type RetailOrderReorderAdviceShortageResult = Readonly<{
  lineCount: number;
  productIds: readonly string[];
  refreshedStockRowIds: readonly string[];
  shortageUnits: number;
}>;

export type RetailCustomerOrderLineAvailability = Readonly<{
  availabilityStatus: RetailAvailabilityStatus;
  backorderQuantity: number;
  currency: string | null;
  etaDate: string | null;
  line: RetailCustomerOrderLineInput;
  priceAmount: number;
  quantityAvailableNow: number;
  reason: string;
  retailSellableProductId: string | null;
  /** Unit wholesale in major currency; null when missing on sellable/stock. */
  wholesalePriceAmount: number | null;
}>;

export type CreateRetailCustomerOrderInput = Readonly<{
  customerEmail?: string | null;
  customerName?: string | null;
  dueAt?: string | null;
  lines: RetailCustomerOrderLineInput[];
  notes?: string | null;
  orderNumber?: string | null;
  organisationId?: string | null;
  routingPreference?: RetailRoutingPreference | null;
  selectedRetailerOrganisationId?: string | null;
  shippingCountry?: string | null;
  source?: "checkout" | "manual" | null;
}>;

export type RetailStockSnapshotEvent = "created" | "movement" | "status_changed" | "updated";

export type RetailStockSnapshotRow = Readonly<{
  currency: string;
  id: string;
  lead_time_days: number | string;
  notes: string | null;
  organisation_id: string;
  product_id: string;
  retail_price_amount: number | string | null;
  status: string;
  stock_quantity: number | string;
  wholesale_price_amount: number | string | null;
}>;
