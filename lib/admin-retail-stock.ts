import type postgres from "postgres";
import { getSql } from "@/lib/db";
import {
  recordAdminAudit,
  type AdminMembership,
  type AdminOrganisation,
  type AdminPerson,
  type AdminSessionContext
} from "@/lib/admin-access";
import { queueAdminOrganisationCommunication } from "@/lib/communications";
import { hasAdminPermission, permissionsForRole } from "@/lib/admin-rbac";
import { isLocale, type Locale } from "@/lib/i18n";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { addTaskEvent, createTask } from "@/lib/task-service";
import { resolveUsdRateForCurrency } from "@/lib/finance-fx";
import {
  markRetailOrderSettlementDue,
  markRetailOrderSettlementNeedsReview,
  voidPendingRetailOrderSettlement
} from "@/lib/admin-retail-financials";
import {
  getRetailCartLineAvailability,
  normalizeRetailRoutingPreference,
  resolveRegionalBasketAvailability,
  type BackorderPolicy,
  type RegionalBasketAvailability,
  type RetailAvailabilityStatus,
  type RetailRoutingPreference
} from "@/lib/retail-cart-availability";
import {
  defaultProductCountryCode,
  normalizeProductCountryCode
} from "@/lib/product-countries";
import {
  customerOrderStatus,
  customerOrderSource,
  integerOrDefault,
  isoDateOrNull,
  isoDateTime,
  isoDateTimeOrNull,
  lotStatus,
  movementDelta,
  movementType,
  normalizeCurrency,
  numberOrNull,
  objectRecord,
  orderNumber,
  priorityBand,
  shoppingListStatus,
  stockBackorderPolicy,
  stockStatus,
  stringMetadata
} from "@/lib/admin-retail-stock-codecs";
import {
  customerOrderWorkflowTimeline,
  deliveryDetailsFromMetadata,
  fulfillmentPromiseFromMetadata,
  getRetailCustomerOrderActionStates,
  getRetailCustomerOrderWorkflowHealth,
  isTerminalTaskStatus,
  lineAvailabilityFromMetadata,
  mergeCustomerOrderShipment,
  pricingSnapshotFromMetadata,
  routingSnapshotFromMetadata,
  shipmentFromMetadata
} from "@/lib/admin-retail-order-read-model";
import {
  recordRetailOrderWorkflowBpm,
  retailOrderStatusBpmEventName,
  sendRetailOrderWorkflowEmail,
  transitionRetailCustomerOrder
} from "@/lib/retail-order-workflow";
import {
  customerOrderPickupInProgress,
  expectedTaskTypeForStage,
  retailOrderWorkflowTaskDetails,
  workflowStageForStatus,
  workflowTaskTypeForAction
} from "@/lib/retail-order-workflow-rules";
import {
  assertRetailAgentCommandTask,
  completeRetailCommandTask,
  ensureRetailCommandTask,
  recordRetailCommandAudit,
  recordRetailCommandBpm,
  retailCommandIdempotencyKey,
  retailCommandRegistry,
  type RetailCommandId
} from "@/lib/retail-command-registry";
import { RETAIL_ORDER_WORKFLOW_TASK_TYPES } from "@/lib/retail-task-policy";

export { getRetailCustomerOrderActionStates } from "@/lib/admin-retail-order-read-model";

type Db = NonNullable<ReturnType<typeof getSql>>;
type StockDb = postgres.Sql | postgres.TransactionSql;

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
  id: string;
  imageUrl: string | null;
  productKind: string;
  title: string;
}>;

export type AdminRetailStockRow = Readonly<{
  backorderPolicy: BackorderPolicy;
  brandName: string | null;
  currency: string;
  id: string;
  imageUrl: string | null;
  leadTimeDays: number;
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

type RetailOrderReorderAdviceShortageResult = Readonly<{
  lineCount: number;
  productIds: readonly string[];
  refreshedStockRowIds: readonly string[];
  shortageUnits: number;
}>;

type RetailCustomerOrderLineAvailability = Readonly<{
  availabilityStatus: RetailAvailabilityStatus;
  backorderQuantity: number;
  currency: string | null;
  etaDate: string | null;
  line: RetailCustomerOrderLineInput;
  priceAmount: number;
  quantityAvailableNow: number;
  reason: string;
  retailSellableProductId: string | null;
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

type RetailStockSnapshotEvent = "created" | "movement" | "status_changed" | "updated";

type RetailStockSnapshotRow = Readonly<{
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

async function operationalStockTablesAvailable(sql: StockDb) {
  const rows = await sql<Array<{ available: boolean }>>`
    select (
      to_regclass('public.retail_stock_lots') is not null
      and to_regclass('public.retail_stock_movements') is not null
      and to_regclass('public.retail_stock_reorder_advice') is not null
    ) as available
  `;

  return Boolean(rows[0]?.available);
}

async function retailOperationsTablesAvailable(sql: StockDb) {
  const rows = await sql<Array<{ available: boolean }>>`
    select (
      to_regclass('public.retail_customer_orders') is not null
      and to_regclass('public.retail_customer_order_lines') is not null
      and to_regclass('public.retail_order_allocations') is not null
    ) as available
  `;

  return Boolean(rows[0]?.available);
}

async function retailShoppingListTablesAvailable(sql: StockDb) {
  const rows = await sql<Array<{ available: boolean }>>`
    select (
      to_regclass('public.retail_shopping_lists') is not null
      and to_regclass('public.retail_shopping_list_lines') is not null
    ) as available
  `;

  return Boolean(rows[0]?.available);
}

async function ensureRetailShoppingListTablesAvailable(sql: StockDb) {
  if (!(await retailShoppingListTablesAvailable(sql))) {
    throw new Error("Retail shopping list tables are not available");
  }
}

function canWriteRetailStock(context: AdminSessionContext) {
  return hasAdminPermission(context, "stock.write") && !context.isLegacy;
}

function canRouteRegionalCheckout(context: AdminSessionContext) {
  return canWriteRetailStock(context) && context.actorOrganisation.type === "platform";
}

function canReadAllRetailStock(context: AdminSessionContext) {
  return context.effectiveOrganisation.type === "platform";
}

function canAccessRetailOrganisation(
  context: AdminSessionContext,
  organisationId: string
) {
  return canReadAllRetailStock(context) ||
    organisationId === context.effectiveOrganisation.id;
}

function persistedActorPersonId(context: AdminSessionContext) {
  return context.actorPerson.id.startsWith("00000000-0000-4000-8000-")
    ? null
    : context.actorPerson.id;
}

function retailActorMetadata(context: AdminSessionContext) {
  return {
    actorDisplayName: context.actorPerson.displayName,
    actorEmail: context.actorPerson.email,
    actorKind: context.sessionId?.startsWith("task:") ? "agent" : "human",
    actorPersonId: context.actorPerson.id,
    persistedActorPersonId: persistedActorPersonId(context)
  };
}

async function customerOrderPickupInProgressFromShipmentTable(
  sql: StockDb,
  orderId: string
) {
  const ready = (await sql<Array<{ ready: boolean }>>`
    select to_regclass('public.retail_order_shipments') is not null as ready
  `)[0]?.ready === true;

  if (!ready) {
    return false;
  }

  const rows = await sql<Array<{ in_progress: boolean }>>`
    select exists (
      select 1
      from public.retail_order_shipments
      where retail_customer_order_id = ${orderId}::uuid
        and (
          pickup_booked_at is not null
          or status = 'pickup_booked'
          or lower(coalesce(pickup_provider_status, '')) in ('booked', 'queued', 'requested')
        )
    ) as in_progress
  `;

  return rows[0]?.in_progress === true;
}

function retailCommandIdForTaskType(taskType: string): RetailCommandId | null {
  if (taskType === "retail_customer_order_allocate") {
    return "allocate_customer_order";
  }

  if (taskType === "retail_stock_forecast_refresh") {
    return "refresh_stock_reorder_advice";
  }

  if (taskType === "retail_shopping_list_review") {
    return "sync_order_shortages_to_reorder_advice";
  }

  if (
    taskType === "retail_order_cancel_review" ||
    taskType === "retail_order_delivery_confirm" ||
    taskType === "retail_order_pick" ||
    taskType === "retail_order_pack" ||
    taskType === "retail_order_return_review" ||
    taskType === "retail_order_ship"
  ) {
    return "advance_customer_order";
  }

  return null;
}

function textFromPayload(
  payload: Record<string, unknown>,
  key: string
) {
  const value = payload[key];

  return typeof value === "string" ? value.trim() : "";
}

async function retailAgentSessionContext(
  sql: StockDb,
  input: Readonly<{ organisationId: string; taskId: string }>
): Promise<AdminSessionContext> {
  const organisationRows = await sql<Array<{
    country_code: string;
    currency: string;
    default_locale: string;
    id: string;
    name: string;
    organisation_type: string;
    slug: string;
    status: string;
  }>>`
    select
      id::text,
      slug,
      name,
      organisation_type,
      status,
      default_locale,
      country_code,
      currency
    from public.organisations
    where id = ${input.organisationId}::uuid
      and status = 'active'
    limit 1
  `;
  const row = organisationRows[0];

  if (!row) {
    throw new Error("Retail command organisation not found");
  }

  const organisation: AdminOrganisation = {
    countryCode: row.country_code,
    currency: row.currency,
    defaultLocale: isLocale(row.default_locale) ? row.default_locale : "en",
    id: row.id,
    name: row.name,
    slug: row.slug,
    status:
      row.status === "archived" || row.status === "disabled"
        ? row.status
        : "active",
    type: row.organisation_type === "platform" ? "platform" : "tenant"
  };
  const actorPerson: AdminPerson = {
    displayName: "Retail workflow agent",
    email: "retail-agent@mattanutra.local",
    id: "00000000-0000-4000-8000-000000000003",
    preferredLocale: organisation.defaultLocale,
    status: "active"
  };
  const actorMembership: AdminMembership = {
    id: "00000000-0000-4000-8000-000000000004",
    organisationId: organisation.id,
    personId: actorPerson.id,
    role: "retail_agent",
    status: "active",
    title: "Retail workflow agent"
  };

  return {
    actorMembership,
    actorOrganisation: organisation,
    actorPerson,
    assumedMembership: null,
    assumedOrganisation: null,
    assumedPerson: null,
    csrfToken: null,
    effectiveMembership: actorMembership,
    effectiveOrganisation: organisation,
    effectivePerson: actorPerson,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    isLegacy: false,
    permissions: [...permissionsForRole("retail_agent")],
    role: "retail_agent",
    sessionCookie: null,
    sessionId: `task:${input.taskId}`
  };
}

function canOverrideRetailTaskClaim(context: AdminSessionContext) {
  return (
    context.actorOrganisation.type === "platform" &&
    (context.actorMembership.role === "platform_owner" ||
      context.actorMembership.role === "platform_admin")
  );
}

function pipelineStatus(input: Readonly<{
  allocatedUnits: number;
  availableNowUnits: number;
  customerDemandUnits: number;
  unorderedNeedUnits: number;
}>): RetailStockPipelineStatus {
  if (input.unorderedNeedUnits > 0) {
    return "unordered";
  }

  if (
    input.allocatedUnits > 0 &&
    input.allocatedUnits < input.customerDemandUnits
  ) {
    return "partially_allocated";
  }

  if (input.availableNowUnits > 0 || input.allocatedUnits >= input.customerDemandUnits) {
    return "available_now";
  }

  return "backorder";
}

function aggregatePipelineRows(
  rows: readonly AdminRetailStockPipelineRow[],
  customerOrderId: string
): AdminRetailStockPipelineRow | null {
  const orderRows = rows.filter((row) => row.customerOrderId === customerOrderId);

  if (orderRows.length === 0) {
    return null;
  }

  const totals = orderRows.reduce(
    (total, row) => ({
      allocatedUnits: total.allocatedUnits + row.allocatedUnits,
      availableNowUnits: total.availableNowUnits + row.availableNowUnits,
      backedAllocatedUnits:
        total.backedAllocatedUnits + row.backedAllocatedUnits,
      customerDemandUnits: total.customerDemandUnits + row.customerDemandUnits,
      shippedUnits: total.shippedUnits + row.shippedUnits,
      unorderedNeedUnits: total.unorderedNeedUnits + row.unorderedNeedUnits
    }),
    {
      allocatedUnits: 0,
      availableNowUnits: 0,
      backedAllocatedUnits: 0,
      customerDemandUnits: 0,
      shippedUnits: 0,
      unorderedNeedUnits: 0
    }
  );

  return {
    ...totals,
    customerOrderId,
    customerOrderLineId: null,
    organisationId: orderRows[0]?.organisationId ?? "",
    orderNumber: orderRows[0]?.orderNumber ?? null,
    productId: null,
    productTitle: null,
    status: pipelineStatus({
      ...totals,
      allocatedUnits: totals.backedAllocatedUnits
    })
  };
}

function pipelineKey(
  customerOrderLineId: string | null | undefined,
  productId: string | null | undefined
) {
  return `${customerOrderLineId ?? "product"}:${productId ?? "all"}`;
}

export async function getRetailStockPipeline(input: Readonly<{
  customerOrderId?: string | null;
  locale: Locale;
  organisationIds: readonly string[];
  productId?: string | null;
  sql?: StockDb;
}>): Promise<AdminRetailStockPipelineRow[]> {
  const sql = input.sql ?? getSql();

  if (!sql || input.organisationIds.length === 0) {
    return [];
  }

  const productTitle = localizedProductTitleExpression(sql, input.locale);
  const rows = await sql<Array<{
    active_allocated_units: number | string | null;
    allocated_units: number | string | null;
    customer_demand_units: number | string | null;
    customer_order_id: string;
    customer_order_line_id: string;
    order_number: string;
    organisation_id: string;
    physical_stock_units: number | string | null;
    product_id: string;
    product_title: string;
    shipped_units: number | string | null;
  }>>`
    with order_lines as (
      select
        retail_customer_order_lines.id,
        retail_customer_order_lines.customer_order_id,
        retail_customer_order_lines.organisation_id,
        retail_customer_order_lines.product_id,
        greatest(
          retail_customer_order_lines.quantity_ordered
            - retail_customer_order_lines.quantity_shipped,
          0
        )::int as customer_demand_units,
        retail_customer_order_lines.quantity_allocated::int as allocated_units,
        retail_customer_order_lines.quantity_shipped::int as shipped_units,
        retail_customer_orders.order_number
      from public.retail_customer_order_lines
      join public.retail_customer_orders
        on retail_customer_orders.id = retail_customer_order_lines.customer_order_id
      where retail_customer_order_lines.organisation_id = any(${input.organisationIds}::uuid[])
        and retail_customer_orders.status not in ('cancelled', 'delivered', 'returned')
        and (
          ${input.customerOrderId ?? null}::uuid is null
          or retail_customer_order_lines.customer_order_id = ${input.customerOrderId ?? null}::uuid
        )
        and (
          ${input.productId ?? null}::uuid is null
          or retail_customer_order_lines.product_id = ${input.productId ?? null}::uuid
        )
    ),
    physical_stock as (
      select
        organisation_id,
        product_id,
        coalesce(sum(stock_quantity), 0)::int as physical_stock_units
      from public.retail_product_stock
      where organisation_id = any(${input.organisationIds}::uuid[])
        and status = 'active'
      group by organisation_id, product_id
    ),
    active_allocations as (
      select
        organisation_id,
        product_id,
        coalesce(sum(quantity_allocated), 0)::int as active_allocated_units
      from public.retail_order_allocations
      where organisation_id = any(${input.organisationIds}::uuid[])
        and status in ('active', 'picked')
      group by organisation_id, product_id
    )
    select
      order_lines.id::text as customer_order_line_id,
      order_lines.customer_order_id::text,
      order_lines.organisation_id::text,
      order_lines.product_id::text,
      order_lines.order_number,
      ${productTitle} as product_title,
      order_lines.customer_demand_units,
      order_lines.allocated_units,
      order_lines.shipped_units,
      coalesce(physical_stock.physical_stock_units, 0)::int as physical_stock_units,
      coalesce(active_allocations.active_allocated_units, 0)::int as active_allocated_units
    from order_lines
    join public.products
      on products.id = order_lines.product_id
    left join public.product_translations
      on product_translations.product_id = products.id
      and product_translations.locale = ${input.locale}
      and product_translations.status <> 'missing'
    left join physical_stock
      on physical_stock.organisation_id = order_lines.organisation_id
      and physical_stock.product_id = order_lines.product_id
    left join active_allocations
      on active_allocations.organisation_id = order_lines.organisation_id
      and active_allocations.product_id = order_lines.product_id
    order by order_lines.order_number, lower(${productTitle})
  `;

  return rows.map((row) => {
    const customerDemandUnits = integerOrDefault(row.customer_demand_units, 0);
    const allocatedUnits = Math.min(
      customerDemandUnits,
      integerOrDefault(row.allocated_units, 0)
    );
    const activeAllocatedUnits = integerOrDefault(row.active_allocated_units, 0);
    const physicalStockUnits = integerOrDefault(row.physical_stock_units, 0);
    const otherActiveAllocatedUnits = Math.max(
      0,
      activeAllocatedUnits - allocatedUnits
    );
    const stockPotentiallyBackingThisLine = Math.max(
      0,
      physicalStockUnits - otherActiveAllocatedUnits
    );
    const backedAllocatedUnits = Math.min(
      allocatedUnits,
      stockPotentiallyBackingThisLine
    );
    const availableNowUnits = Math.max(0, physicalStockUnits - activeAllocatedUnits);
    const shippedUnits = integerOrDefault(row.shipped_units, 0);
    const unorderedNeedUnits = Math.max(
      0,
      customerDemandUnits - backedAllocatedUnits - availableNowUnits
    );
    const statusInput = {
      allocatedUnits: backedAllocatedUnits,
      availableNowUnits,
      customerDemandUnits,
      unorderedNeedUnits
    };

    return {
      allocatedUnits,
      availableNowUnits,
      backedAllocatedUnits,
      customerDemandUnits,
      customerOrderId: row.customer_order_id,
      customerOrderLineId: row.customer_order_line_id,
      organisationId: row.organisation_id,
      orderNumber: row.order_number,
      productId: row.product_id,
      productTitle: row.product_title,
      shippedUnits,
      status: pipelineStatus(statusInput),
      unorderedNeedUnits
    };
  });
}

async function recordRetailOrderBpmEvent(
  sql: StockDb,
  context: AdminSessionContext,
  input: Readonly<{
    eventName: string;
    eventStatus: string;
    metadata?: Record<string, unknown>;
    orderId: string;
    organisationId: string;
  }>
) {
  await recordRetailOrderWorkflowBpm(sql, {
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    eventName: input.eventName,
    eventStatus: input.eventStatus,
    locale: context.effectivePerson.preferredLocale,
    metadata: input.metadata,
    orderId: input.orderId,
    organisationId: input.organisationId
  });
}

function localizedProductTitleExpression(
  sql: StockDb,
  locale: Locale
) {
  return sql`
    coalesce(
      nullif(product_translations.title, ''),
      case
        when ${locale} = 'th' then nullif(products.title_th, '')
        when ${locale} = 'en' then nullif(products.title_en, '')
        else null
      end,
      nullif(products.title, ''),
      'Untitled product'
    )
  `;
}

async function loadRetailOrganisations(
  sql: Db,
  context: AdminSessionContext
): Promise<AdminRetailStockOrganisation[]> {
  const rows = canReadAllRetailStock(context)
    ? await sql<Array<{
        country_code: string | null;
        currency: string | null;
        id: string;
        name: string;
        organisation_type: string;
        status: string;
      }>>`
        select id::text, name, organisation_type, status, currency, country_code
        from public.organisations
        where organisation_type = 'tenant'
          and status = 'active'
        order by lower(name)
      `
    : await sql<Array<{
        country_code: string | null;
        currency: string | null;
        id: string;
        name: string;
        organisation_type: string;
        status: string;
      }>>`
        select id::text, name, organisation_type, status, currency, country_code
        from public.organisations
        where id = ${context.effectiveOrganisation.id}::uuid
          and organisation_type = 'tenant'
          and status = 'active'
        limit 1
      `;

  return rows.map((row) => ({
    countryCode:
      normalizeProductCountryCode(row.country_code) ?? defaultProductCountryCode,
    currency: normalizeCurrency(row.currency, row.organisation_type),
    id: row.id,
    name: row.name,
    status:
      row.status === "active" || row.status === "archived" || row.status === "disabled"
        ? row.status
        : "disabled"
  }));
}

async function productApproved(sql: StockDb, productId: string) {
  const rows = await sql<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from public.products
      where id = ${productId}::uuid
        and status = 'approved'
    ) as exists
  `;

  return Boolean(rows[0]?.exists);
}

async function organisationForStockWrite(
  sql: StockDb,
  context: AdminSessionContext,
  organisationId: string | null | undefined,
  options: Readonly<{ allowPlatformActorAll?: boolean }> = {}
) {
  const canUseAnyOrganisation =
    canReadAllRetailStock(context) ||
    (options.allowPlatformActorAll && canRouteRegionalCheckout(context));
  const id = canUseAnyOrganisation
    ? organisationId
    : context.effectiveOrganisation.id;

  if (!id) {
    throw new Error("Retail organisation is required");
  }

  const rows = await sql<Array<{
    country_code: string | null;
    currency: string | null;
    id: string;
    name: string;
    organisation_type: string;
    status: string;
  }>>`
    select id::text, name, organisation_type, status, currency, country_code
    from public.organisations
    where id = ${id}::uuid
      and organisation_type = 'tenant'
    limit 1
  `;
  const row = rows[0];

  if (
    !row ||
    row.status !== "active" ||
    (!canUseAnyOrganisation && !canAccessRetailOrganisation(context, row.id))
  ) {
    throw new Error("Retail organisation is not available");
  }

  return {
    countryCode:
      normalizeProductCountryCode(row.country_code) ?? defaultProductCountryCode,
    currency: normalizeCurrency(row.currency, row.organisation_type),
    id: row.id,
    name: row.name
  };
}

async function recordRetailStockSnapshot(
  sql: StockDb,
  context: AdminSessionContext,
  row: RetailStockSnapshotRow,
  eventType: RetailStockSnapshotEvent,
  metadata: Record<string, unknown>
) {
  await sql`
    insert into public.retail_product_stock_snapshots (
      retail_product_stock_id,
      organisation_id,
      product_id,
      event_type,
      status,
      stock_quantity,
      lead_time_days,
      wholesale_price_amount,
      retail_price_amount,
      currency,
      notes,
      actor_person_id,
      metadata,
      recorded_at
    )
    values (
      ${row.id}::uuid,
      ${row.organisation_id}::uuid,
      ${row.product_id}::uuid,
      ${eventType},
      ${stockStatus(row.status)},
      ${integerOrDefault(row.stock_quantity, 0)},
      ${integerOrDefault(row.lead_time_days, 0)},
      ${numberOrNull(row.wholesale_price_amount)},
      ${numberOrNull(row.retail_price_amount)},
      ${row.currency},
      ${row.notes},
      ${context.actorPerson.id}::uuid,
      ${sql.json({
        ...metadata,
        assumedPersonId: context.assumedPerson?.id ?? null,
        source: "admin_stock"
      })},
      now()
    )
  `;
}

async function queueRetailStockIntelligenceRefresh(
  row: RetailStockSnapshotRow,
  reason: string
) {
  try {
    await createTask({
      actorType: "system",
      description:
        "Refresh reorder advice from stock movements and recommendation pressure.",
      idempotencyKey: row.id,
      idempotencyScope: "active",
      idempotencyScopeKey: "retail_stock_forecast_refresh",
      maxAttempts: 3,
      organisationId: row.organisation_id,
      payload: {
        productId: row.product_id,
        reason,
        source: "admin_stock",
        stockId: row.id
      },
      priorityReason: "Refresh stock forecast after stock changed.",
      requiredCapabilities: [AGENT_CAPABILITIES.retailStockForecast],
      taskType: "retail_stock_forecast_refresh",
      title: "Refresh retail stock advice"
    });
  } catch (error) {
    console.warn("Unable to queue retail stock advice refresh", error);
  }
}

function humanReviewDueAt(days = 3) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function queueRetailOperationTask(input: Readonly<{
  commandId?: RetailCommandId;
  description: string;
  dueAt?: Date | string | null;
  idempotencyKey: string;
  organisationId: string;
  payload?: Record<string, unknown>;
  priorityReason: string;
  priorityScore: number;
  profitImpactAmount?: number | null;
  profitImpactCurrency?: string | null;
  sourceEntityId?: string | null;
  sourceEntityType?: string | null;
  taskType: string;
  title: string;
}>) {
  try {
    if (input.commandId) {
      await ensureRetailCommandTask({
        commandId: input.commandId,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
        organisationId: input.organisationId,
        payload: input.payload,
        priorityReason: input.priorityReason,
        priorityScore: input.priorityScore,
        sourceEntityId: input.sourceEntityId ?? null,
        sourceEntityType: input.sourceEntityType ?? null,
        taskType: input.taskType,
        title: input.title
      });
      return;
    }

    await createTask({
      actorType: "human",
      businessValue: input.priorityScore,
      description: input.description,
      dueAt: input.dueAt ?? null,
      idempotencyKey: input.idempotencyKey,
      idempotencyScope: "active",
      idempotencyScopeKey: input.taskType,
      maxAttempts: 3,
      organisationId: input.organisationId,
      payload: {
        ...(input.payload ?? {}),
        priorityReason: input.priorityReason,
        sourceEntityId: input.sourceEntityId ?? null,
        sourceEntityType: input.sourceEntityType ?? null
      },
      priorityReason: input.priorityReason,
      priorityScore: input.priorityScore,
      profitImpactAmount: input.profitImpactAmount ?? null,
      profitImpactCurrency: input.profitImpactCurrency ?? null,
      requiredCapabilities: [AGENT_CAPABILITIES.retailStockPolicyReview],
      scheduledFor: new Date(),
      sourceEntityId: input.sourceEntityId ?? null,
      sourceEntityType: input.sourceEntityType ?? null,
      taskType: input.taskType,
      title: input.title
    });
  } catch (error) {
    console.warn("Unable to queue retail operations task", error);
  }
}

async function completeOrderWorkflowTask(
  sql: StockDb,
  context: AdminSessionContext,
  input: Readonly<{
    action: string;
    orderId: string;
    organisationId: string;
    taskTypes: readonly string[];
  }>
) {
  if (input.taskTypes.length === 0) {
    return null;
  }

  const taskRows = await sql<Array<{
    claimed_by_person_id: string | null;
    id: string;
    status: string;
    task_type: string;
  }>>`
    select
      id::text,
      status,
      task_type,
      context->>'claimedByPersonId' as claimed_by_person_id
    from public.tasks
    where organisation_id = ${input.organisationId}::uuid
      and source_entity_type = 'retail_customer_order'
      and source_entity_id = ${input.orderId}::uuid
      and task_type = any(${input.taskTypes}::text[])
      and status not in ('completed', 'cancelled', 'skipped')
    order by
      case when context ? 'claimedByPersonId' then 0 else 1 end,
      coalesce(due_at, scheduled_for) asc,
      updated_at asc
  `;

  if (taskRows.length === 0) {
    return null;
  }

  for (const task of taskRows) {
    if (
      task.claimed_by_person_id &&
      task.claimed_by_person_id !== context.actorPerson.id &&
      !canOverrideRetailTaskClaim(context)
    ) {
      throw new Error("This workflow task is claimed by another person");
    }
  }

  for (const task of taskRows) {
    await sql`
      update public.tasks
      set
        status = 'completed',
        started_at = coalesce(started_at, now()),
        completed_at = now(),
        context = coalesce(context, '{}'::jsonb) || ${sql.json({
          claimedByDisplayName: context.actorPerson.displayName,
          claimedByEmail: context.actorPerson.email,
          claimedByPersonId: context.actorPerson.id,
          completedByDisplayName: context.actorPerson.displayName,
          completedByEmail: context.actorPerson.email,
          completedByPersonId: context.actorPerson.id,
          workflowAction: input.action
        })},
        updated_at = now()
      where id = ${task.id}::uuid
    `;

    await addTaskEvent({
      eventPayload: {
        action: input.action,
        actorPersonId: context.actorPerson.id,
        claimedByPersonId: task.claimed_by_person_id,
        customerOrderId: input.orderId,
        fromStatus: task.status,
        source: "retail_order_workflow"
      },
      eventStatus: "succeeded",
      eventType: "retail_order_workflow_task_completed",
      severity: "low",
      taskId: task.id
    });

    await recordAdminAudit({
      action: "admin.retail_order_workflow_task_completed",
      actorPersonId: context.actorPerson.id,
      assumedPersonId: context.assumedPerson?.id ?? null,
      organisationId: input.organisationId,
      resourceId: task.id,
      resourceType: "task",
      metadata: {
        customerOrderId: input.orderId,
        taskType: task.task_type,
        workflowAction: input.action
      }
    });

    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_order_task_completed",
      eventStatus: "task_completed",
      metadata: {
        taskId: task.id,
        taskType: task.task_type,
        workflowAction: input.action
      },
      orderId: input.orderId,
      organisationId: input.organisationId
    });
  }

  return taskRows[0]?.id ?? null;
}

async function assertOrderWorkflowTaskClaimable(
  sql: StockDb,
  context: AdminSessionContext,
  input: Readonly<{
    orderId: string;
    organisationId: string;
    taskTypes: readonly string[];
  }>
) {
  if (input.taskTypes.length === 0) {
    return;
  }

  const taskRows = await sql<Array<{
    claimed_by_person_id: string | null;
    id: string;
  }>>`
    select
      id::text,
      context->>'claimedByPersonId' as claimed_by_person_id
    from public.tasks
    where organisation_id = ${input.organisationId}::uuid
      and source_entity_type = 'retail_customer_order'
      and source_entity_id = ${input.orderId}::uuid
      and task_type = any(${input.taskTypes}::text[])
      and status not in ('completed', 'cancelled', 'skipped')
    order by
      case when context ? 'claimedByPersonId' then 0 else 1 end,
      coalesce(due_at, scheduled_for) asc,
      updated_at asc
    limit 1
  `;
  const task = taskRows[0];

  if (
    task?.claimed_by_person_id &&
    task.claimed_by_person_id !== context.actorPerson.id &&
    !canOverrideRetailTaskClaim(context)
  ) {
    throw new Error("This workflow task is claimed by another person");
  }
}

export async function ensureOrderWorkflowTask(
  sql: StockDb,
  context: AdminSessionContext,
  input: Readonly<{
    dueAt?: Date | string | null;
    orderId: string;
    organisationId: string;
    taskType: string;
  }>
) {
  const taskRows = await sql<Array<{
    claimed_by_person_id: string | null;
    id: string;
  }>>`
    select
      id::text,
      context->>'claimedByPersonId' as claimed_by_person_id
    from public.tasks
    where organisation_id = ${input.organisationId}::uuid
      and source_entity_type = 'retail_customer_order'
      and source_entity_id = ${input.orderId}::uuid
      and task_type = ${input.taskType}
      and status not in ('completed', 'cancelled', 'skipped')
    order by
      case when context ? 'claimedByPersonId' then 0 else 1 end,
      coalesce(due_at, scheduled_for) asc,
      updated_at asc
    limit 1
  `;
  const existingTask = taskRows[0];

  if (
    existingTask?.claimed_by_person_id &&
    existingTask.claimed_by_person_id !== context.actorPerson.id &&
    !canOverrideRetailTaskClaim(context)
  ) {
    throw new Error("This workflow task is claimed by another person");
  }

  if (existingTask) {
    return existingTask.id;
  }

  const details = retailOrderWorkflowTaskDetails(input.taskType);

  await queueRetailOperationTask({
    commandId: retailCommandIdForTaskType(input.taskType) ?? undefined,
    description: details.description,
    dueAt: input.dueAt ?? null,
    idempotencyKey: `${input.orderId}:${input.taskType}:repair`,
    organisationId: input.organisationId,
    priorityReason: details.priorityReason,
    priorityScore: details.priorityScore,
    sourceEntityId: input.orderId,
    sourceEntityType: "retail_customer_order",
    taskType: input.taskType,
    title: details.title
  });

  const repairedRows = await sql<Array<{ id: string }>>`
    select id::text
    from public.tasks
    where organisation_id = ${input.organisationId}::uuid
      and source_entity_type = 'retail_customer_order'
      and source_entity_id = ${input.orderId}::uuid
      and task_type = ${input.taskType}
      and status not in ('completed', 'cancelled', 'skipped')
    order by updated_at desc
    limit 1
  `;
  const taskId = repairedRows[0]?.id ?? null;

  await recordAdminAudit({
    action: "admin.retail_order_workflow_task_repaired",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: input.organisationId,
    resourceId: taskId ?? input.orderId,
    resourceType: taskId ? "task" : "retail_customer_order",
    metadata: {
      customerOrderId: input.orderId,
      taskType: input.taskType
    }
  });

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: "retail_order_task_repaired",
    eventStatus: taskId ? "repaired" : "repair_attempted",
    metadata: {
      taskId,
      taskType: input.taskType
    },
    orderId: input.orderId,
    organisationId: input.organisationId
  });

  return taskId;
}

async function cancelStaleOrderWorkflowTasks(
  sql: StockDb,
  context: AdminSessionContext,
  input: Readonly<{
    expectedTaskTypes: readonly string[];
    orderId: string;
    organisationId: string;
    reason: string;
    status: string;
  }>
) {
  const rows = await sql<Array<{ id: string; task_type: string }>>`
    update public.tasks
    set
      status = 'cancelled',
      result_payload = coalesce(result_payload, '{}'::jsonb) || ${sql.json({
        actorPersonId: context.actorPerson.id,
        expectedTaskTypes: [...input.expectedTaskTypes],
        reason: input.reason,
        source: "retail_order_lifecycle_reconciliation",
        status: input.status
      })}::jsonb,
      lease_until = null,
      reserved_by_agent_id = null,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
    where organisation_id = ${input.organisationId}::uuid
      and source_entity_type = 'retail_customer_order'
      and source_entity_id = ${input.orderId}::uuid
      and task_type = any(${[...RETAIL_ORDER_WORKFLOW_TASK_TYPES]}::text[])
      and not (task_type = any(${[...input.expectedTaskTypes]}::text[]))
      and status not in ('completed', 'cancelled', 'skipped')
    returning id::text, task_type
  `;

  for (const task of rows) {
    await addTaskEvent({
      eventPayload: {
        actorPersonId: context.actorPerson.id,
        expectedTaskTypes: [...input.expectedTaskTypes],
        source: "retail_order_lifecycle_reconciliation",
        status: input.status,
        taskType: task.task_type
      },
      eventStatus: "succeeded",
      eventType: "retail_order_stale_workflow_task_cancelled",
      severity: "low",
      taskId: task.id
    });
  }

  return rows.length;
}

export async function executeRetailAgentCommand(input: RetailAgentCommandInput) {
  const commandId = retailCommandIdForTaskType(input.taskType);

  if (!commandId) {
    throw new Error(`Retail task ${input.taskType} is not agent-executable`);
  }

  const idempotencyKey = retailCommandIdempotencyKey(
    commandId,
    input.payload,
    input.taskId
  );
  let resourceId = input.sourceEntityId;
  let resourceType = input.sourceEntityType;

  try {
    await assertRetailAgentCommandTask({
      commandId,
      organisationId: input.organisationId,
      sourceEntityId: input.sourceEntityId,
      sourceEntityType: input.sourceEntityType,
      taskId: input.taskId
    });

    if (commandId === "refresh_stock_reorder_advice") {
      const stockId =
        textFromPayload(input.payload, "stockId") || input.sourceEntityId;
      const productId = textFromPayload(input.payload, "productId") || null;

      await refreshRetailStockReorderAdvice({
        generatedByTaskId: input.taskId,
        organisationId: input.organisationId,
        productId,
        stockId
      });

      resourceId = stockId ?? productId;
      resourceType = "retail_stock_reorder_advice";
    } else {
      const sql = getSql();

      if (!sql) {
        throw new Error("Database is not configured");
      }

      const context = await retailAgentSessionContext(sql, {
        organisationId: input.organisationId,
        taskId: input.taskId
      });

      if (commandId === "allocate_customer_order") {
        const customerOrderId =
          input.sourceEntityId || textFromPayload(input.payload, "customerOrderId");

        if (!customerOrderId) {
          throw new Error("Retail allocation task is missing a customer order");
        }

        resourceId = await allocateRetailCustomerOrder(context, {
          customerOrderId
        });
        resourceType = "retail_customer_order";
      } else if (commandId === "sync_order_shortages_to_reorder_advice") {
        const customerOrderId =
          input.sourceEntityId || textFromPayload(input.payload, "customerOrderId");

        if (!customerOrderId) {
          throw new Error("Retail shortage sync task is missing a customer order");
        }

        const result = await ensureRetailOrderShortagesInReorderAdvice(context, {
          customerOrderId,
          orderNumber: textFromPayload(input.payload, "orderNumber") || null,
          organisationId: input.organisationId,
          sql
        });

        resourceId = result.refreshedStockRowIds[0] ?? customerOrderId;
        resourceType = result.refreshedStockRowIds.length > 0
          ? "retail_stock_reorder_advice"
          : "retail_customer_order";
      } else if (commandId === "reconcile_customer_order_lifecycle") {
        const customerOrderId =
          input.sourceEntityId || textFromPayload(input.payload, "customerOrderId");

        if (!customerOrderId) {
          throw new Error("Retail lifecycle task is missing a customer order");
        }

        resourceId = await reconcileRetailOrderLifecycle(context, {
          customerOrderId
        });
        resourceType = "retail_customer_order";
      } else {
        throw new Error(`Retail command ${commandId} is not agent-executable`);
      }
    }

    await completeRetailCommandTask({
      commandId,
      result: {
        resourceId,
        resourceType
      },
      taskId: input.taskId
    });
    await recordRetailCommandAudit({
      actorKind: "agent",
      command: retailCommandRegistry[commandId],
      idempotencyKey,
      organisationId: input.organisationId,
      resourceId,
      resourceType,
      taskId: input.taskId
    });
    await recordRetailCommandBpm({
      actorKind: "agent",
      command: retailCommandRegistry[commandId],
      idempotencyKey,
      organisationId: input.organisationId,
      resourceId,
      resourceType,
      status: "succeeded",
      taskId: input.taskId
    });

    return {
      accepted: true,
      commandId,
      idempotencyKey,
      organisationId: input.organisationId,
      resourceId,
      resourceType,
      taskId: input.taskId
    };
  } catch (error) {
    if (commandId) {
      await recordRetailCommandBpm({
        actorKind: "agent",
        command: retailCommandRegistry[commandId],
        idempotencyKey,
        organisationId: input.organisationId,
        resourceId,
        resourceType,
        status: "failed",
        taskId: input.taskId
      });
    }

    throw error;
  }
}

async function queueStockReviewTasks(row: RetailStockSnapshotRow, reason: string) {
  const stockQuantity = integerOrDefault(row.stock_quantity, 0);
  const retailPriceAmount = numberOrNull(row.retail_price_amount);
  const stockoutImpact = Math.max(0, stockQuantity === 0 ? retailPriceAmount ?? 0 : 0);

  if (stockQuantity === 0) {
    await queueRetailOperationTask({
      description: "Review out-of-stock retail inventory and decide whether to reorder.",
      dueAt: humanReviewDueAt(),
      idempotencyKey: `${row.id}:low-stock`,
      organisationId: row.organisation_id,
      priorityReason: "Product is out of stock.",
      priorityScore: 360,
      profitImpactAmount: stockoutImpact,
      profitImpactCurrency: row.currency,
      sourceEntityId: row.id,
      sourceEntityType: "retail_product_stock",
      taskType: "retail_stock_low_stock_review",
      title: "Review retail stockout"
    });
  }

  if (reason === "stock_movement_recorded") {
    return;
  }
}

export async function refreshRetailStockReorderAdvice(input: Readonly<{
  generatedByTaskId?: string | null;
  organisationId: string;
  productId?: string | null;
  productIds?: readonly string[] | null;
  stockId?: string | null;
  stockIds?: readonly string[] | null;
}>) {
  const sql = getSql();

  if (!sql || !(await operationalStockTablesAvailable(sql))) {
    return { refreshed: 0 };
  }
  const productIds = [
    ...new Set([
      ...(input.productId ? [input.productId] : []),
      ...((input.productIds ?? []).filter((id) => id.trim()).map((id) => id.trim()))
    ])
  ];
  const stockIds = [
    ...new Set([
      ...(input.stockId ? [input.stockId] : []),
      ...((input.stockIds ?? []).filter((id) => id.trim()).map((id) => id.trim()))
    ])
  ];

  const stockRows = await sql<Array<{
    id: string;
    lead_time_days: number | string;
    organisation_id: string;
    outflow_units_30d: number | string;
    product_id: string;
    recommendation_pressure_count: number | string;
    stock_quantity: number | string;
  }>>`
    select
      retail_product_stock.id::text,
      retail_product_stock.organisation_id::text,
      retail_product_stock.product_id::text,
      retail_product_stock.stock_quantity,
      coalesce(retail_sellable_products.lead_time_days, retail_product_stock.lead_time_days) as lead_time_days,
      coalesce(outflow.outflow_units_30d, 0)::int as outflow_units_30d,
      coalesce(pressure.recommendation_pressure_count, 0)::int as recommendation_pressure_count
    from public.retail_product_stock
    left join public.retail_sellable_products
      on retail_sellable_products.organisation_id = retail_product_stock.organisation_id
      and retail_sellable_products.product_id = retail_product_stock.product_id
      and retail_sellable_products.status <> 'deleted'
    left join lateral (
      select abs(coalesce(sum(retail_stock_movements.quantity_delta), 0))::int as outflow_units_30d
      from public.retail_stock_movements
      where retail_stock_movements.retail_product_stock_id = retail_product_stock.id
        and retail_stock_movements.quantity_delta < 0
        and retail_stock_movements.occurred_at >= now() - interval '30 days'
        and not exists (
          select 1
          from public.retail_stock_movements voids
          where voids.voids_movement_id = retail_stock_movements.id
            and voids.movement_type = 'void'
        )
    ) outflow on true
    left join lateral (
      select count(*)::int as recommendation_pressure_count
      from public.product_recommendation_decisions
      where product_recommendation_decisions.product_id = retail_product_stock.product_id
        and product_recommendation_decisions.outcome in ('chosen', 'near_miss')
        and product_recommendation_decisions.generated_at >= now() - interval '30 days'
    ) pressure on true
    where retail_product_stock.organisation_id = ${input.organisationId}::uuid
      and retail_product_stock.status <> 'deleted'
      and (${stockIds.length === 0}::boolean or retail_product_stock.id = any(${stockIds}::uuid[]))
      and (${productIds.length === 0}::boolean or retail_product_stock.product_id = any(${productIds}::uuid[]))
  `;

  for (const row of stockRows) {
    const currentStock = integerOrDefault(row.stock_quantity, 0);
    const leadTimeDays = integerOrDefault(row.lead_time_days, 0);
    const outflowUnits30d = integerOrDefault(row.outflow_units_30d, 0);
    const recommendationPressureCount = integerOrDefault(
      row.recommendation_pressure_count,
      0
    );
    const demandUnits30d = Math.max(
      outflowUnits30d,
      Math.ceil(recommendationPressureCount * 0.5)
    );
    const dailyDemand = demandUnits30d > 0 ? demandUnits30d / 30 : 0;
    const daysCover = dailyDemand > 0 ? currentStock / dailyDemand : null;
    const targetCoverDays = Math.max(14, leadTimeDays + 14);
    const suggestedOrderQuantity = Math.max(
      0,
      Math.ceil(dailyDemand * targetCoverDays - currentStock)
    );
    const reorderBy = daysCover === null
      ? null
      : new Date(
          Date.now() +
            Math.max(0, Math.floor(daysCover - leadTimeDays)) *
              24 *
              60 *
              60 *
              1000
        )
          .toISOString()
          .slice(0, 10);
    const riskLevel: RetailStockReorderRisk =
      currentStock === 0
        ? "out_of_stock"
        : daysCover !== null && daysCover <= leadTimeDays + 7
          ? "reorder"
          : recommendationPressureCount >= 5 &&
              currentStock <= Math.max(1, recommendationPressureCount)
            ? "watch"
            : "ok";
    const confidence: RetailStockAdviceConfidence =
      outflowUnits30d >= 5
        ? "high"
        : recommendationPressureCount >= 5
          ? "medium"
          : "low";

    await sql`
      insert into public.retail_stock_reorder_advice (
        retail_product_stock_id,
        organisation_id,
        product_id,
        risk_level,
        confidence,
        current_stock_quantity,
        outflow_units_30d,
        recommendation_pressure_count,
        lead_time_days,
        days_cover,
        reorder_by,
        suggested_order_quantity,
        generated_by_task_id,
        inputs,
        calculated_at,
        created_at,
        updated_at
      )
      values (
        ${row.id}::uuid,
        ${row.organisation_id}::uuid,
        ${row.product_id}::uuid,
        ${riskLevel},
        ${confidence},
        ${currentStock},
        ${outflowUnits30d},
        ${recommendationPressureCount},
        ${leadTimeDays},
        ${daysCover},
        ${reorderBy},
        ${suggestedOrderQuantity},
        ${input.generatedByTaskId ?? null}::uuid,
        ${sql.json({
          demandUnits30d,
          source: "retail_stock_forecast_refresh",
          targetCoverDays
        })},
        now(),
        now(),
        now()
      )
      on conflict (organisation_id, product_id)
      do update set
        retail_product_stock_id = excluded.retail_product_stock_id,
        risk_level = excluded.risk_level,
        confidence = excluded.confidence,
        current_stock_quantity = excluded.current_stock_quantity,
        outflow_units_30d = excluded.outflow_units_30d,
        recommendation_pressure_count = excluded.recommendation_pressure_count,
        lead_time_days = excluded.lead_time_days,
        days_cover = excluded.days_cover,
        reorder_by = excluded.reorder_by,
        suggested_order_quantity = excluded.suggested_order_quantity,
        generated_by_task_id = excluded.generated_by_task_id,
        inputs = excluded.inputs,
        calculated_at = now(),
        updated_at = now()
    `;

    if (
      riskLevel === "out_of_stock" ||
      riskLevel === "reorder" ||
      riskLevel === "watch"
    ) {
      const priorityScore =
        riskLevel === "out_of_stock"
          ? 360
          : riskLevel === "reorder"
            ? 640
            : 360;
      const priorityReason =
        riskLevel === "out_of_stock"
          ? "Customer demand cannot be fulfilled because stock is zero."
          : riskLevel === "reorder"
            ? "Lead time means reorder should be reviewed now."
            : "Demand pressure is rising relative to available stock.";

      await queueRetailOperationTask({
        description: "Review reorder advice and add any shortages to the shopping list.",
        dueAt:
          reorderBy && riskLevel !== "out_of_stock"
            ? reorderBy
            : humanReviewDueAt(),
        idempotencyKey: `${row.id}:reorder:${riskLevel}`,
        organisationId: row.organisation_id,
        payload: {
          productId: row.product_id,
          stockId: row.id,
          suggestedOrderQuantity
        },
        priorityReason,
        priorityScore,
        sourceEntityId: row.id,
        sourceEntityType: "retail_product_stock",
        taskType:
          riskLevel === "out_of_stock"
            ? "retail_stock_low_stock_review"
            : "retail_stock_reorder_review",
        title:
          riskLevel === "out_of_stock"
            ? "Review stockout"
            : "Review reorder advice"
      });
    }
  }

  return { refreshed: stockRows.length };
}

export function emptyAdminRetailStockData(): AdminRetailStockData {
  return {
    auditEvents: [],
    canFilterOrganisation: false,
    canRouteRegionalCheckout: false,
    canWrite: false,
    carrierAccounts: [],
    customerOrderLines: [],
    customerOrders: [],
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    lots: [],
    movements: [],
    organisations: [],
    pipeline: [],
    productOptions: [],
    reorderAdvice: [],
    rows: [],
    shoppingListLines: [],
    shoppingLists: [],
    tasks: []
  };
}

export async function getAdminRetailStockData(
  context: AdminSessionContext,
  locale: Locale
): Promise<AdminRetailStockData> {
  const sql = getSql();

  if (!sql) {
    return emptyAdminRetailStockData();
  }

  const organisations = await loadRetailOrganisations(sql, context);
  const organisationIds = organisations.map((organisation) => organisation.id);
  const productTitle = localizedProductTitleExpression(sql, locale);
  const [stockRows, productRows] = organisationIds.length === 0
    ? [[], await sql<Array<{
        brand_name: string | null;
        id: string;
        image_url: string | null;
        product_kind: string;
        title: string;
      }>>`
        select
          products.id::text,
          ${productTitle} as title,
          products.brand_name,
          products.image_url,
          products.product_kind
        from public.products
        left join public.product_translations
          on product_translations.product_id = products.id
          and product_translations.locale = ${locale}
          and product_translations.status <> 'missing'
        where products.status = 'approved'
          and not (
            lower(coalesce(products.normalized_brand_name, products.brand_name, '')) in ('dhc', 'dmc')
            and coalesce(products.source_url, '') ilike '%dhc.co.jp%'
          )
        order by lower(${productTitle}), lower(coalesce(products.brand_name, ''))
        limit 1000
      `]
    : await Promise.all([
        sql<Array<{
          backorder_policy: string | null;
          brand_name: string | null;
          currency: string;
          id: string;
          image_url: string | null;
          lead_time_days: number | string;
          notes: string | null;
          organisation_id: string;
          organisation_name: string;
          product_id: string;
          product_kind: string;
          product_status: string;
          product_title: string;
          retail_price_amount: string | number | null;
          retail_override_price_amount: string | number | null;
          retail_sellable_product_id: string | null;
          status: string;
          stock_quantity: number | string;
          updated_at: Date | string;
          wholesale_price_amount: string | number | null;
        }>>`
          select
            retail_product_stock.id::text,
            retail_sellable_products.id::text as retail_sellable_product_id,
            retail_product_stock.organisation_id::text,
            organisations.name as organisation_name,
            retail_product_stock.product_id::text,
            ${productTitle} as product_title,
            products.brand_name,
            products.image_url,
            products.product_kind,
            products.status as product_status,
            coalesce(retail_sellable_products.status, retail_product_stock.status) as status,
            retail_product_stock.stock_quantity,
            coalesce(retail_sellable_products.lead_time_days, retail_product_stock.lead_time_days) as lead_time_days,
            coalesce(retail_sellable_products.wholesale_price_amount, retail_product_stock.wholesale_price_amount) as wholesale_price_amount,
            retail_sellable_products.rrp_price_amount as retail_price_amount,
            retail_sellable_products.rrp_price_amount as retail_override_price_amount,
            coalesce(retail_sellable_products.currency, retail_product_stock.currency) as currency,
            coalesce(retail_sellable_products.notes, retail_product_stock.notes) as notes,
            coalesce(retail_sellable_products.backorder_policy, 'allow') as backorder_policy,
            retail_product_stock.updated_at
          from public.retail_product_stock
          join public.organisations
            on organisations.id = retail_product_stock.organisation_id
          join public.products
            on products.id = retail_product_stock.product_id
          left join public.retail_sellable_products
            on retail_sellable_products.organisation_id = retail_product_stock.organisation_id
            and retail_sellable_products.product_id = retail_product_stock.product_id
            and retail_sellable_products.status <> 'deleted'
          left join public.product_translations
            on product_translations.product_id = products.id
            and product_translations.locale = ${locale}
            and product_translations.status <> 'missing'
          where retail_product_stock.organisation_id = any(${organisationIds}::uuid[])
            and retail_product_stock.status <> 'deleted'
          order by lower(organisations.name), lower(${productTitle})
        `,
        sql<Array<{
          brand_name: string | null;
          id: string;
          image_url: string | null;
          product_kind: string;
          title: string;
        }>>`
          select
            products.id::text,
            ${productTitle} as title,
            products.brand_name,
            products.image_url,
            products.product_kind
          from public.products
          left join public.product_translations
            on product_translations.product_id = products.id
            and product_translations.locale = ${locale}
            and product_translations.status <> 'missing'
          where products.status = 'approved'
            and not (
              lower(coalesce(products.normalized_brand_name, products.brand_name, '')) in ('dhc', 'dmc')
              and coalesce(products.source_url, '') ilike '%dhc.co.jp%'
            )
          order by lower(${productTitle}), lower(coalesce(products.brand_name, ''))
          limit 1000
        `
      ]);

  const operationalTablesAvailable = organisationIds.length > 0
    ? await operationalStockTablesAvailable(sql)
    : false;
  const [lotRows, movementRows, adviceRows] =
    operationalTablesAvailable
      ? await Promise.all([
          sql<Array<{
            currency: string;
            expires_at: Date | string | null;
            id: string;
            notes: string | null;
            organisation_id: string;
            product_id: string;
            product_title: string;
            received_at: Date | string;
            received_quantity: number | string;
            remaining_quantity: number | string;
            retail_product_stock_id: string;
            status: string;
            wholesale_price_amount: string | number | null;
          }>>`
            select
              retail_stock_lots.id::text,
              retail_stock_lots.retail_product_stock_id::text,
              retail_stock_lots.organisation_id::text,
              retail_stock_lots.product_id::text,
              ${productTitle} as product_title,
              retail_stock_lots.status,
              retail_stock_lots.received_quantity,
              retail_stock_lots.remaining_quantity,
              retail_stock_lots.wholesale_price_amount,
              retail_stock_lots.currency,
              retail_stock_lots.expires_at,
              retail_stock_lots.received_at,
              retail_stock_lots.notes
            from public.retail_stock_lots
            join public.products
              on products.id = retail_stock_lots.product_id
            left join public.product_translations
              on product_translations.product_id = products.id
              and product_translations.locale = ${locale}
              and product_translations.status <> 'missing'
            where retail_stock_lots.organisation_id = any(${organisationIds}::uuid[])
              and retail_stock_lots.status <> 'deleted'
            order by retail_stock_lots.received_at desc
            limit 500
          `,
          sql<Array<{
            currency: string;
            id: string;
            is_voided: boolean;
            lot_id: string | null;
            movement_type: string;
            notes: string | null;
            occurred_at: Date | string;
            organisation_id: string;
            organisation_name: string;
            product_id: string;
            product_title: string;
            quantity_delta: number | string;
            reason: string | null;
            retail_price_amount: string | number | null;
            retail_product_stock_id: string;
            unit_cost_amount: string | number | null;
            voids_movement_id: string | null;
          }>>`
            select
              retail_stock_movements.id::text,
              retail_stock_movements.retail_product_stock_id::text,
              retail_stock_movements.lot_id::text,
              retail_stock_movements.organisation_id::text,
              organisations.name as organisation_name,
              retail_stock_movements.product_id::text,
              ${productTitle} as product_title,
              retail_stock_movements.movement_type,
              retail_stock_movements.quantity_delta,
              retail_stock_movements.unit_cost_amount,
              retail_stock_movements.retail_price_amount,
              retail_stock_movements.currency,
              retail_stock_movements.reason,
              retail_stock_movements.notes,
              retail_stock_movements.voids_movement_id::text,
              exists (
                select 1
                from public.retail_stock_movements voids
                where voids.voids_movement_id = retail_stock_movements.id
                  and voids.movement_type = 'void'
              ) as is_voided,
              retail_stock_movements.occurred_at
            from public.retail_stock_movements
            join public.organisations
              on organisations.id = retail_stock_movements.organisation_id
            join public.products
              on products.id = retail_stock_movements.product_id
            left join public.product_translations
              on product_translations.product_id = products.id
              and product_translations.locale = ${locale}
              and product_translations.status <> 'missing'
            where retail_stock_movements.organisation_id = any(${organisationIds}::uuid[])
            order by retail_stock_movements.occurred_at desc
            limit 500
          `,
          sql<Array<{
            calculated_at: Date | string;
            confidence: string;
            current_stock_quantity: number | string;
            days_cover: string | number | null;
            id: string;
            lead_time_days: number | string;
            organisation_id: string;
            organisation_name: string;
            outflow_units_30d: number | string;
            product_id: string;
            product_title: string;
            recommendation_pressure_count: number | string;
            reorder_by: Date | string | null;
            retail_product_stock_id: string;
            risk_level: string;
            suggested_order_quantity: number | string;
          }>>`
            select
              retail_stock_reorder_advice.id::text,
              retail_stock_reorder_advice.retail_product_stock_id::text,
              retail_stock_reorder_advice.organisation_id::text,
              organisations.name as organisation_name,
              retail_stock_reorder_advice.product_id::text,
              ${productTitle} as product_title,
              retail_stock_reorder_advice.risk_level,
              retail_stock_reorder_advice.confidence,
              retail_stock_reorder_advice.current_stock_quantity,
              retail_stock_reorder_advice.outflow_units_30d,
              retail_stock_reorder_advice.recommendation_pressure_count,
              retail_stock_reorder_advice.lead_time_days,
              retail_stock_reorder_advice.days_cover,
              retail_stock_reorder_advice.reorder_by,
              retail_stock_reorder_advice.suggested_order_quantity,
              retail_stock_reorder_advice.calculated_at
            from public.retail_stock_reorder_advice
            join public.organisations
              on organisations.id = retail_stock_reorder_advice.organisation_id
            join public.products
              on products.id = retail_stock_reorder_advice.product_id
            left join public.product_translations
              on product_translations.product_id = products.id
              and product_translations.locale = ${locale}
              and product_translations.status <> 'missing'
            where retail_stock_reorder_advice.organisation_id = any(${organisationIds}::uuid[])
              and (
                retail_stock_reorder_advice.risk_level <> 'ok'
                or retail_stock_reorder_advice.suggested_order_quantity > 0
              )
            order by
              case retail_stock_reorder_advice.risk_level
                when 'out_of_stock' then 0
                when 'reorder' then 1
                when 'watch' then 2
                else 3
              end,
              retail_stock_reorder_advice.calculated_at desc
          `
        ])
      : [[], [], []];
  const operationsTablesAvailable = organisationIds.length > 0
    ? await retailOperationsTablesAvailable(sql)
    : false;
  const shipmentTablesReady = organisationIds.length > 0
    ? (await sql<Array<{ ready: boolean }>>`
        select to_regclass('public.retail_order_shipments') is not null as ready
      `)[0]?.ready === true
    : false;
  const carrierTablesReady = organisationIds.length > 0
    ? (await sql<Array<{ ready: boolean }>>`
        select to_regclass('public.retail_carrier_accounts') is not null as ready
      `)[0]?.ready === true
    : false;
  const carrierAccountRows = carrierTablesReady
    ? await sql<Array<{
        capabilities: string[];
        carrier_id: string;
        display_name: string | null;
        id: string;
        last_test_status: string | null;
        last_tested_at: Date | string | null;
        organisation_id: string;
        status: string;
        updated_at: Date | string;
      }>>`
        select
          id::text,
          organisation_id::text,
          carrier_id,
          display_name,
          status,
          capabilities,
          last_tested_at,
          last_test_status,
          updated_at
        from public.retail_carrier_accounts
        where organisation_id = any(${organisationIds}::uuid[])
          and status <> 'deleted'
        order by carrier_id, updated_at desc
      `
    : [];
  const [
    taskRows,
    customerOrderRows,
    customerOrderLineRows,
    customerOrderShipmentRows
  ] = operationsTablesAvailable
    ? await Promise.all([
        sql<Array<{
          actor_type: string;
          agent_name: string | null;
          claimed_at: Date | string | null;
          claimed_by_email: string | null;
          claimed_by_name: string | null;
          claimed_by_person_id: string | null;
          due_at: Date | string | null;
          id: string;
          organisation_id: string;
          organisation_name: string;
          payload: unknown;
          priority_reason: string | null;
          priority_score: number | string | null;
          profit_impact_amount: number | string | null;
          profit_impact_currency: string | null;
          scheduled_for: Date | string;
          source_entity_id: string | null;
          source_entity_type: string | null;
          status: string;
          task_type: string;
          title: string;
          updated_at: Date | string;
        }>>`
          select
            tasks.id::text,
            tasks.actor_type,
            tasks.organisation_id::text,
            organisations.name as organisation_name,
            tasks.task_type,
            tasks.title,
            tasks.status,
            tasks.payload,
            tasks.priority_score,
            tasks.priority_reason,
            tasks.profit_impact_amount,
            tasks.profit_impact_currency,
            tasks.scheduled_for,
            case
              when tasks.context ? 'claimedByPersonId' then tasks.started_at
              else null
            end as claimed_at,
            tasks.context->>'claimedByPersonId' as claimed_by_person_id,
            coalesce(
              claimed_people.display_name,
              tasks.context->>'claimedByDisplayName'
            ) as claimed_by_name,
            coalesce(
              claimed_people.email,
              tasks.context->>'claimedByEmail'
            ) as claimed_by_email,
            reserved_agents.name as agent_name,
            tasks.due_at,
            tasks.source_entity_type,
            tasks.source_entity_id::text,
            tasks.updated_at
          from public.tasks
          join public.organisations
            on organisations.id = tasks.organisation_id
          left join public.people claimed_people
            on claimed_people.id::text = tasks.context->>'claimedByPersonId'
          left join public.agents reserved_agents
            on reserved_agents.id = tasks.reserved_by_agent_id
          where tasks.organisation_id = any(${organisationIds}::uuid[])
            and (tasks.task_type like 'retail_%' or tasks.task_type like 'carrier_%')
          order by
            case when tasks.status in ('completed', 'cancelled', 'skipped') then 1 else 0 end,
            coalesce(tasks.priority_score, tasks.business_value) desc,
            coalesce(tasks.due_at, tasks.scheduled_for) asc,
            tasks.updated_at desc
          limit 300
        `,
        sql<Array<{
          currency: string;
          customer_email: string | null;
          customer_name: string | null;
          delivered_at: Date | string | null;
          due_at: Date | string | null;
          id: string;
          line_count: number | string;
          metadata: unknown;
          notes: string | null;
          order_number: string;
          ordered_units: number | string;
          organisation_id: string;
          organisation_name: string;
          placed_at: Date | string | null;
          shipped_at: Date | string | null;
          shipped_units: number | string;
          source: string;
          status: string;
          total_retail_amount: number | string | null;
          updated_at: Date | string;
        }>>`
          select
            retail_customer_orders.id::text,
            retail_customer_orders.organisation_id::text,
            organisations.name as organisation_name,
            retail_customer_orders.order_number,
            retail_customer_orders.source,
            retail_customer_orders.customer_name,
            retail_customer_orders.customer_email,
            retail_customer_orders.status,
            retail_customer_orders.currency,
            retail_customer_orders.due_at,
            retail_customer_orders.placed_at,
            retail_customer_orders.shipped_at,
            retail_customer_orders.delivered_at,
            retail_customer_orders.notes,
            retail_customer_orders.metadata,
            retail_customer_orders.updated_at,
            count(retail_customer_order_lines.id)::int as line_count,
            coalesce(sum(retail_customer_order_lines.quantity_ordered), 0)::int as ordered_units,
            coalesce(sum(retail_customer_order_lines.quantity_shipped), 0)::int as shipped_units,
            sum(retail_customer_order_lines.quantity_ordered * retail_customer_order_lines.retail_price_amount) as total_retail_amount
          from public.retail_customer_orders
          join public.organisations
            on organisations.id = retail_customer_orders.organisation_id
          left join public.retail_customer_order_lines
            on retail_customer_order_lines.customer_order_id = retail_customer_orders.id
          where retail_customer_orders.organisation_id = any(${organisationIds}::uuid[])
          group by retail_customer_orders.id, organisations.name
          order by retail_customer_orders.updated_at desc
          limit 200
        `,
        sql<Array<{
          customer_order_id: string;
          ean13: string | null;
          id: string;
          manufacturer_sku: string | null;
          metadata: unknown;
          notes: string | null;
          product_id: string;
          product_title: string;
          quantity_allocated: number | string;
          quantity_ordered: number | string;
          quantity_shipped: number | string;
          retail_price_amount: number | string | null;
        }>>`
          select
            retail_customer_order_lines.id::text,
            retail_customer_order_lines.customer_order_id::text,
            retail_customer_order_lines.product_id::text,
            ${productTitle} as product_title,
            identifiers.ean13,
            identifiers.manufacturer_sku,
            retail_customer_order_lines.quantity_ordered,
            retail_customer_order_lines.quantity_allocated,
            retail_customer_order_lines.quantity_shipped,
            retail_customer_order_lines.retail_price_amount,
            retail_customer_order_lines.metadata,
            retail_customer_order_lines.notes
          from public.retail_customer_order_lines
          join public.products
            on products.id = retail_customer_order_lines.product_id
          left join public.product_translations
            on product_translations.product_id = products.id
            and product_translations.locale = ${locale}
            and product_translations.status <> 'missing'
          left join lateral (
            select
              max(product_identifiers.identifier_value) filter (
                where product_identifiers.identifier_type = 'ean13'
              ) as ean13,
              max(product_identifiers.identifier_value) filter (
                where product_identifiers.identifier_type = 'manufacturer_sku'
              ) as manufacturer_sku
            from public.product_identifiers
            where product_identifiers.product_id = products.id
              and product_identifiers.status = 'active'
              and product_identifiers.identifier_type in ('ean13', 'manufacturer_sku')
          ) identifiers on true
          where retail_customer_order_lines.organisation_id = any(${organisationIds}::uuid[])
          order by retail_customer_order_lines.created_at desc
          limit 500
        `,
        shipmentTablesReady
          ? sql<Array<{
              carrier_id: string | null;
              carrier_name: string | null;
              customer_order_id: string;
              exception_code: string | null;
              exception_message: string | null;
              label_metadata: unknown;
              label_status: string | null;
              label_url: string | null;
              metadata: unknown;
              pickup_booked_at: Date | string | null;
              pickup_provider_status: string | null;
              pickup_window_end: Date | string | null;
              pickup_window_start: Date | string | null;
              status: string | null;
              tracking_number: string | null;
              tracking_url: string | null;
            }>>`
              select distinct on (retail_order_shipments.retail_customer_order_id)
                retail_order_shipments.retail_customer_order_id::text as customer_order_id,
                retail_order_shipments.carrier_id,
                retail_order_shipments.carrier_name,
                retail_order_shipments.exception_code,
                retail_order_shipments.exception_message,
                retail_order_shipments.label_metadata,
                retail_order_shipments.label_status,
                retail_order_shipments.label_url,
                retail_order_shipments.metadata,
                retail_order_shipments.pickup_booked_at,
                retail_order_shipments.pickup_provider_status,
                retail_order_shipments.pickup_window_end,
                retail_order_shipments.pickup_window_start,
                retail_order_shipments.status,
                retail_order_shipments.tracking_number,
                retail_order_shipments.tracking_url
              from public.retail_order_shipments
              join public.retail_customer_orders
                on retail_customer_orders.id = retail_order_shipments.retail_customer_order_id
              where retail_customer_orders.organisation_id = any(${organisationIds}::uuid[])
              order by
                retail_order_shipments.retail_customer_order_id,
                retail_order_shipments.updated_at desc
            `
          : Promise.resolve([])
      ])
    : [[], [], [], []];
  if (organisationIds.length > 0) {
    await ensureRetailShoppingListTablesAvailable(sql);
  }
  const shoppingListTablesReady = organisationIds.length > 0;
  const [shoppingListRows, shoppingListLineRows] = shoppingListTablesReady
    ? await Promise.all([
        sql<Array<{
          actual_units: number | string;
          created_at: Date | string;
          currency: string;
          id: string;
          line_count: number | string;
          list_number: string;
          organisation_id: string;
          organisation_name: string;
          required_units: number | string;
          status: string;
          stocked_units: number | string;
          updated_at: Date | string;
        }>>`
          select
            retail_shopping_lists.id::text,
            retail_shopping_lists.organisation_id::text,
            organisations.name as organisation_name,
            retail_shopping_lists.list_number,
            retail_shopping_lists.status,
            retail_shopping_lists.currency,
            retail_shopping_lists.created_at,
            retail_shopping_lists.updated_at,
            count(retail_shopping_list_lines.id)::int as line_count,
            coalesce(sum(retail_shopping_list_lines.required_quantity), 0)::int as required_units,
            coalesce(sum(retail_shopping_list_lines.actual_quantity), 0)::int as actual_units,
            coalesce(sum(retail_shopping_list_lines.stocked_quantity), 0)::int as stocked_units
          from public.retail_shopping_lists
          join public.organisations
            on organisations.id = retail_shopping_lists.organisation_id
          left join public.retail_shopping_list_lines
            on retail_shopping_list_lines.shopping_list_id = retail_shopping_lists.id
          where retail_shopping_lists.organisation_id = any(${organisationIds}::uuid[])
          group by retail_shopping_lists.id, organisations.name
          order by retail_shopping_lists.updated_at desc
          limit 50
        `,
        sql<Array<{
          actual_quantity: number | string;
          assigned_quantity: number | string;
	          brand_name: string | null;
          current_stock_quantity: number | string;
          ean13: string | null;
	          id: string;
          manufacturer_sku: string | null;
          organisation_id: string;
          product_id: string;
          product_title: string;
          required_quantity: number | string;
          retail_price_amount: number | string | null;
          shopping_list_id: string;
          stocked_quantity: number | string;
          unordered_need_quantity: number | string;
          wholesale_price_amount: number | string | null;
        }>>`
          select
            retail_shopping_list_lines.id::text,
            retail_shopping_list_lines.shopping_list_id::text,
            retail_shopping_list_lines.organisation_id::text,
            retail_shopping_list_lines.product_id::text,
	            ${productTitle} as product_title,
            products.brand_name,
            identifiers.ean13,
            identifiers.manufacturer_sku,
	            retail_shopping_list_lines.required_quantity,
            retail_shopping_list_lines.current_stock_quantity,
            retail_shopping_list_lines.unordered_need_quantity,
            retail_shopping_list_lines.assigned_quantity,
            retail_shopping_list_lines.actual_quantity,
            retail_shopping_list_lines.stocked_quantity,
            retail_shopping_list_lines.wholesale_price_amount,
            retail_shopping_list_lines.retail_price_amount
          from public.retail_shopping_list_lines
          join public.products
            on products.id = retail_shopping_list_lines.product_id
	          left join public.product_translations
	            on product_translations.product_id = products.id
	            and product_translations.locale = ${locale}
	            and product_translations.status <> 'missing'
          left join lateral (
            select
              max(product_identifiers.identifier_value) filter (
                where product_identifiers.identifier_type = 'ean13'
              ) as ean13,
              max(product_identifiers.identifier_value) filter (
                where product_identifiers.identifier_type = 'manufacturer_sku'
              ) as manufacturer_sku
            from public.product_identifiers
            where product_identifiers.product_id = products.id
              and product_identifiers.status = 'active'
              and product_identifiers.identifier_type in ('ean13', 'manufacturer_sku')
          ) identifiers on true
	          where retail_shopping_list_lines.organisation_id = any(${organisationIds}::uuid[])
          order by retail_shopping_list_lines.created_at asc
          limit 500
        `
      ])
    : [[], []];
  const pipelineRows = operationsTablesAvailable
    ? await getRetailStockPipeline({
        locale,
        organisationIds,
        sql
      })
    : [];
  const pipelineByLineKey = new Map(
    pipelineRows.map((row) => [
      pipelineKey(row.customerOrderLineId, row.productId),
      row
    ])
  );
  const pipelineByOrderId = new Map(
    [...new Set(pipelineRows.map((row) => row.customerOrderId).filter(Boolean))]
      .map((orderId) => [
        orderId as string,
        aggregatePipelineRows(pipelineRows, orderId as string)
      ])
  );
  const shipmentByOrderId = new Map<string, AdminRetailCustomerOrderShipment>(
    customerOrderShipmentRows.map((row) => {
      const labelMetadata = objectRecord(row.label_metadata);
      const metadata = objectRecord(row.metadata);

      return [
        row.customer_order_id,
        {
          carrierId: row.carrier_id,
          carrierName: row.carrier_name,
          exceptionCode: row.exception_code,
          exceptionMessage: row.exception_message,
          labelContentBase64: stringMetadata(labelMetadata.contentBase64),
          labelContentType: stringMetadata(labelMetadata.contentType),
          labelStatus: row.label_status,
          labelUrl: row.label_url,
          pickupBookedAt: isoDateTimeOrNull(row.pickup_booked_at),
          pickupProviderStatus: row.pickup_provider_status,
          pickupWindowEnd: isoDateTimeOrNull(row.pickup_window_end),
          pickupWindowStart: isoDateTimeOrNull(row.pickup_window_start),
          shippedAt: null,
          shippedByPersonId: null,
          shipmentNotes:
            stringMetadata(metadata.shipmentNotes) ??
            stringMetadata(metadata.requestedShipmentNotes),
          status: row.status,
          trackingNumber: row.tracking_number,
          trackingUrl: row.tracking_url
        }
      ];
    })
  );
  const [adminAuditRows, taskEventRows] = organisationIds.length > 0
    ? await Promise.all([
        sql<Array<{
          action: string;
          actor_email: string | null;
          actor_name: string | null;
          created_at: Date | string;
          id: string;
          metadata: unknown;
          organisation_id: string;
          organisation_name: string;
          resource_id: string | null;
          resource_type: string | null;
        }>>`
          select
            admin_audit_events.id::text,
            admin_audit_events.organisation_id::text,
            organisations.name as organisation_name,
            admin_audit_events.action,
            admin_audit_events.resource_type,
            admin_audit_events.resource_id,
            admin_audit_events.metadata,
            coalesce(actor_people.display_name, actor_people.email) as actor_name,
            actor_people.email as actor_email,
            admin_audit_events.created_at
          from public.admin_audit_events
          join public.organisations
            on organisations.id = admin_audit_events.organisation_id
          left join public.people actor_people
            on actor_people.id = admin_audit_events.actor_person_id
          where admin_audit_events.organisation_id = any(${organisationIds}::uuid[])
          order by admin_audit_events.created_at desc
          limit 150
        `,
        operationsTablesAvailable
          ? sql<Array<{
              agent_name: string | null;
              event_payload: unknown;
              event_status: string;
              event_type: string;
              id: string;
              occurred_at: Date | string;
              organisation_id: string;
              organisation_name: string;
              resource_id: string | null;
              resource_type: string | null;
              severity: string;
            }>>`
              select
                task_events.id::text,
                tasks.organisation_id::text,
                organisations.name as organisation_name,
                task_events.event_type,
                task_events.event_status,
                task_events.severity,
                task_events.event_payload,
                task_events.occurred_at,
                agents.name as agent_name,
                tasks.task_type as resource_type,
                tasks.id::text as resource_id
              from public.task_events
              join public.tasks
                on tasks.id = task_events.task_id
              join public.organisations
                on organisations.id = tasks.organisation_id
              left join public.agents
                on agents.id = task_events.agent_id
              where tasks.organisation_id = any(${organisationIds}::uuid[])
                and tasks.task_type like 'retail_%'
              order by task_events.occurred_at desc
              limit 150
            `
          : Promise.resolve([])
      ])
    : [[], []];
  const auditEvents = [
    ...adminAuditRows.map((row) => ({
      action: row.action,
      actorEmail: row.actor_email,
      actorName: row.actor_name,
      agentName: null,
      details: objectRecord(row.metadata),
      id: row.id,
      occurredAt: isoDateTime(row.created_at),
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      resourceId: row.resource_id,
      resourceType: row.resource_type,
      severity: null,
      source: "admin" as const,
      status: null
    })),
    ...taskEventRows.map((row) => ({
      action: row.event_type,
      actorEmail: null,
      actorName: null,
      agentName: row.agent_name,
      details: objectRecord(row.event_payload),
      id: row.id,
      occurredAt: isoDateTime(row.occurred_at),
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      resourceId: row.resource_id,
      resourceType: row.resource_type,
      severity: row.severity,
      source: "task" as const,
      status: row.event_status
    }))
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 200);
  const tasks: AdminRetailOperationsTask[] = taskRows.map((row) => {
    const priorityScore = integerOrDefault(row.priority_score, 200);
    const payload = objectRecord(row.payload);
    const payloadProductId = stringMetadata(payload.productId);
    const taskPipeline =
      row.source_entity_type === "retail_customer_order" && row.source_entity_id
        ? payloadProductId
          ? pipelineRows.find(
              (pipeline) =>
                pipeline.customerOrderId === row.source_entity_id &&
                pipeline.productId === payloadProductId
            ) ?? pipelineByOrderId.get(row.source_entity_id) ?? null
          : pipelineByOrderId.get(row.source_entity_id) ?? null
        : payloadProductId
          ? pipelineRows.find(
              (pipeline) =>
                pipeline.organisationId === row.organisation_id &&
                pipeline.productId === payloadProductId
            ) ?? null
          : null;

    return {
      actorType: row.actor_type,
      agentName: row.agent_name,
      claimedAt: isoDateTimeOrNull(row.claimed_at),
      claimedByEmail: row.claimed_by_email,
      claimedByName: row.claimed_by_name,
      claimedByPersonId: row.claimed_by_person_id,
      dueAt: isoDateTimeOrNull(row.due_at),
      id: row.id,
      isAgentTask:
        row.actor_type !== "human" ||
        row.task_type === "retail_stock_forecast_refresh",
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      pipeline: taskPipeline,
      priorityBand: priorityBand(priorityScore),
      priorityReason: row.priority_reason,
      priorityScore,
      profitImpactAmount: numberOrNull(row.profit_impact_amount),
      profitImpactCurrency: row.profit_impact_currency,
      scheduledFor: isoDateTime(row.scheduled_for),
      sourceEntityId: row.source_entity_id,
      sourceEntityType: row.source_entity_type,
      status: row.status,
      taskType: row.task_type,
      title: row.title,
      updatedAt: isoDateTime(row.updated_at)
    };
  });
  const tasksByCustomerOrderId = new Map<string, AdminRetailOperationsTask[]>();

  for (const task of tasks) {
    if (
      task.sourceEntityType !== "retail_customer_order" ||
      !task.sourceEntityId
    ) {
      continue;
    }

    const existing = tasksByCustomerOrderId.get(task.sourceEntityId) ?? [];

    existing.push(task);
    tasksByCustomerOrderId.set(task.sourceEntityId, existing);
  }

  return {
    auditEvents,
    canFilterOrganisation: canReadAllRetailStock(context),
    canRouteRegionalCheckout: canRouteRegionalCheckout(context),
    canWrite: canWriteRetailStock(context),
    carrierAccounts: carrierAccountRows.map((row) => ({
      capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
      carrierId: row.carrier_id,
      displayName: row.display_name,
      id: row.id,
      lastTestStatus: row.last_test_status,
      lastTestedAt: isoDateTimeOrNull(row.last_tested_at),
      organisationId: row.organisation_id,
      status: row.status,
      updatedAt: isoDateTime(row.updated_at)
    })),
    customerOrderLines: customerOrderLineRows.map((row) => ({
      ...lineAvailabilityFromMetadata(row.metadata),
      customerOrderId: row.customer_order_id,
      ean13: row.ean13,
      id: row.id,
      manufacturerSku: row.manufacturer_sku,
      notes: row.notes,
      pipeline:
        pipelineByLineKey.get(
          pipelineKey(row.id, row.product_id)
        ) ?? null,
      productId: row.product_id,
      productTitle: row.product_title,
      quantityAllocated: integerOrDefault(row.quantity_allocated, 0),
      quantityOrdered: integerOrDefault(row.quantity_ordered, 0),
      quantityShipped: integerOrDefault(row.quantity_shipped, 0),
      retailPriceAmount: numberOrNull(row.retail_price_amount)
    })),
    customerOrders: customerOrderRows.map((row) => {
      const status = customerOrderStatus(row.status);
      const pipeline = pipelineByOrderId.get(row.id) ?? null;
      const shipment = mergeCustomerOrderShipment(
        shipmentFromMetadata(row.metadata),
        shipmentByOrderId.get(row.id) ?? null
      );
      const workflowStage =
        customerOrderPickupInProgress(status, shipment)
          ? "pickup_booked"
          : (status === "allocated" ||
              status === "picking" ||
              status === "packed") &&
            pipeline &&
            !orderPipelineFullyBacked(pipeline)
          ? "awaiting_stock"
          : workflowStageForStatus(status);
      const relatedTasks = tasksByCustomerOrderId.get(row.id) ?? [];
      const openTasks = relatedTasks.filter(
        (task) => !isTerminalTaskStatus(task.status)
      );
      const actionStates = getRetailCustomerOrderActionStates(
        status,
        pipeline,
        shipment
      );
      const workflowHealth = getRetailCustomerOrderWorkflowHealth({
        openTasks,
        pipeline,
        status,
        workflowStage
      });
      const relatedAuditEvents = auditEvents.filter(
        (event) =>
          event.resourceId === row.id ||
          event.details.sourceEntityId === row.id ||
          event.details.customerOrderId === row.id ||
          event.details.fulfillmentOrderId === row.id
      );
      const lastWorkflowEventAt = [
        isoDateTime(row.updated_at),
        ...relatedTasks.map((task) => task.updatedAt),
        ...relatedAuditEvents.map((event) => event.occurredAt)
      ].sort().at(-1) ?? null;
      const deliveredAt = isoDateTimeOrNull(row.delivered_at);
      const placedAt = isoDateTimeOrNull(row.placed_at);
      const shippedAt = isoDateTimeOrNull(row.shipped_at);
      const updatedAt = isoDateTime(row.updated_at);

      return {
        actionStates,
        currency: row.currency,
        customerEmail: row.customer_email,
        customerName: row.customer_name,
        deliveredAt,
        deliveryDetails: deliveryDetailsFromMetadata(row.metadata),
        dueAt: isoDateTimeOrNull(row.due_at),
        fulfillmentPromise: fulfillmentPromiseFromMetadata(row.metadata),
        id: row.id,
        isStuck: workflowHealth.isStuck,
        lineCount: integerOrDefault(row.line_count, 0),
        lastWorkflowEventAt,
        nextExpectedAction: workflowHealth.nextAction,
        nextExpectedTaskType: workflowHealth.expectedTaskType,
        notes: row.notes,
        openTaskCount: openTasks.length,
        orderNumber: row.order_number,
        orderedUnits: integerOrDefault(row.ordered_units, 0),
        organisationId: row.organisation_id,
        organisationName: row.organisation_name,
        placedAt,
        pipeline,
        pricingSnapshot: pricingSnapshotFromMetadata(row.metadata, row.currency),
        routingSnapshot: routingSnapshotFromMetadata(row.metadata),
        shippedAt,
        shippedUnits: integerOrDefault(row.shipped_units, 0),
        shipment,
        source: customerOrderSource(row.source),
        status,
        stuckReason: workflowHealth.reason,
        taskCount: relatedTasks.length,
        totalRetailAmount: numberOrNull(row.total_retail_amount),
        updatedAt,
        workflowStage,
        workflowHealth,
        workflowTimeline: customerOrderWorkflowTimeline({
          deliveredAt,
          events: relatedAuditEvents,
          placedAt,
          pickupBookedAt:
            shipment?.pickupBookedAt ??
            (customerOrderPickupInProgress(status, shipment) ? updatedAt : null),
          shippedAt,
          status,
          updatedAt
        }),
        workflowTaskIds: relatedTasks.map((task) => task.id)
      };
    }),
    databaseAvailable: true,
    generatedAt: new Date().toISOString(),
    lots: lotRows.map((row) => ({
      currency: row.currency,
      expiresAt: isoDateOrNull(row.expires_at),
      id: row.id,
      notes: row.notes,
      organisationId: row.organisation_id,
      productId: row.product_id,
      productTitle: row.product_title,
      receivedAt: isoDateTime(row.received_at),
      receivedQuantity: integerOrDefault(row.received_quantity, 0),
      remainingQuantity: integerOrDefault(row.remaining_quantity, 0),
      status: lotStatus(row.status),
      stockId: row.retail_product_stock_id,
      wholesalePriceAmount: numberOrNull(row.wholesale_price_amount)
    })),
    movements: movementRows.map((row) => ({
      currency: row.currency,
      id: row.id,
      isVoided: Boolean(row.is_voided),
      lotId: row.lot_id,
      movementType: movementType(row.movement_type),
      notes: row.notes,
      occurredAt: isoDateTime(row.occurred_at),
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      productId: row.product_id,
      productTitle: row.product_title,
      quantityDelta: integerOrDefault(row.quantity_delta, 0),
      reason: row.reason,
      retailPriceAmount: numberOrNull(row.retail_price_amount),
      stockId: row.retail_product_stock_id,
      unitCostAmount: numberOrNull(row.unit_cost_amount),
      voidsMovementId: row.voids_movement_id
    })),
    organisations,
    pipeline: pipelineRows,
    productOptions: productRows.map((row) => ({
      brandName: row.brand_name,
      id: row.id,
      imageUrl: row.image_url,
      productKind: row.product_kind,
      title: row.title
    })),
    reorderAdvice: adviceRows.map((row) => ({
      calculatedAt: isoDateTime(row.calculated_at),
      confidence:
        row.confidence === "high" || row.confidence === "medium"
          ? row.confidence
          : "low",
      currentStockQuantity: integerOrDefault(row.current_stock_quantity, 0),
      daysCover: numberOrNull(row.days_cover),
      id: row.id,
      leadTimeDays: integerOrDefault(row.lead_time_days, 0),
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      outflowUnits30d: integerOrDefault(row.outflow_units_30d, 0),
      productId: row.product_id,
      productTitle: row.product_title,
      recommendationPressureCount: integerOrDefault(
        row.recommendation_pressure_count,
        0
      ),
      reorderBy: isoDateOrNull(row.reorder_by),
      riskLevel:
        row.risk_level === "out_of_stock" ||
        row.risk_level === "reorder" ||
        row.risk_level === "watch"
          ? row.risk_level
          : "ok",
      stockId: row.retail_product_stock_id,
      suggestedOrderQuantity: integerOrDefault(row.suggested_order_quantity, 0)
    })),
    rows: stockRows.map((row) => ({
      backorderPolicy: stockBackorderPolicy(row.backorder_policy),
      brandName: row.brand_name,
      currency: row.currency,
      id: row.id,
      imageUrl: row.image_url,
      leadTimeDays: integerOrDefault(row.lead_time_days, 0),
      notes: row.notes,
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      productId: row.product_id,
      productKind: row.product_kind,
      productStatus: row.product_status,
      productTitle: row.product_title,
      retailPriceAmount: numberOrNull(row.retail_price_amount),
      retailOverridePriceAmount: numberOrNull(row.retail_override_price_amount),
      retailSellableProductId: row.retail_sellable_product_id,
      status: stockStatus(row.status),
      stockQuantity: integerOrDefault(row.stock_quantity, 0),
      updatedAt: isoDateTime(row.updated_at),
      wholesalePriceAmount: numberOrNull(row.wholesale_price_amount)
	    })),
	    shoppingListLines: shoppingListLineRows.map((row) => ({
	      actualQuantity: integerOrDefault(row.actual_quantity, 0),
	      assignedQuantity: integerOrDefault(row.assigned_quantity, 0),
		      brandName: row.brand_name,
		      currentStockQuantity: integerOrDefault(row.current_stock_quantity, 0),
          ean13: row.ean13,
		      id: row.id,
          manufacturerSku: row.manufacturer_sku,
	      organisationId: row.organisation_id,
	      productId: row.product_id,
	      productTitle: row.product_title,
	      requiredQuantity: integerOrDefault(row.required_quantity, 0),
	      retailPriceAmount: numberOrNull(row.retail_price_amount),
	      shoppingListId: row.shopping_list_id,
	      stockedQuantity: integerOrDefault(row.stocked_quantity, 0),
	      unorderedNeedQuantity: integerOrDefault(row.unordered_need_quantity, 0),
	      wholesalePriceAmount: numberOrNull(row.wholesale_price_amount)
	    })),
	    shoppingLists: shoppingListRows.map((row) => ({
	      actualUnits: integerOrDefault(row.actual_units, 0),
	      createdAt: isoDateTime(row.created_at),
	      currency: row.currency,
	      id: row.id,
	      lineCount: integerOrDefault(row.line_count, 0),
	      listNumber: row.list_number,
	      organisationId: row.organisation_id,
	      organisationName: row.organisation_name,
	      requiredUnits: integerOrDefault(row.required_units, 0),
	      status: shoppingListStatus(row.status),
	      stockedUnits: integerOrDefault(row.stocked_units, 0),
	      updatedAt: isoDateTime(row.updated_at)
	    })),
    tasks
  };
}

export async function upsertRetailStockItem(
  context: AdminSessionContext,
  input: UpsertRetailStockItemInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const organisation = await organisationForStockWrite(
    sql,
    context,
    input.organisationId
  );
  const productId = input.productId.trim();

  if (!(await productApproved(sql, productId))) {
    throw new Error("Only approved master products can be stocked");
  }

  const existingRows = await sql<Array<{ id: string; status: string }>>`
    select id::text, status
    from public.retail_product_stock
    where organisation_id = ${organisation.id}::uuid
      and product_id = ${productId}::uuid
    limit 1
  `;
  const status = stockStatus(input.status);
  const backorderPolicy = stockBackorderPolicy(input.backorderPolicy);
  const retailPriceAmount = numberOrNull(input.retailPriceAmount);
  const wholesalePriceAmount = numberOrNull(input.wholesalePriceAmount);

  const sellableRows = await sql<Array<{ id: string }>>`
    insert into public.retail_sellable_products (
      organisation_id,
      product_id,
      status,
      rrp_price_amount,
      wholesale_price_amount,
      currency,
      lead_time_days,
      backorder_policy,
      notes,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${organisation.id}::uuid,
      ${productId}::uuid,
      ${status},
      ${retailPriceAmount},
      ${wholesalePriceAmount},
      ${organisation.currency},
      ${integerOrDefault(input.leadTimeDays, 0)},
      ${backorderPolicy},
      ${input.notes?.trim() || null},
      ${sql.json({
        updatedByPersonId: context.actorPerson.id,
        updatedVia: "admin_sellable_catalogue"
      })},
      now(),
      now()
    )
    on conflict (organisation_id, product_id)
    do update set
      status = excluded.status,
      rrp_price_amount = excluded.rrp_price_amount,
      wholesale_price_amount = excluded.wholesale_price_amount,
      currency = excluded.currency,
      lead_time_days = excluded.lead_time_days,
      backorder_policy = excluded.backorder_policy,
      notes = excluded.notes,
      metadata = retail_sellable_products.metadata || excluded.metadata,
      updated_at = now()
    returning id::text
  `;
  const sellableId = sellableRows[0]?.id ?? null;

  const rows = await sql<RetailStockSnapshotRow[]>`
    insert into public.retail_product_stock (
      organisation_id,
      product_id,
      status,
      stock_quantity,
      lead_time_days,
      wholesale_price_amount,
      retail_price_amount,
      currency,
      notes,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${organisation.id}::uuid,
      ${productId}::uuid,
      ${status},
      ${integerOrDefault(input.stockQuantity, 0)},
      ${integerOrDefault(input.leadTimeDays, 0)},
      ${wholesalePriceAmount},
      null,
      ${organisation.currency},
      ${input.notes?.trim() || null},
      ${sql.json({
        updatedByPersonId: context.actorPerson.id,
        updatedVia: "admin_stock"
      })},
      now(),
      now()
    )
    on conflict (organisation_id, product_id)
    do update set
      status = excluded.status,
      stock_quantity = excluded.stock_quantity,
      lead_time_days = excluded.lead_time_days,
      wholesale_price_amount = excluded.wholesale_price_amount,
      retail_price_amount = excluded.retail_price_amount,
      currency = excluded.currency,
      notes = excluded.notes,
      metadata = retail_product_stock.metadata || excluded.metadata,
      updated_at = now()
    returning
      id::text,
      organisation_id::text,
      product_id::text,
      status,
      stock_quantity,
      lead_time_days,
      wholesale_price_amount,
      retail_price_amount,
      currency,
      notes
  `;

  const stockRow = rows[0] ?? null;
  const id = stockRow?.id ?? null;

  if (id && stockRow) {
    await recordRetailStockSnapshot(
      sql,
      context,
      stockRow,
      existingRows[0] ? "updated" : "created",
      {
        previousStatus: existingRows[0]?.status ?? null
      }
    );

    await recordAdminAudit({
      action: existingRows[0] ? "admin.stock_updated" : "admin.stock_created",
      actorPersonId: context.actorPerson.id,
      assumedPersonId: context.assumedPerson?.id ?? null,
      organisationId: organisation.id,
      resourceId: id,
      resourceType: "retail_product_stock",
      metadata: {
        currency: organisation.currency,
        backorderPolicy,
        leadTimeDays: integerOrDefault(input.leadTimeDays, 0),
        previousStatus: existingRows[0]?.status ?? null,
        productId,
        retailPriceAmount,
        retailSellableProductId: sellableId,
        status,
        stockQuantity: integerOrDefault(input.stockQuantity, 0),
        wholesalePriceAmount
      }
    });

    await refreshRetailStockReorderAdvice({
      organisationId: organisation.id,
      productId,
      stockId: id
    });
    await repairRetailStockAllocationIntegrity(context, {
      source: "admin_stock_update",
      sql,
      stockId: id
    });
    await queueRetailStockIntelligenceRefresh(
      stockRow,
      existingRows[0] ? "stock_updated" : "stock_created"
    );
    await queueStockReviewTasks(
      stockRow,
      existingRows[0] ? "stock_updated" : "stock_created"
    );
  }

  return id;
}

async function stockRowForMovement(
  sql: StockDb,
  context: AdminSessionContext,
  stockId: string
) {
  const rows = await sql<Array<RetailStockSnapshotRow>>`
    select
      retail_product_stock.id::text,
      retail_product_stock.organisation_id::text,
      retail_product_stock.product_id::text,
      retail_product_stock.status,
      retail_product_stock.stock_quantity,
      retail_product_stock.lead_time_days,
      retail_product_stock.wholesale_price_amount,
      retail_product_stock.retail_price_amount,
      retail_product_stock.currency,
      retail_product_stock.notes
    from public.retail_product_stock
    join public.organisations
      on organisations.id = retail_product_stock.organisation_id
    where retail_product_stock.id = ${stockId}::uuid
      and retail_product_stock.status <> 'deleted'
      and organisations.organisation_type = 'tenant'
      and organisations.status = 'active'
      and (
        ${canReadAllRetailStock(context)}::boolean
        or retail_product_stock.organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;

  if (!rows[0]) {
    throw new Error("Stock row not found");
  }

  return rows[0];
}

export async function recordRetailStockMovement(
  context: AdminSessionContext,
  input: RecordRetailStockMovementInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  if (!(await operationalStockTablesAvailable(sql))) {
    throw new Error("Retail stock movement tables are not available");
  }

  const type = movementType(input.movementType);

  if (type === "void") {
    throw new Error("Use the void movement action to void stock movements");
  }

  const delta = movementDelta(type, input.quantity);
  const stockId = input.stockId.trim();
  const unitCostAmount = numberOrNull(input.unitCostAmount);
  let movementId = "";
  let stockRow: RetailStockSnapshotRow | null = null;

  {
    const tx = sql;
    const before = await stockRowForMovement(tx, context, stockId);
    const beforeQuantity = integerOrDefault(before.stock_quantity, 0);
    const nextQuantity = beforeQuantity + delta;

    if (nextQuantity < 0) {
      throw new Error("Stock movement cannot make stock negative");
    }

    let lotId = input.lotId?.trim() || null;

    if (type === "receive") {
      const lotRows = await tx<Array<{ id: string }>>`
        insert into public.retail_stock_lots (
          retail_product_stock_id,
          organisation_id,
          product_id,
          status,
          received_quantity,
          remaining_quantity,
          wholesale_price_amount,
          currency,
          expires_at,
          received_at,
          notes,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${before.id}::uuid,
          ${before.organisation_id}::uuid,
          ${before.product_id}::uuid,
          ${delta > 0 ? "active" : "depleted"},
          ${Math.max(0, delta)},
          ${Math.max(0, delta)},
          ${unitCostAmount},
          ${before.currency},
          ${isoDateOrNull(input.expiresAt)},
          now(),
          ${input.notes?.trim() || null},
          ${tx.json({
            createdByPersonId: context.actorPerson.id,
            source: "admin_stock_movement"
          })},
          now(),
          now()
        )
        returning id::text
      `;
      lotId = lotRows[0]?.id ?? null;
    } else if (lotId && delta < 0) {
      const lotRows = await tx<Array<{ id: string }>>`
        update public.retail_stock_lots
        set
          remaining_quantity = remaining_quantity + ${delta},
          status = case
            when remaining_quantity + ${delta} = 0 then 'depleted'
            else status
          end,
          updated_at = now()
        where id = ${lotId}::uuid
          and retail_product_stock_id = ${before.id}::uuid
          and status in ('active', 'depleted')
          and remaining_quantity + ${delta} >= 0
        returning id::text
      `;

      if (!lotRows[0]) {
        throw new Error("Lot does not have enough remaining stock");
      }
    } else if (lotId && delta > 0) {
      await tx`
        update public.retail_stock_lots
        set
          remaining_quantity = remaining_quantity + ${delta},
          received_quantity = received_quantity + ${delta},
          status = 'active',
          updated_at = now()
        where id = ${lotId}::uuid
          and retail_product_stock_id = ${before.id}::uuid
          and status <> 'deleted'
      `;
    }

    const movementRows = await tx<Array<{ id: string }>>`
      insert into public.retail_stock_movements (
        retail_product_stock_id,
        lot_id,
        organisation_id,
        product_id,
        movement_type,
        quantity_delta,
        unit_cost_amount,
        retail_price_amount,
        currency,
        reason,
        notes,
        actor_person_id,
        source,
        metadata,
        occurred_at,
        created_at
      )
      values (
        ${before.id}::uuid,
        ${lotId}::uuid,
        ${before.organisation_id}::uuid,
        ${before.product_id}::uuid,
        ${type},
        ${delta},
        ${unitCostAmount},
        ${null},
        ${before.currency},
        ${input.reason?.trim() || null},
        ${input.notes?.trim() || null},
        ${context.actorPerson.id}::uuid,
        'admin',
        ${tx.json({
          assumedPersonId: context.assumedPerson?.id ?? null,
          source: "admin_stock_movement"
        })},
        now(),
        now()
      )
      returning id::text
    `;
    movementId = movementRows[0]?.id ?? "";

    const updatedRows = await tx<RetailStockSnapshotRow[]>`
      update public.retail_product_stock
      set
        stock_quantity = ${nextQuantity},
        wholesale_price_amount = coalesce(${unitCostAmount}, wholesale_price_amount),
        retail_price_amount = retail_price_amount,
        metadata = metadata || ${tx.json({
          lastMovementId: movementId,
          movementType: type,
          updatedByPersonId: context.actorPerson.id,
          updatedVia: "admin_stock_movement"
        })},
        updated_at = now()
      where id = ${before.id}::uuid
      returning
        id::text,
        organisation_id::text,
        product_id::text,
        status,
        stock_quantity,
        lead_time_days,
        wholesale_price_amount,
        retail_price_amount,
        currency,
        notes
    `;
    stockRow = updatedRows[0] ?? null;

    if (stockRow) {
      await recordRetailStockSnapshot(tx, context, stockRow, "movement", {
        movementId,
        movementType: type,
        quantityDelta: delta
      });
    }
  }

  if (!stockRow) {
    throw new Error("Stock movement could not be recorded");
  }
  const recordedStockRow = stockRow as RetailStockSnapshotRow;

  await recordAdminAudit({
    action: "admin.stock_movement_recorded",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: recordedStockRow.organisation_id,
    resourceId: movementId,
    resourceType: "retail_stock_movement",
    metadata: {
      movementType: type,
      productId: recordedStockRow.product_id,
      quantityDelta: delta,
      stockId: recordedStockRow.id
    }
  });

  if (!input.deferReorderSideEffects) {
    try {
      await refreshRetailStockReorderAdvice({
        organisationId: recordedStockRow.organisation_id,
        productId: recordedStockRow.product_id,
        stockId: recordedStockRow.id
      });
      await queueRetailStockIntelligenceRefresh(
        recordedStockRow,
        "stock_movement_recorded"
      );
      await queueStockReviewTasks(recordedStockRow, "stock_movement_recorded");
    } catch (error) {
      console.warn("Unable to refresh retail stock advice after movement", error);
    }
  }

  if (delta < 0 && !input.deferAllocationIntegrityRepair) {
    await repairRetailStockAllocationIntegrity(context, {
      source: "stock_movement_reduced_stock",
      sql,
      stockId: recordedStockRow.id
    });
  }

  if (
    type === "adjustment" ||
    type === "expiry_write_off" ||
    Math.abs(delta) * (unitCostAmount ?? 0) >= 5000
  ) {
    await queueRetailOperationTask({
      description: "Review a stock exception movement before the operational record is relied on.",
      idempotencyKey: `${movementId}:movement-review`,
      organisationId: recordedStockRow.organisation_id,
      priorityReason:
        type === "expiry_write_off"
          ? "Stock was written off for expiry."
          : "Manual stock movement needs review.",
      priorityScore: type === "expiry_write_off" ? 620 : 460,
      profitImpactAmount: Math.abs(delta) * (unitCostAmount ?? 0),
      profitImpactCurrency: recordedStockRow.currency,
      sourceEntityId: movementId,
      sourceEntityType: "retail_stock_movement",
      taskType: "retail_stock_movement_review",
      title: "Review stock movement"
    });
  }

  return movementId;
}

export async function voidRetailStockMovement(
  context: AdminSessionContext,
  input: Readonly<{
    movementId: string;
    notes?: string | null;
    reason?: string | null;
  }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  if (!(await operationalStockTablesAvailable(sql))) {
    throw new Error("Retail stock movement tables are not available");
  }

  let voidId = "";
  let stockRow: RetailStockSnapshotRow | null = null;
  let voidDelta = 0;

  {
    const tx = sql;
    const movementRows = await tx<Array<{
      currency: string;
      id: string;
      lot_id: string | null;
      movement_type: string;
      organisation_id: string;
      product_id: string;
      quantity_delta: number | string;
      retail_price_amount: number | string | null;
      retail_product_stock_id: string;
      unit_cost_amount: number | string | null;
    }>>`
      select
        retail_stock_movements.id::text,
        retail_stock_movements.retail_product_stock_id::text,
        retail_stock_movements.lot_id::text,
        retail_stock_movements.organisation_id::text,
        retail_stock_movements.product_id::text,
        retail_stock_movements.movement_type,
        retail_stock_movements.quantity_delta,
        retail_stock_movements.unit_cost_amount,
        retail_stock_movements.retail_price_amount,
        retail_stock_movements.currency
      from public.retail_stock_movements
      join public.organisations
        on organisations.id = retail_stock_movements.organisation_id
      where retail_stock_movements.id = ${input.movementId.trim()}::uuid
        and retail_stock_movements.movement_type <> 'void'
        and organisations.status = 'active'
        and (
          ${canReadAllRetailStock(context)}::boolean
          or retail_stock_movements.organisation_id = ${context.effectiveOrganisation.id}::uuid
        )
        and not exists (
          select 1
          from public.retail_stock_movements voids
          where voids.voids_movement_id = retail_stock_movements.id
            and voids.movement_type = 'void'
        )
      limit 1
    `;
    const original = movementRows[0];

    if (!original) {
      throw new Error("Movement cannot be voided");
    }

    const before = await stockRowForMovement(
      tx,
      context,
      original.retail_product_stock_id
    );
    const originalDelta = integerOrDefault(original.quantity_delta, 0);
    voidDelta = -originalDelta;
    const nextQuantity = integerOrDefault(before.stock_quantity, 0) + voidDelta;

    if (nextQuantity < 0) {
      throw new Error("Void would make stock negative");
    }

    if (original.lot_id) {
      await tx`
        update public.retail_stock_lots
        set
          remaining_quantity = greatest(0, least(received_quantity, remaining_quantity + ${voidDelta})),
          status = case
            when greatest(0, least(received_quantity, remaining_quantity + ${voidDelta})) = 0 then 'depleted'
            else 'active'
          end,
          updated_at = now()
        where id = ${original.lot_id}::uuid
          and retail_product_stock_id = ${before.id}::uuid
      `;
    }

    const voidRows = await tx<Array<{ id: string }>>`
      insert into public.retail_stock_movements (
        retail_product_stock_id,
        lot_id,
        organisation_id,
        product_id,
        movement_type,
        quantity_delta,
        unit_cost_amount,
        retail_price_amount,
        currency,
        reason,
        notes,
        voids_movement_id,
        actor_person_id,
        source,
        metadata,
        occurred_at,
        created_at
      )
      values (
        ${before.id}::uuid,
        ${original.lot_id}::uuid,
        ${before.organisation_id}::uuid,
        ${before.product_id}::uuid,
        'void',
        ${voidDelta},
        ${numberOrNull(original.unit_cost_amount)},
        ${numberOrNull(original.retail_price_amount)},
        ${before.currency},
        ${input.reason?.trim() || "Void stock movement"},
        ${input.notes?.trim() || null},
        ${original.id}::uuid,
        ${context.actorPerson.id}::uuid,
        'admin',
        ${tx.json({
          assumedPersonId: context.assumedPerson?.id ?? null,
          source: "admin_stock_void"
        })},
        now(),
        now()
      )
      returning id::text
    `;
    voidId = voidRows[0]?.id ?? "";

    const updatedRows = await tx<RetailStockSnapshotRow[]>`
      update public.retail_product_stock
      set
        stock_quantity = ${nextQuantity},
        metadata = metadata || ${tx.json({
          lastMovementId: voidId,
          voidedMovementId: original.id,
          updatedByPersonId: context.actorPerson.id,
          updatedVia: "admin_stock_void"
        })},
        updated_at = now()
      where id = ${before.id}::uuid
      returning
        id::text,
        organisation_id::text,
        product_id::text,
        status,
        stock_quantity,
        lead_time_days,
        wholesale_price_amount,
        retail_price_amount,
        currency,
        notes
    `;
    stockRow = updatedRows[0] ?? null;

    if (stockRow) {
      await recordRetailStockSnapshot(tx, context, stockRow, "movement", {
        movementId: voidId,
        movementType: "void",
        quantityDelta: voidDelta,
        voidedMovementId: original.id
      });
    }
  }

  if (!stockRow) {
    throw new Error("Stock movement could not be voided");
  }
  const voidedStockRow = stockRow as RetailStockSnapshotRow;

  await recordAdminAudit({
    action: "admin.stock_movement_voided",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: voidedStockRow.organisation_id,
    resourceId: voidId,
    resourceType: "retail_stock_movement",
    metadata: {
      movementId: input.movementId,
      productId: voidedStockRow.product_id,
      quantityDelta: voidDelta,
      stockId: voidedStockRow.id
    }
  });

  await refreshRetailStockReorderAdvice({
    organisationId: voidedStockRow.organisation_id,
    productId: voidedStockRow.product_id,
    stockId: voidedStockRow.id
  });
  if (voidDelta < 0) {
    await repairRetailStockAllocationIntegrity(context, {
      source: "stock_movement_void_reduced_stock",
      sql,
      stockId: voidedStockRow.id
    });
  }
  await queueRetailStockIntelligenceRefresh(voidedStockRow, "stock_movement_voided");
  await queueStockReviewTasks(voidedStockRow, "stock_movement_voided");

  return voidId;
}

export async function setRetailStockStatus(
  context: AdminSessionContext,
  input: Readonly<{
    id: string;
    status: RetailStockStatus;
  }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const rows = await sql<RetailStockSnapshotRow[]>`
    update public.retail_product_stock
    set
      status = ${stockStatus(input.status)},
      metadata = metadata || ${sql.json({
        statusUpdatedByPersonId: context.actorPerson.id,
        statusUpdatedVia: "admin_stock"
      })},
      updated_at = now()
    where id = ${input.id.trim()}::uuid
      and organisation_id in (
        select id
        from public.organisations
        where organisation_type = 'tenant'
          and status = 'active'
          and (
            ${canReadAllRetailStock(context)}::boolean
            or id = ${context.effectiveOrganisation.id}::uuid
          )
      )
    returning
      id::text,
      organisation_id::text,
      product_id::text,
      status,
      stock_quantity,
      lead_time_days,
      wholesale_price_amount,
      retail_price_amount,
      currency,
      notes
  `;

  if (!rows[0]) {
    throw new Error("Stock row not found");
  }

  await sql`
    update public.retail_sellable_products
    set
      status = ${stockStatus(input.status)},
      metadata = metadata || ${sql.json({
        statusUpdatedByPersonId: context.actorPerson.id,
        statusUpdatedVia: "admin_stock"
      })},
      updated_at = now()
    where organisation_id = ${rows[0].organisation_id}::uuid
      and product_id = ${rows[0].product_id}::uuid
  `;

  await recordRetailStockSnapshot(sql, context, rows[0], "status_changed", {
    status: stockStatus(input.status)
  });

  await recordAdminAudit({
    action: "admin.stock_status_updated",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: rows[0].organisation_id,
    resourceId: rows[0].id,
    resourceType: "retail_product_stock",
    metadata: {
      status: stockStatus(input.status)
    }
  });

  await refreshRetailStockReorderAdvice({
    organisationId: rows[0].organisation_id,
    productId: rows[0].product_id,
    stockId: rows[0].id
  });
  await repairRetailStockAllocationIntegrity(context, {
    source: "stock_status_changed",
    sql,
    stockId: rows[0].id
  });
  await queueRetailStockIntelligenceRefresh(rows[0], "stock_status_updated");
  await queueStockReviewTasks(rows[0], "stock_status_updated");

  return rows[0].id;
}

async function ensureRetailStockRow(
  context: AdminSessionContext,
  input: Readonly<{
    organisationId: string;
    productId: string;
    snapshotSource?: string | null;
    source?: string | null;
    sql?: StockDb;
    wholesalePriceAmount?: number | null;
  }>
) {
  const sql = input.sql ?? getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const existing = await sql<Array<{ id: string }>>`
    select id::text
    from public.retail_product_stock
    where organisation_id = ${input.organisationId}::uuid
      and product_id = ${input.productId}::uuid
      and status <> 'deleted'
    limit 1
  `;

  if (existing[0]?.id) {
    return existing[0].id;
  }

  const organisation = await organisationForStockWrite(
    sql,
    context,
    input.organisationId
  );

  if (!(await productApproved(sql, input.productId))) {
    throw new Error("Only approved master products can be stocked");
  }

  const rows = await sql<RetailStockSnapshotRow[]>`
    insert into public.retail_product_stock (
      organisation_id,
      product_id,
      status,
      stock_quantity,
      lead_time_days,
      wholesale_price_amount,
      retail_price_amount,
      currency,
      notes,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${organisation.id}::uuid,
      ${input.productId}::uuid,
      'active',
      0,
      0,
      ${numberOrNull(input.wholesalePriceAmount)},
      null,
      ${organisation.currency},
      null,
      ${sql.json({
        createdByPersonId: context.actorPerson.id,
        source: input.source ?? "admin_stock_receiving"
      })},
      now(),
      now()
    )
    on conflict (organisation_id, product_id)
    do update set
      status = case
        when retail_product_stock.status = 'deleted' then 'active'
        else retail_product_stock.status
      end,
      wholesale_price_amount = coalesce(
        excluded.wholesale_price_amount,
        retail_product_stock.wholesale_price_amount
      ),
      currency = excluded.currency,
      metadata = retail_product_stock.metadata || excluded.metadata,
      updated_at = now()
    returning
      id::text,
      organisation_id::text,
      product_id::text,
      status,
      stock_quantity,
      lead_time_days,
      wholesale_price_amount,
      retail_price_amount,
      currency,
      notes
  `;

  if (!rows[0]) {
    throw new Error("Stock row could not be created");
  }

  await recordRetailStockSnapshot(sql, context, rows[0], "created", {
    source: input.snapshotSource ?? "shopping_list_receiving"
  });

  return rows[0].id;
}

export async function createRetailShoppingList(
  context: AdminSessionContext,
  input: CreateRetailShoppingListInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await ensureRetailShoppingListTablesAvailable(sql);

  const organisation = await organisationForStockWrite(
    sql,
    context,
    input.organisationId
  );
  const lines = input.lines.filter((line) => line.productId.trim());

  if (lines.length < 1) {
    throw new Error("At least one shopping list line is required");
  }

  for (const line of lines) {
    if (!(await productApproved(sql, line.productId.trim()))) {
      throw new Error("Only approved master products can be added to shopping lists");
    }
  }

	const listRows = await sql<Array<{ id: string }>>`
	    insert into public.retail_shopping_lists (
	      organisation_id,
	      list_number,
	      status,
	      currency,
	      created_by_person_id,
	      metadata,
	      created_at,
      updated_at
    )
    values (
	      ${organisation.id}::uuid,
	      ${orderNumber("SL")},
	      'active',
	      ${organisation.currency},
	      ${context.actorPerson.id}::uuid,
	      ${sql.json({
	        createdByPersonId: context.actorPerson.id,
        source: "retail_reorder_workflow"
      })},
      now(),
      now()
    )
    returning id::text
  `;
  const shoppingListId = listRows[0]?.id;

  if (!shoppingListId) {
    throw new Error("Shopping list could not be created");
  }

  for (const line of lines) {
	    const requiredQuantity = integerOrDefault(line.requiredQuantity, 0);
	    const unorderedNeedQuantity = integerOrDefault(line.unorderedNeedQuantity, 0);
		    const assignedQuantity = Math.max(
		      0,
		      integerOrDefault(line.assignedQuantity, unorderedNeedQuantity)
		    );
	    const actualQuantity = Math.max(
	      0,
	      integerOrDefault(line.actualQuantity, assignedQuantity)
	    );

	    await sql`
	      insert into public.retail_shopping_list_lines (
        shopping_list_id,
        organisation_id,
        product_id,
	        required_quantity,
	        current_stock_quantity,
	        unordered_need_quantity,
	        assigned_quantity,
	        actual_quantity,
	        stocked_quantity,
	        wholesale_price_amount,
	        retail_price_amount,
	        metadata,
	        created_at,
        updated_at
      )
      values (
        ${shoppingListId}::uuid,
        ${organisation.id}::uuid,
        ${line.productId.trim()}::uuid,
	        ${requiredQuantity},
	        ${integerOrDefault(line.currentStockQuantity, 0)},
	        ${unorderedNeedQuantity},
	        ${assignedQuantity},
	        ${actualQuantity},
	        0,
	        ${numberOrNull(line.wholesalePriceAmount)},
	        ${numberOrNull(line.retailPriceAmount)},
	        ${sql.json({ source: "retail_reorder_workflow" })},
        now(),
        now()
      )
    `;
  }

  await recordAdminAudit({
    action: "admin.retail_shopping_list_created",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: organisation.id,
    resourceId: shoppingListId,
    resourceType: "retail_shopping_list",
    metadata: {
      lineCount: lines.length
    }
  });

  return shoppingListId;
}

export async function ensureRetailOrderShortagesInReorderAdvice(
  context: AdminSessionContext,
  input: Readonly<{
    customerOrderId: string;
    orderNumber?: string | null;
    organisationId: string;
    sql?: StockDb;
  }>
): Promise<RetailOrderReorderAdviceShortageResult> {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = input.sql ?? getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const pipelineRows = await getRetailStockPipeline({
    customerOrderId: input.customerOrderId,
    locale: context.effectivePerson.preferredLocale,
    organisationIds: [input.organisationId],
    sql
  });
  const shortageByProduct = new Map<
    string,
    Readonly<{
      productTitle: string;
      unorderedNeedUnits: number;
    }>
  >();

  for (const row of pipelineRows) {
    if (!row.productId || row.unorderedNeedUnits < 1) {
      continue;
    }

    const current = shortageByProduct.get(row.productId);

    shortageByProduct.set(row.productId, {
      productTitle: row.productTitle ?? row.productId,
      unorderedNeedUnits:
        (current?.unorderedNeedUnits ?? 0) + row.unorderedNeedUnits
    });
  }

  const productIds = [...shortageByProduct.keys()];

  if (productIds.length === 0) {
    return {
      lineCount: 0,
      productIds: [],
      refreshedStockRowIds: [],
      shortageUnits: 0
    };
  }

  const stockRows = await sql<Array<{
    id: string;
    product_id: string;
    stock_quantity: number | string | null;
    wholesale_price_amount: number | string | null;
  }>>`
    select
      id::text,
      product_id::text,
      stock_quantity,
      wholesale_price_amount
    from public.retail_product_stock
    where organisation_id = ${input.organisationId}::uuid
      and product_id = any(${productIds}::uuid[])
      and status <> 'deleted'
  `;
  const stockByProductId = new Map(stockRows.map((row) => [row.product_id, row]));
  const actorPersonId = persistedActorPersonId(context);
  const actorMetadata = retailActorMetadata(context);
  let shortageUnits = 0;
  const touchedProductIds: string[] = [];
  const refreshedStockRowIds: string[] = [];

  for (const productId of productIds) {
    const shortage = shortageByProduct.get(productId);
    const unorderedNeedUnits = shortage?.unorderedNeedUnits ?? 0;

    if (unorderedNeedUnits < 1) {
      continue;
    }

    let stock = stockByProductId.get(productId) ?? null;

    if (!stock) {
      const stockId = await ensureRetailStockRow(context, {
        organisationId: input.organisationId,
        productId,
        snapshotSource: "retail_order_shortage_reorder_advice",
        source: "retail_order_shortage_reorder_advice",
        sql,
        wholesalePriceAmount: null
      });

      stock = {
        id: stockId,
        product_id: productId,
        stock_quantity: 0,
        wholesale_price_amount: null
      };
      stockByProductId.set(productId, stock);
    }

    await refreshRetailStockReorderAdvice({
      organisationId: input.organisationId,
      productId,
      stockId: stock.id
    });

    shortageUnits += unorderedNeedUnits;
    touchedProductIds.push(productId);
    refreshedStockRowIds.push(stock.id);
  }

  await recordAdminAudit({
    action: "admin.retail_reorder_advice_shortages_reconciled",
    actorPersonId,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: input.organisationId,
    resourceId: input.customerOrderId,
    resourceType: "retail_customer_order",
    metadata: {
      actorMetadata,
      customerOrderId: input.customerOrderId,
      lineCount: touchedProductIds.length,
      orderNumber: input.orderNumber ?? null,
      productIds: touchedProductIds,
      shortageUnits
    }
  });

  return {
    lineCount: touchedProductIds.length,
    productIds: touchedProductIds,
    refreshedStockRowIds,
    shortageUnits
  };
}

export async function reopenRetailShoppingList(
  context: AdminSessionContext,
  input: ReopenRetailShoppingListInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await ensureRetailShoppingListTablesAvailable(sql);

  const listRows = await sql<Array<{
    id: string;
    organisation_id: string;
    status: string;
  }>>`
    select id::text, organisation_id::text, status
    from public.retail_shopping_lists
    where id = ${input.shoppingListId.trim()}::uuid
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const list = listRows[0];

  if (!list) {
    throw new Error("Shopping list not found");
  }

  const previousStatus = shoppingListStatus(list.status);

  if (previousStatus === "active") {
    return list.id;
  }

  await sql`
    update public.retail_shopping_lists
    set status = 'active', updated_at = now()
    where id = ${list.id}::uuid
  `;

  await recordAdminAudit({
    action: "admin.retail_shopping_list_reopened",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: list.organisation_id,
    resourceId: list.id,
    resourceType: "retail_shopping_list",
    metadata: {
      previousStatus,
      status: "active"
    }
  });

  return list.id;
}

function orderPipelineFullyBacked(pipeline: AdminRetailStockPipelineRow | null) {
  return Boolean(
    pipeline &&
      pipeline.customerDemandUnits > 0 &&
      pipeline.backedAllocatedUnits >= pipeline.customerDemandUnits &&
      pipeline.unorderedNeedUnits < 1
  );
}

async function repairRetailOrdersAwaitingStockAfterAllocationRelease(
  context: AdminSessionContext,
  input: Readonly<{
    orderIds: readonly string[];
    organisationId: string;
    source: string;
    sql: StockDb;
  }>
) {
  const orderIds = [...new Set(input.orderIds.filter(Boolean))];

  if (orderIds.length === 0) {
    return { repairedOrderCount: 0, shortageUnits: 0 };
  }

  const orderRows = await input.sql<Array<{
    due_at: Date | string | null;
    id: string;
    order_number: string;
    status: string;
  }>>`
    select id::text, order_number, due_at, status
    from public.retail_customer_orders
    where organisation_id = ${input.organisationId}::uuid
      and id = any(${orderIds}::uuid[])
      and status in ('placed', 'awaiting_stock', 'allocated', 'picking', 'packed')
  `;
  let shortageUnits = 0;

  for (const order of orderRows) {
    const shortageRepair = await ensureRetailOrderShortagesInReorderAdvice(context, {
      customerOrderId: order.id,
      orderNumber: order.order_number,
      organisationId: input.organisationId,
      sql: input.sql
    });

    shortageUnits += shortageRepair.shortageUnits;

    await cancelStaleOrderWorkflowTasks(input.sql, context, {
      expectedTaskTypes: ["retail_shopping_list_review"],
      orderId: order.id,
      organisationId: input.organisationId,
      reason: "allocation_no_longer_backed_by_stock",
      status: "awaiting_stock"
    });

    await ensureOrderWorkflowTask(input.sql, context, {
      dueAt: order.due_at,
      orderId: order.id,
      organisationId: input.organisationId,
      taskType: "retail_shopping_list_review"
    });

    await recordRetailOrderBpmEvent(input.sql, context, {
      eventName: "retail_order_allocation_integrity_repaired",
      eventStatus: "awaiting_stock",
      metadata: {
        previousStatus: order.status,
        reorderAdviceLineCount: shortageRepair.lineCount,
        reorderAdviceShortageUnits: shortageRepair.shortageUnits,
        source: input.source
      },
      orderId: order.id,
      organisationId: input.organisationId
    });
  }

  return {
    repairedOrderCount: orderRows.length,
    shortageUnits
  };
}

async function repairRetailStockAllocationIntegrity(
  context: AdminSessionContext,
  input: Readonly<{
    source: string;
    sql: StockDb;
    stockId: string;
  }>
) {
  const stockRows = await input.sql<Array<{
    organisation_id: string;
    product_id: string;
    status: string;
    stock_quantity: number | string;
  }>>`
    select organisation_id::text, product_id::text, status, stock_quantity
    from public.retail_product_stock
    where id = ${input.stockId}::uuid
      and status <> 'deleted'
    limit 1
  `;
  const stock = stockRows[0];

  if (!stock) {
    return {
      affectedOrderIds: [] as string[],
      releasedUnits: 0,
      repairedOrderCount: 0,
      shortageUnits: 0
    };
  }

  const allocationRows = await input.sql<Array<{
    allocation_id: string;
    customer_order_id: string;
    customer_order_line_id: string;
    quantity_allocated: number | string;
  }>>`
    select
      retail_order_allocations.id::text as allocation_id,
      retail_order_allocations.customer_order_id::text,
      retail_order_allocations.customer_order_line_id::text,
      retail_order_allocations.quantity_allocated
    from public.retail_order_allocations
    join public.retail_customer_orders
      on retail_customer_orders.id = retail_order_allocations.customer_order_id
    where retail_order_allocations.retail_product_stock_id = ${input.stockId}::uuid
      and retail_order_allocations.status in ('active', 'picked')
      and retail_customer_orders.status in ('placed', 'awaiting_stock', 'allocated', 'picking', 'packed')
    order by
      coalesce(
        retail_customer_orders.due_at,
        retail_customer_orders.placed_at,
        retail_customer_orders.created_at
      ) desc,
      retail_order_allocations.created_at desc
  `;
  const availableStockUnits =
    stock.status === "active" ? integerOrDefault(stock.stock_quantity, 0) : 0;
  let excessUnits = Math.max(
    0,
    allocationRows.reduce(
      (total, allocation) =>
        total + integerOrDefault(allocation.quantity_allocated, 0),
      0
    ) - availableStockUnits
  );

  if (excessUnits < 1) {
    return {
      affectedOrderIds: [] as string[],
      releasedUnits: 0,
      repairedOrderCount: 0,
      shortageUnits: 0
    };
  }

  const affectedOrderIds = new Set<string>();
  let releasedUnits = 0;

  for (const allocation of allocationRows) {
    if (excessUnits < 1) {
      break;
    }

    const allocatedUnits = integerOrDefault(allocation.quantity_allocated, 0);
    const releaseUnits = Math.min(excessUnits, allocatedUnits);

    if (releaseUnits < 1) {
      continue;
    }

    if (releaseUnits >= allocatedUnits) {
      await input.sql`
        update public.retail_order_allocations
        set
          status = 'cancelled',
          metadata = metadata || ${input.sql.json({
            releasedByPersonId: context.actorPerson.id,
            releasedUnits: releaseUnits,
            source: input.source
          })},
          updated_at = now()
        where id = ${allocation.allocation_id}::uuid
      `;
    } else {
      await input.sql`
        update public.retail_order_allocations
        set
          quantity_allocated = quantity_allocated - ${releaseUnits},
          metadata = metadata || ${input.sql.json({
            releasedByPersonId: context.actorPerson.id,
            releasedUnits: releaseUnits,
            source: input.source
          })},
          updated_at = now()
        where id = ${allocation.allocation_id}::uuid
      `;
    }

    await input.sql`
      update public.retail_customer_order_lines
      set
        quantity_allocated = greatest(0, quantity_allocated - ${releaseUnits}),
        updated_at = now()
      where id = ${allocation.customer_order_line_id}::uuid
    `;

    affectedOrderIds.add(allocation.customer_order_id);
    excessUnits -= releaseUnits;
    releasedUnits += releaseUnits;
  }

  const orderIds = [...affectedOrderIds];

  if (releasedUnits > 0 && orderIds.length > 0) {
    await input.sql`
      update public.retail_customer_orders
      set status = 'awaiting_stock', updated_at = now()
      where id = any(${orderIds}::uuid[])
        and status in ('placed', 'awaiting_stock', 'allocated', 'picking', 'packed')
    `;

    await recordAdminAudit({
      action: "admin.retail_stock_allocations_released",
      actorPersonId: context.actorPerson.id,
      assumedPersonId: context.assumedPerson?.id ?? null,
      organisationId: stock.organisation_id,
      resourceId: input.stockId,
      resourceType: "retail_product_stock",
      metadata: {
        affectedOrderIds: orderIds,
        productId: stock.product_id,
        releasedUnits,
        source: input.source
      }
    });
  }

  const orderRepair = await repairRetailOrdersAwaitingStockAfterAllocationRelease(
    context,
    {
      orderIds,
      organisationId: stock.organisation_id,
      source: input.source,
      sql: input.sql
    }
  );

  return {
    affectedOrderIds: orderIds,
    releasedUnits,
    repairedOrderCount: orderRepair.repairedOrderCount,
    shortageUnits: orderRepair.shortageUnits
  };
}

async function releaseRetailStockOverAllocationsAfterStockCount(
  context: AdminSessionContext,
  input: Readonly<{
    sql: StockDb;
    stockId: string;
  }>
) {
  return repairRetailStockAllocationIntegrity(context, {
    ...input,
    source: "shopping_list_stock_count_reduced"
  });
}

async function repairCustomerOrderAllocationIntegrity(
  context: AdminSessionContext,
  input: Readonly<{
    customerOrderId: string;
    dueAt?: Date | string | null;
    orderNumber: string;
    organisationId: string;
    source: string;
    sql: StockDb;
  }>
) {
  const stockRows = await input.sql<Array<{ stock_id: string }>>`
    select distinct retail_product_stock_id::text as stock_id
    from public.retail_order_allocations
    where customer_order_id = ${input.customerOrderId}::uuid
      and organisation_id = ${input.organisationId}::uuid
      and status in ('active', 'picked')
  `;
  let releasedUnits = 0;

  for (const row of stockRows) {
    const repair = await repairRetailStockAllocationIntegrity(context, {
      source: input.source,
      sql: input.sql,
      stockId: row.stock_id
    });

    releasedUnits += repair.releasedUnits;
  }

  const pipeline = aggregatePipelineRows(
    await getRetailStockPipeline({
      customerOrderId: input.customerOrderId,
      locale: context.effectivePerson.preferredLocale,
      organisationIds: [input.organisationId],
      sql: input.sql
    }),
    input.customerOrderId
  );

  if (orderPipelineFullyBacked(pipeline)) {
    return { fullyBacked: true, releasedUnits };
  }

  await input.sql`
    update public.retail_customer_orders
    set status = 'awaiting_stock', updated_at = now()
    where id = ${input.customerOrderId}::uuid
      and organisation_id = ${input.organisationId}::uuid
      and status in ('allocated', 'picking', 'packed')
  `;

  const shortageRepair = await ensureRetailOrderShortagesInReorderAdvice(context, {
    customerOrderId: input.customerOrderId,
    orderNumber: input.orderNumber,
    organisationId: input.organisationId,
    sql: input.sql
  });

  await cancelStaleOrderWorkflowTasks(input.sql, context, {
    expectedTaskTypes: ["retail_shopping_list_review"],
    orderId: input.customerOrderId,
    organisationId: input.organisationId,
    reason: "allocation_no_longer_backed_by_stock",
    status: "awaiting_stock"
  });

  await ensureOrderWorkflowTask(input.sql, context, {
    dueAt: input.dueAt ?? null,
    orderId: input.customerOrderId,
    organisationId: input.organisationId,
    taskType: "retail_shopping_list_review"
  });

  await recordAdminAudit({
    action: "admin.retail_order_allocation_integrity_repaired",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: input.organisationId,
    resourceId: input.customerOrderId,
    resourceType: "retail_customer_order",
    metadata: {
      backedAllocatedUnits: pipeline?.backedAllocatedUnits ?? 0,
      customerDemandUnits: pipeline?.customerDemandUnits ?? 0,
      releasedUnits,
      reorderAdviceLineCount: shortageRepair.lineCount,
      reorderAdviceShortageUnits: shortageRepair.shortageUnits,
      source: input.source,
      unorderedNeedUnits: pipeline?.unorderedNeedUnits ?? 0
    }
  });

  await recordRetailOrderBpmEvent(input.sql, context, {
    eventName: "retail_order_allocation_integrity_repaired",
    eventStatus: "awaiting_stock",
    metadata: {
      backedAllocatedUnits: pipeline?.backedAllocatedUnits ?? 0,
      customerDemandUnits: pipeline?.customerDemandUnits ?? 0,
      releasedUnits,
      reorderAdviceLineCount: shortageRepair.lineCount,
      reorderAdviceShortageUnits: shortageRepair.shortageUnits,
      source: input.source,
      unorderedNeedUnits: pipeline?.unorderedNeedUnits ?? 0
    },
    orderId: input.customerOrderId,
    organisationId: input.organisationId
  });

  return { fullyBacked: false, releasedUnits };
}

export async function repairRetailCustomerOrderAllocationIntegrityForSystem(
  input: Readonly<{
    customerOrderId: string;
    organisationId: string;
    source: string;
    sql?: StockDb;
    taskId?: string | null;
  }>
) {
  const sql = input.sql ?? getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const orderRows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
    order_number: string;
  }>>`
    select id::text, order_number, due_at
    from public.retail_customer_orders
    where id = ${input.customerOrderId}::uuid
      and organisation_id = ${input.organisationId}::uuid
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    throw new Error("Customer order not found");
  }

  const context = await retailAgentSessionContext(sql, {
    organisationId: input.organisationId,
    taskId: input.taskId ?? `allocation-integrity:${input.customerOrderId}`
  });

  return repairCustomerOrderAllocationIntegrity(context, {
    customerOrderId: order.id,
    dueAt: order.due_at,
    orderNumber: order.order_number,
    organisationId: input.organisationId,
    source: input.source,
    sql
  });
}

export async function updateRetailShoppingList(
  context: AdminSessionContext,
  input: UpdateRetailShoppingListInput
): Promise<UpdateRetailShoppingListResult> {
  const startedAt = Date.now();
  const timingsMs = {
    allocationRetry: 0,
    lineFetch: 0,
    lineUpdates: 0,
    movementCreation: 0,
    reorderAdviceRefresh: 0,
    total: 0
  };

  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  await ensureRetailShoppingListTablesAvailable(sql);

  const listRows = await sql<Array<{
    currency: string;
    id: string;
    organisation_id: string;
    status: string;
  }>>`
    select id::text, organisation_id::text, status, currency
    from public.retail_shopping_lists
    where id = ${input.shoppingListId.trim()}::uuid
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const list = listRows[0];

  if (!list) {
    throw new Error("Shopping list not found");
  }

  if (shoppingListStatus(list.status) === "closed") {
    throw new Error("Closed shopping lists cannot be edited");
  }

  let movementCount = 0;
  let movementDeltaUnits = 0;
  let releasedAllocationUnits = 0;
  let refreshedReorderAdviceCount = 0;
  const savedStatus: RetailShoppingListStatus = "closed";
  const affectedProductIds = new Set<string>();
  const affectedStockIds = new Set<string>();
  const affectedOrderIds = new Set<string>();
  const lineIds = [
    ...new Set(
      input.lines
        .map((line) => line.id?.trim() ?? "")
        .filter((lineId) => lineId)
    )
  ];
  const inputLineById = new Map(
    input.lines
      .filter((line): line is RetailShoppingListLineInput & { id: string } =>
        Boolean(line.id?.trim())
      )
      .map((line) => [line.id.trim(), line])
  );
  const lineFetchStartedAt = Date.now();
  const existingRows = lineIds.length > 0
    ? await sql<Array<{
        actual_quantity: number | string;
        assigned_quantity: number | string;
        current_stock_quantity: number | string;
        id: string;
        product_id: string;
        required_quantity: number | string;
        retail_price_amount: number | string | null;
        stocked_quantity: number | string;
        unordered_need_quantity: number | string;
        wholesale_price_amount: number | string | null;
      }>>`
        select
          id::text,
          product_id::text,
          required_quantity,
          current_stock_quantity,
          unordered_need_quantity,
          assigned_quantity,
          actual_quantity,
          stocked_quantity,
          wholesale_price_amount,
          retail_price_amount
        from public.retail_shopping_list_lines
        where id = any(${lineIds}::uuid[])
          and shopping_list_id = ${list.id}::uuid
          and organisation_id = ${list.organisation_id}::uuid
      `
    : [];
  timingsMs.lineFetch = Date.now() - lineFetchStartedAt;

  for (const existing of existingRows) {
    const line = inputLineById.get(existing.id);

    if (!line) {
      continue;
    }

    const requiredQuantity = integerOrDefault(
      line.requiredQuantity,
      integerOrDefault(existing.required_quantity, 0)
    );
    const unorderedNeedQuantity = integerOrDefault(
      line.unorderedNeedQuantity,
      integerOrDefault(existing.unordered_need_quantity, 0)
    );
    const assignedQuantity = Math.max(
      0,
      integerOrDefault(
        line.assignedQuantity,
        integerOrDefault(existing.assigned_quantity, 0)
      )
    );
    const actualQuantity = Math.max(
      0,
      integerOrDefault(
        line.actualQuantity,
        integerOrDefault(existing.actual_quantity, 0)
      )
    );
    const stockedQuantity = integerOrDefault(existing.stocked_quantity, 0);
    const delta = actualQuantity - stockedQuantity;
    const wholesalePriceAmount = numberOrNull(line.wholesalePriceAmount);
    const retailPriceAmount = numberOrNull(line.retailPriceAmount);

    if (delta !== 0) {
      const movementStartedAt = Date.now();
      const stockId = await ensureRetailStockRow(context, {
        organisationId: list.organisation_id,
        productId: existing.product_id,
        wholesalePriceAmount
      });
      affectedProductIds.add(existing.product_id);
      affectedStockIds.add(stockId);

      await recordRetailStockMovement(context, {
        deferAllocationIntegrityRepair: true,
        deferReorderSideEffects: true,
        movementType: delta > 0 ? "receive" : "adjustment",
        notes: null,
        quantity: delta,
        reason:
          delta > 0
            ? "Shopping list stock count saved"
            : "Shopping list stock count reduced",
        stockId,
        unitCostAmount: wholesalePriceAmount
      });
      movementCount += 1;
      movementDeltaUnits += delta;

      if (delta < 0) {
        const release = await releaseRetailStockOverAllocationsAfterStockCount(
          context,
          { sql, stockId }
        );
        releasedAllocationUnits += release.releasedUnits;
        for (const orderId of release.affectedOrderIds) {
          affectedOrderIds.add(orderId);
        }
      }
      timingsMs.movementCreation += Date.now() - movementStartedAt;
    }

    const lineUpdateStartedAt = Date.now();
    await sql`
      update public.retail_shopping_list_lines
      set
        required_quantity = ${requiredQuantity},
        current_stock_quantity = ${integerOrDefault(
          line.currentStockQuantity,
          integerOrDefault(existing.current_stock_quantity, 0)
        )},
        unordered_need_quantity = ${unorderedNeedQuantity},
        assigned_quantity = ${assignedQuantity},
        actual_quantity = ${actualQuantity},
        stocked_quantity = ${actualQuantity},
        wholesale_price_amount = ${wholesalePriceAmount},
        retail_price_amount = ${retailPriceAmount},
        updated_at = now()
      where id = ${existing.id}::uuid
        and shopping_list_id = ${list.id}::uuid
        and organisation_id = ${list.organisation_id}::uuid
    `;

    if (wholesalePriceAmount !== null || retailPriceAmount !== null) {
      await sql`
        insert into public.retail_sellable_products (
          organisation_id,
          product_id,
          status,
          rrp_price_amount,
          wholesale_price_amount,
          currency,
          lead_time_days,
          backorder_policy,
          notes,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${list.organisation_id}::uuid,
          ${existing.product_id}::uuid,
          'active',
          ${retailPriceAmount},
          ${wholesalePriceAmount},
          ${list.currency},
          0,
          'allow',
          null,
          ${sql.json({
            shoppingListId: list.id,
            shoppingListLineId: existing.id,
            updatedByPersonId: context.actorPerson.id,
            updatedVia: "shopping_list_stock_counts"
          })},
          now(),
          now()
        )
        on conflict (organisation_id, product_id)
        do update set
          rrp_price_amount = coalesce(excluded.rrp_price_amount, retail_sellable_products.rrp_price_amount),
          wholesale_price_amount = coalesce(excluded.wholesale_price_amount, retail_sellable_products.wholesale_price_amount),
          metadata = retail_sellable_products.metadata || excluded.metadata,
          updated_at = now()
      `;
    }
    timingsMs.lineUpdates += Date.now() - lineUpdateStartedAt;
  }

  const listUpdateStartedAt = Date.now();
  await sql`
    update public.retail_shopping_lists
    set
      status = ${savedStatus},
      updated_at = now()
    where id = ${list.id}::uuid
  `;
  timingsMs.lineUpdates += Date.now() - listUpdateStartedAt;

  const changedProductIds = [...affectedProductIds];
  const allocationStartedAt = Date.now();
  const awaitingOrderRows = changedProductIds.length > 0
    ? await sql<Array<{ id: string }>>`
        select retail_customer_orders.id::text
        from public.retail_customer_orders
        join public.retail_customer_order_lines
          on retail_customer_order_lines.customer_order_id = retail_customer_orders.id
        where retail_customer_orders.organisation_id = ${list.organisation_id}::uuid
          and retail_customer_orders.status in ('placed', 'awaiting_stock')
          and retail_customer_order_lines.product_id = any(${changedProductIds}::uuid[])
        group by
          retail_customer_orders.id,
          retail_customer_orders.due_at,
          retail_customer_orders.placed_at,
          retail_customer_orders.created_at
        order by
          coalesce(
            retail_customer_orders.due_at,
            retail_customer_orders.placed_at,
            retail_customer_orders.created_at
          ),
          retail_customer_orders.created_at
        limit 50
      `
    : [];

  for (const order of awaitingOrderRows) {
    try {
      await allocateRetailCustomerOrder(context, {
        customerOrderId: order.id
      });
      affectedOrderIds.add(order.id);
    } catch {
      // Leave still-short orders in reorder advice; the order workbench will
      // show the remaining gap.
    }
  }
  timingsMs.allocationRetry = Date.now() - allocationStartedAt;

  if (changedProductIds.length > 0) {
    const adviceStartedAt = Date.now();
    const adviceRefresh = await refreshRetailStockReorderAdvice({
      organisationId: list.organisation_id,
      productIds: changedProductIds
    });
    refreshedReorderAdviceCount = adviceRefresh.refreshed;

    const stockIds = [...affectedStockIds];

    if (stockIds.length > 0) {
      const stockRows = await sql<RetailStockSnapshotRow[]>`
        select
          id::text,
          organisation_id::text,
          product_id::text,
          status,
          stock_quantity,
          lead_time_days,
          wholesale_price_amount,
          retail_price_amount,
          currency,
          notes
        from public.retail_product_stock
        where id = any(${stockIds}::uuid[])
          and organisation_id = ${list.organisation_id}::uuid
          and status <> 'deleted'
      `;

      for (const row of stockRows) {
        await queueRetailStockIntelligenceRefresh(
          row,
          "shopping_list_stock_counts_saved"
        );
      }
    }
    timingsMs.reorderAdviceRefresh = Date.now() - adviceStartedAt;
  }

  timingsMs.total = Date.now() - startedAt;

  await recordAdminAudit({
    action: "admin.retail_shopping_list_updated",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: list.organisation_id,
    resourceId: list.id,
    resourceType: "retail_shopping_list",
    metadata: {
      lineCount: input.lines.length,
      movementCount,
      movementDeltaUnits,
      refreshedReorderAdviceCount,
      releasedAllocationUnits,
      affectedOrderIds: [...affectedOrderIds],
      affectedProductIds: changedProductIds,
      requestedStatus: input.status ? shoppingListStatus(input.status) : null,
      status: savedStatus,
      timingsMs
    }
  });

  return {
    affectedOrderIds: [...affectedOrderIds],
    affectedProductIds: changedProductIds,
    movementCount,
    movementDeltaUnits,
    refreshPending: true,
    refreshedReorderAdviceCount,
    reorderAdviceUpdated: refreshedReorderAdviceCount > 0,
    shoppingListId: list.id,
    status: savedStatus,
    timingsMs
  };
}

export async function createRetailCustomerOrder(
  context: AdminSessionContext,
  input: CreateRetailCustomerOrderInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const requestedLines = input.lines.filter((line) => line.productId.trim());
  let routingSnapshot: RegionalBasketAvailability | null = null;
  let routedOrganisationId =
    input.selectedRetailerOrganisationId ?? input.organisationId;
  let lines = requestedLines;

  if (input.shippingCountry) {
    routingSnapshot = await resolveRegionalBasketAvailability({
      lines: requestedLines.map((line) => ({
        productId: line.productId,
        quantity: line.quantityOrdered
      })),
      preference: normalizeRetailRoutingPreference(input.routingPreference),
      shippingCountry: input.shippingCountry,
      sql
    });

    if (!routingSnapshot.selectedRetailer || !routingSnapshot.canCheckout) {
      throw new Error("No single local retailer can fulfill the full basket");
    }

    if (
      input.selectedRetailerOrganisationId &&
      input.selectedRetailerOrganisationId !==
        routingSnapshot.selectedRetailer.organisationId
    ) {
      throw new Error("Selected retailer does not match regional routing");
    }

    routedOrganisationId = routingSnapshot.selectedRetailer.organisationId;
    lines = requestedLines;
  }

  const organisation = await organisationForStockWrite(
    sql,
    context,
    routedOrganisationId,
    { allowPlatformActorAll: Boolean(input.shippingCountry) }
  );

  if (lines.length < 1) {
    throw new Error("At least one payable customer order line is required");
  }

  for (const line of lines) {
    if (!(await productApproved(sql, line.productId.trim()))) {
      throw new Error("Only approved master products can be sold");
    }

    if (integerOrDefault(line.quantityOrdered, 0) < 1) {
      throw new Error("Customer order quantity is required");
    }
  }

  const preparedLines: RetailCustomerOrderLineAvailability[] = [];

  for (const line of lines) {
    const productId = line.productId.trim();
    const quantityOrdered = integerOrDefault(line.quantityOrdered, 1);
    const availability = await getRetailCartLineAvailability({
      organisationId: organisation.id,
      productId,
      quantity: quantityOrdered,
      sql
    });

    if (!availability.canCheckout) {
      throw new Error(availability.reason);
    }

    const priceAmount = availability.unitPriceAmount;

    if (priceAmount === null) {
      throw new Error("Master List country RRP is required before checkout");
    }

    preparedLines.push({
      availabilityStatus: availability.availabilityStatus,
      backorderQuantity: availability.backorderQuantity,
      currency: availability.currency,
      etaDate: availability.etaDate,
      line,
      priceAmount,
      quantityAvailableNow: availability.quantityAvailableNow,
      reason: availability.reason,
      retailSellableProductId: availability.retailSellableProductId
    });
  }

  const orderNumberValue = input.orderNumber?.trim() || orderNumber("SO");
  const orderSource = input.source === "checkout" ? "checkout" : "manual";
  const hasBackorder = preparedLines.some(
    (line) => line.availabilityStatus === "backorder"
  );
  const initialStatus: RetailCustomerOrderStatus = hasBackorder
    ? "awaiting_stock"
    : "placed";
  const orderCurrency =
    preparedLines.find((line) => line.currency)?.currency ?? organisation.currency;
  const subtotalAmount = preparedLines.reduce(
    (total, preparedLine) =>
      total +
      preparedLine.priceAmount *
        integerOrDefault(preparedLine.line.quantityOrdered, 1),
    0
  );
  const taxAmount = 0;
  const shippingAmount = 0;
  const totalAmount = subtotalAmount + taxAmount + shippingAmount;
  const fx = await resolveUsdRateForCurrency(orderCurrency, { sql });
  const latestEtaDate = preparedLines
    .map((line) => line.etaDate)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const orderRows = await sql<Array<{ id: string }>>`
    insert into public.retail_customer_orders (
      organisation_id,
      order_number,
      source,
      customer_name,
      customer_email,
      status,
      currency,
      due_at,
      placed_at,
      notes,
      created_by_person_id,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${organisation.id}::uuid,
      ${orderNumberValue},
      ${orderSource},
      ${input.customerName?.trim() || null},
      ${input.customerEmail?.trim() || null},
      ${initialStatus},
      ${orderCurrency},
      ${input.dueAt ? new Date(input.dueAt) : null},
      now(),
      ${input.notes?.trim() || null},
      ${context.actorPerson.id}::uuid,
      ${sql.json({
        assumedPersonId: context.assumedPerson?.id ?? null,
        fulfillmentPromise: {
          backorderLineCount: preparedLines.filter(
            (line) => line.availabilityStatus === "backorder"
          ).length,
          etaDate: latestEtaDate,
          mode: hasBackorder ? "backorder" : "stock"
        },
        pricingSnapshot: {
          currency: orderCurrency,
          fxFallbackUsed: fx.fallbackUsed,
          fxProvider: fx.provider,
          fxRateId: fx.fxRateId,
          fxSource: fx.source,
          shippingAmount,
          subtotalAmount,
          taxAmount,
          totalAmount,
          usdRate: fx.usdRate
        },
        regionalRouting: routingSnapshot
          ? {
              etaDate: routingSnapshot.etaDate,
              payableLineCount: routingSnapshot.payableLines.length,
              preference: routingSnapshot.preference,
              selectedRetailerOrganisationId:
                routingSnapshot.selectedRetailer?.organisationId ?? null,
              selectedRetailerName:
                routingSnapshot.selectedRetailer?.organisationName ?? null,
              shippingCountry: routingSnapshot.shippingCountry,
              subtotalAmount: routingSnapshot.subtotalAmount,
              unavailableLines: routingSnapshot.unavailableLines.map((line) => ({
                productId: line.productId,
                quantityRequested: line.quantityRequested,
                reason: line.reason
              }))
            }
          : null,
        source:
          orderSource === "checkout"
            ? "regional_checkout"
            : "admin_retail_operations"
      })},
      now(),
      now()
    )
    returning id::text
  `;
  const orderId = orderRows[0]?.id;

  if (!orderId) {
    throw new Error("Customer order could not be created");
  }

  for (const preparedLine of preparedLines) {
    const line = preparedLine.line;

    await sql`
      insert into public.retail_customer_order_lines (
        customer_order_id,
        organisation_id,
        product_id,
        quantity_ordered,
        retail_price_amount,
        notes,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${orderId}::uuid,
        ${organisation.id}::uuid,
        ${line.productId.trim()}::uuid,
        ${integerOrDefault(line.quantityOrdered, 1)},
        ${preparedLine.priceAmount},
        ${line.notes?.trim() || null},
        ${sql.json({
          availabilityStatus: preparedLine.availabilityStatus,
          backorderQuantity: preparedLine.backorderQuantity,
          currency: orderCurrency,
          etaDate: preparedLine.etaDate,
          fxRateId: fx.fxRateId,
          lineSubtotalAmount:
            preparedLine.priceAmount *
            integerOrDefault(line.quantityOrdered, 1),
          priceSource: "master_list_country_rrp_margin",
          quantityAvailableNow: preparedLine.quantityAvailableNow,
          reason: preparedLine.reason,
          retailSellableProductId: preparedLine.retailSellableProductId,
          shippingAmount: 0,
          source:
            orderSource === "checkout"
              ? "regional_checkout"
              : "admin_retail_operations",
          taxAmount: 0,
          usdRate: fx.usdRate
        })},
        now(),
        now()
      )
    `;
  }
  const orderPipelineRows = await getRetailStockPipeline({
    customerOrderId: orderId,
    locale: context.effectivePerson.preferredLocale,
    organisationIds: [organisation.id],
    sql
  });
  const orderPipelineByProductId = new Map(
    orderPipelineRows.map((row) => [row.productId, row])
  );

  await recordAdminAudit({
    action: "admin.retail_customer_order_created",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: organisation.id,
    resourceId: orderId,
    resourceType: "retail_customer_order",
    metadata: {
      backorderLineCount: preparedLines.filter(
        (line) => line.availabilityStatus === "backorder"
      ).length,
      lineCount: preparedLines.length,
      regionalRouting: routingSnapshot
        ? {
            etaDate: routingSnapshot.etaDate,
            payableLineCount: routingSnapshot.payableLines.length,
            preference: routingSnapshot.preference,
            selectedRetailerOrganisationId:
              routingSnapshot.selectedRetailer?.organisationId ?? null,
            shippingCountry: routingSnapshot.shippingCountry,
            unavailableLineCount: routingSnapshot.unavailableLines.length
          }
        : null,
      status: initialStatus,
      orderNumber: orderNumberValue
    }
  });

  await recordRetailOrderBpmEvent(sql, context, {
    eventName:
      orderSource === "checkout"
        ? "retail_checkout_order_created"
        : "retail_manual_order_created",
    eventStatus: initialStatus,
    metadata: {
      backorderLineCount: preparedLines.filter(
        (line) => line.availabilityStatus === "backorder"
      ).length,
      lineCount: preparedLines.length,
      orderNumber: orderNumberValue,
      routingPreference: routingSnapshot?.preference ?? null,
      selectedRetailerOrganisationId: organisation.id,
      shippingCountry: routingSnapshot?.shippingCountry ?? null,
      subtotalAmount,
      unavailableLineCount: routingSnapshot?.unavailableLines.length ?? 0
    },
    orderId,
    organisationId: organisation.id
  });

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: retailOrderStatusBpmEventName(initialStatus),
    eventStatus: initialStatus,
    metadata: {
      backorderLineCount: preparedLines.filter(
        (line) => line.availabilityStatus === "backorder"
      ).length,
      lineCount: preparedLines.length,
      orderNumber: orderNumberValue,
      source: orderSource
    },
    orderId,
    organisationId: organisation.id
  });

  try {
    await queueAdminOrganisationCommunication({
      eventKey: "retail_order_created",
      metadata: {
        orderNumber: orderNumberValue,
        source: orderSource
      },
      organisationId: organisation.id,
      resourceId: orderId,
      resourceType: "retail_customer_order"
    });

    if (initialStatus === "awaiting_stock") {
      await queueAdminOrganisationCommunication({
        eventKey: "retail_order_awaiting_stock",
        metadata: {
          orderNumber: orderNumberValue,
          source: orderSource
        },
        organisationId: organisation.id,
        resourceId: orderId,
        resourceType: "retail_customer_order"
      });
    }
  } catch (error) {
    console.warn("Unable to queue retail organisation order notification", error);
  }

  await sendRetailOrderWorkflowEmail({
    event: "confirmed",
    locale: context.effectivePerson.preferredLocale,
    orderId,
    sql
  });

  if (initialStatus === "awaiting_stock") {
    await sendRetailOrderWorkflowEmail({
      event: "awaiting_stock",
      locale: context.effectivePerson.preferredLocale,
      orderId,
      sql
    });
  }

  await queueRetailOperationTask({
    commandId: "allocate_customer_order",
    description: hasBackorder
      ? "Allocate available stock and keep the remaining quantity in reorder advice."
      : "Allocate stock to this customer order.",
    dueAt: input.dueAt ?? null,
    idempotencyKey: `${orderId}:allocate`,
    organisationId: organisation.id,
    priorityReason: hasBackorder
      ? "Customer order includes backordered lines."
      : "Customer order is placed and needs stock allocation.",
    priorityScore: hasBackorder ? 780 : input.dueAt ? 620 : 520,
    sourceEntityId: orderId,
    sourceEntityType: "retail_customer_order",
    taskType: "retail_customer_order_allocate",
    title: "Allocate customer order"
  });

  for (const preparedLine of preparedLines) {
    if (preparedLine.availabilityStatus !== "backorder") {
      continue;
    }

    const productId = preparedLine.line.productId.trim();
    const pipeline = orderPipelineByProductId.get(productId) ?? null;
    const unorderedNeedUnits =
      pipeline?.unorderedNeedUnits ?? preparedLine.backorderQuantity ?? 0;
    const productName = pipeline?.productTitle ?? productId;

    if (unorderedNeedUnits < 1) {
      continue;
    }

    await queueRetailOperationTask({
      commandId: "sync_order_shortages_to_reorder_advice",
      description:
        "Review reorder advice for this retailer and create a shopping list when ready to buy.",
      dueAt: preparedLine.etaDate,
      idempotencyKey: `${orderId}:${productId}:backorder-reorder-review`,
      organisationId: organisation.id,
      payload: {
        backorderQuantity: preparedLine.backorderQuantity,
        customerOrderId: orderId,
        orderNumber: orderNumberValue,
        productId,
        productName,
        quantityAvailableNow:
          pipeline?.availableNowUnits ?? preparedLine.quantityAvailableNow,
        unorderedNeedUnits
      },
      priorityReason:
        `${productName} for ${orderNumberValue}: demand ${
          pipeline?.customerDemandUnits ??
          integerOrDefault(preparedLine.line.quantityOrdered, 1)
        }, allocated ${pipeline?.allocatedUnits ?? 0}, available ${
          pipeline?.availableNowUnits ?? preparedLine.quantityAvailableNow
        }, unordered ${unorderedNeedUnits}.`,
      priorityScore: 860,
      profitImpactAmount:
        preparedLine.priceAmount * integerOrDefault(preparedLine.line.quantityOrdered, 1),
      profitImpactCurrency: organisation.currency,
      sourceEntityId: orderId,
      sourceEntityType: "retail_customer_order",
      taskType: "retail_shopping_list_review",
      title: `Order ${Math.max(1, unorderedNeedUnits)} units for ${orderNumberValue}`
    });

  }

  await ensureRetailOrderShortagesInReorderAdvice(context, {
    customerOrderId: orderId,
    orderNumber: orderNumberValue,
    organisationId: organisation.id,
    sql
  });

  return orderId;
}

async function queueCustomerOrderStockGapTasks(
  sql: StockDb,
  input: Readonly<{
    gaps: readonly Readonly<{
      productId: string;
      remaining: number;
    }>[];
    locale: Locale;
    order: Readonly<{
      id: string;
      organisation_id: string;
      order_number: string;
    }>;
  }>
) {
  if (input.gaps.length === 0) {
    return;
  }

  const gapPipelineRows = await getRetailStockPipeline({
    customerOrderId: input.order.id,
    locale: input.locale,
    organisationIds: [input.order.organisation_id],
    sql
  });
  const gapPipelineByProductId = new Map(
    gapPipelineRows.map((row) => [row.productId, row])
  );

  for (const gap of input.gaps) {
    const pipeline = gapPipelineByProductId.get(gap.productId) ?? null;
    const unorderedNeedUnits = pipeline?.unorderedNeedUnits ?? gap.remaining;
    const productName = pipeline?.productTitle ?? gap.productId;

    if (unorderedNeedUnits < 1) {
      continue;
    }

    await queueRetailOperationTask({
      commandId: "sync_order_shortages_to_reorder_advice",
      description:
        "Review reorder advice, then create a shopping list when ready to buy.",
      idempotencyKey: `${input.order.id}:${gap.productId}:awaiting-stock`,
      organisationId: input.order.organisation_id,
      payload: {
        customerOrderId: input.order.id,
        orderNumber: input.order.order_number,
        productId: gap.productId,
        productName,
        quantityAvailableNow: pipeline?.availableNowUnits ?? 0,
        unorderedNeedUnits
      },
      priorityReason:
        `${productName} for ${input.order.order_number}: demand ${
          pipeline?.customerDemandUnits ?? gap.remaining
        }, allocated ${pipeline?.allocatedUnits ?? 0}, available ${
          pipeline?.availableNowUnits ?? 0
        }, unordered ${unorderedNeedUnits}.`,
      priorityScore: 780,
      sourceEntityId: input.order.id,
      sourceEntityType: "retail_customer_order",
      taskType: "retail_shopping_list_review",
      title: `Order ${unorderedNeedUnits} units for ${input.order.order_number}`
    });
  }
}

export async function allocateRetailCustomerOrder(
  context: AdminSessionContext,
  input: Readonly<{ customerOrderId: string }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const orderRows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
    organisation_id: string;
    order_number: string;
  }>>`
    select id::text, organisation_id::text, order_number, due_at
    from public.retail_customer_orders
    where id = ${input.customerOrderId.trim()}::uuid
      and status in ('placed', 'awaiting_stock', 'allocated')
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    throw new Error("Customer order cannot be allocated");
  }

  const lineRows = await sql<Array<{
    id: string;
    product_id: string;
    quantity_allocated: number | string;
    quantity_ordered: number | string;
  }>>`
    select id::text, product_id::text, quantity_ordered, quantity_allocated
    from public.retail_customer_order_lines
    where customer_order_id = ${order.id}::uuid
    order by created_at asc
  `;
  let fullyAllocated = true;
  let hadRemaining = false;
  const allocationPlans: Array<{
    lineId: string;
    productId: string;
    quantity: number;
    stockId: string;
  }> = [];
  const gapPlans: Array<{
    productId: string;
    remaining: number;
  }> = [];

  for (const line of lineRows) {
    const remaining =
      integerOrDefault(line.quantity_ordered, 0) -
      integerOrDefault(line.quantity_allocated, 0);

    if (remaining < 1) {
      continue;
    }

    hadRemaining = true;

    const stockRows = await sql<Array<{
      available_quantity: number | string;
      id: string;
    }>>`
      select
        retail_product_stock.id::text,
        (
          retail_product_stock.stock_quantity
          - coalesce(active_allocations.quantity_allocated, 0)
        )::int as available_quantity
      from public.retail_product_stock
      left join lateral (
        select sum(retail_order_allocations.quantity_allocated)::int as quantity_allocated
        from public.retail_order_allocations
        where retail_order_allocations.retail_product_stock_id = retail_product_stock.id
          and retail_order_allocations.status in ('active', 'picked')
      ) active_allocations on true
      where retail_product_stock.organisation_id = ${order.organisation_id}::uuid
        and retail_product_stock.product_id = ${line.product_id}::uuid
        and retail_product_stock.status = 'active'
        and retail_product_stock.stock_quantity > 0
      order by retail_product_stock.updated_at asc
      limit 1
    `;
    const stock = stockRows[0];
    const available = integerOrDefault(stock?.available_quantity, 0);
    const allocationQuantity = stock ? Math.min(remaining, available) : 0;

    if (allocationQuantity < remaining) {
      fullyAllocated = false;
      gapPlans.push({
        productId: line.product_id,
        remaining: remaining - allocationQuantity
      });
    }

    if (!stock || allocationQuantity < 1) {
      continue;
    }

    allocationPlans.push({
      lineId: line.id,
      productId: line.product_id,
      quantity: allocationQuantity,
      stockId: stock.id
    });
  }

  if (hadRemaining && allocationPlans.length === 0) {
    await queueCustomerOrderStockGapTasks(sql, {
      gaps: gapPlans,
      locale: context.effectivePerson.preferredLocale,
      order
    });
    await ensureRetailOrderShortagesInReorderAdvice(context, {
      customerOrderId: order.id,
      orderNumber: order.order_number,
        organisationId: order.organisation_id,
        sql
      });
    await sql`
      update public.retail_customer_orders
      set status = 'awaiting_stock', updated_at = now()
      where id = ${order.id}::uuid
    `;
    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_order_awaiting_stock",
      eventStatus: "awaiting_stock",
      metadata: {
        gapUnits: gapPlans.reduce((total, gap) => total + gap.remaining, 0),
        reason: "no_live_stock"
      },
      orderId: order.id,
      organisationId: order.organisation_id
    });
    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_order_allocation_blocked",
      eventStatus: "no_live_stock",
      metadata: {
        gapUnits: gapPlans.reduce((total, gap) => total + gap.remaining, 0),
        reason: "no_live_stock"
      },
      orderId: order.id,
      organisationId: order.organisation_id
    });
    try {
      await queueAdminOrganisationCommunication({
        eventKey: "retail_order_awaiting_stock",
        metadata: {
          gapUnits: gapPlans.reduce((total, gap) => total + gap.remaining, 0),
          reason: "no_live_stock",
          source: "retail_order_allocation"
        },
        organisationId: order.organisation_id,
        resourceId: order.id,
        resourceType: "retail_customer_order"
      });
    } catch (error) {
      console.warn("Unable to queue retail organisation stock notification", error);
    }
    await sendRetailOrderWorkflowEmail({
      event: "awaiting_stock",
      locale: context.effectivePerson.preferredLocale,
      orderId: order.id,
      sql
    });

    throw new Error(
      "No live stock is available to allocate. Review reorder advice."
    );
  }

  await ensureOrderWorkflowTask(sql, context, {
    dueAt: order.due_at,
    orderId: order.id,
    organisationId: order.organisation_id,
    taskType: "retail_customer_order_allocate"
  });

  for (const allocation of allocationPlans) {
    await sql`
      insert into public.retail_order_allocations (
        customer_order_id,
        customer_order_line_id,
        retail_product_stock_id,
        organisation_id,
        product_id,
        quantity_allocated,
        status,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${order.id}::uuid,
        ${allocation.lineId}::uuid,
        ${allocation.stockId}::uuid,
        ${order.organisation_id}::uuid,
        ${allocation.productId}::uuid,
        ${allocation.quantity},
        'active',
        ${sql.json({
          allocatedByPersonId: context.actorPerson.id,
          source: "admin_retail_operations"
        })},
        now(),
        now()
      )
    `;

    await sql`
      update public.retail_customer_order_lines
      set
        quantity_allocated = quantity_allocated + ${allocation.quantity},
        updated_at = now()
      where id = ${allocation.lineId}::uuid
    `;
  }

  await queueCustomerOrderStockGapTasks(sql, {
    gaps: gapPlans,
    locale: context.effectivePerson.preferredLocale,
    order
  });
  const reorderAdviceShortageRepair = fullyAllocated
    ? null
    : await ensureRetailOrderShortagesInReorderAdvice(context, {
        customerOrderId: order.id,
        orderNumber: order.order_number,
        organisationId: order.organisation_id,
        sql
      });
  const nextStatus: RetailCustomerOrderStatus = fullyAllocated
    ? "allocated"
    : "awaiting_stock";

  await sql`
    update public.retail_customer_orders
    set status = ${nextStatus}, updated_at = now()
    where id = ${order.id}::uuid
  `;

  await recordAdminAudit({
    action: "admin.retail_customer_order_allocated",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: order.organisation_id,
    resourceId: order.id,
    resourceType: "retail_customer_order",
    metadata: {
      allocatedUnits: allocationPlans.reduce(
        (total, allocation) => total + allocation.quantity,
        0
      ),
      gapUnits: gapPlans.reduce((total, gap) => total + gap.remaining, 0),
      reorderAdviceLineCount: reorderAdviceShortageRepair?.lineCount ?? 0,
      reorderAdviceShortageUnits:
        reorderAdviceShortageRepair?.shortageUnits ?? 0,
      status: nextStatus
    }
  });

  if (fullyAllocated) {
    await completeOrderWorkflowTask(sql, context, {
      action: "allocate",
      orderId: order.id,
      organisationId: order.organisation_id,
      taskTypes: ["retail_customer_order_allocate"]
    });
  } else {
    const allocationTaskRows = await sql<Array<{ id: string }>>`
      select id::text
      from public.tasks
      where organisation_id = ${order.organisation_id}::uuid
        and source_entity_type = 'retail_customer_order'
        and source_entity_id = ${order.id}::uuid
        and task_type = 'retail_customer_order_allocate'
        and status not in ('completed', 'cancelled', 'skipped')
      order by updated_at asc
      limit 1
    `;
    const allocationTaskId = allocationTaskRows[0]?.id ?? null;

    await sql`
      update public.tasks
      set
        status = 'queued',
        reserved_by_agent_id = null,
        lease_until = null,
        context = coalesce(context, '{}'::jsonb)
          - 'claimedByPersonId'
          - 'claimedByDisplayName'
          - 'claimedByEmail',
        updated_at = now()
      where organisation_id = ${order.organisation_id}::uuid
        and source_entity_type = 'retail_customer_order'
        and source_entity_id = ${order.id}::uuid
        and task_type = 'retail_customer_order_allocate'
        and status not in ('completed', 'cancelled', 'skipped')
    `;

    if (allocationTaskId) {
      await addTaskEvent({
        eventPayload: {
          actorPersonId: context.actorPerson.id,
          allocatedUnits: allocationPlans.reduce(
            (total, allocation) => total + allocation.quantity,
            0
          ),
          gapUnits: gapPlans.reduce((total, gap) => total + gap.remaining, 0),
          source: "retail_order_workflow"
        },
        eventStatus: "succeeded",
        eventType: "retail_order_partial_allocation_requeued",
        severity: "medium",
        taskId: allocationTaskId
      });
    }
  }

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: retailOrderStatusBpmEventName(nextStatus),
    eventStatus: nextStatus,
    metadata: {
      fullyAllocated,
      status: nextStatus
    },
    orderId: order.id,
    organisationId: order.organisation_id
  });

  if (!fullyAllocated) {
    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_order_allocation_blocked",
      eventStatus: nextStatus,
      metadata: {
        fullyAllocated,
        status: nextStatus
      },
      orderId: order.id,
      organisationId: order.organisation_id
    });
    try {
      await queueAdminOrganisationCommunication({
        eventKey: "retail_order_awaiting_stock",
        metadata: {
          source: "retail_order_allocation",
          status: nextStatus
        },
        organisationId: order.organisation_id,
        resourceId: order.id,
        resourceType: "retail_customer_order"
      });
    } catch (error) {
      console.warn("Unable to queue retail organisation stock notification", error);
    }
    await sendRetailOrderWorkflowEmail({
      event: "awaiting_stock",
      locale: context.effectivePerson.preferredLocale,
      orderId: order.id,
      sql
    });
  }

  if (fullyAllocated) {
    try {
      await queueAdminOrganisationCommunication({
        eventKey: "retail_order_ready_to_pack",
        metadata: {
          source: "retail_order_allocation"
        },
        organisationId: order.organisation_id,
        resourceId: order.id,
        resourceType: "retail_customer_order"
      });
    } catch (error) {
      console.warn("Unable to queue retail organisation ready-to-pack notification", error);
    }

    await queueRetailOperationTask({
      commandId: "advance_customer_order",
      description: "Pack the allocated order before booking courier pickup.",
      dueAt: order.due_at,
      idempotencyKey: `${order.id}:pack`,
      organisationId: order.organisation_id,
      priorityReason: "Order has allocated stock and is ready to pack.",
      priorityScore: 720,
      sourceEntityId: order.id,
      sourceEntityType: "retail_customer_order",
      taskType: "retail_order_pack",
      title: "Pack customer order"
    });
  }

  return order.id;
}

export async function advanceRetailCustomerOrder(
  context: AdminSessionContext,
  input: Readonly<{
    action:
      | "cancel"
      | "mark_delivered"
      | "mark_packed"
      | "mark_picking"
      | "mark_shipped"
      | "return";
    carrierName?: string | null;
    customerOrderId: string;
    shipmentNotes?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
  }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const orderRows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
    metadata: unknown;
    organisation_id: string;
    order_number: string;
    status: string;
  }>>`
    select id::text, organisation_id::text, order_number, status, due_at, metadata
    from public.retail_customer_orders
    where id = ${input.customerOrderId.trim()}::uuid
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    throw new Error("Customer order not found");
  }

  const transition = transitionRetailCustomerOrder(input.action);
  const nextStatus = transition.nextStatus as RetailCustomerOrderStatus;
  const requiredTaskTypes = [...transition.requiredTaskTypes];
  const actionTaskType = workflowTaskTypeForAction(input.action);
  const existingShipmentMetadata = objectRecord(
    objectRecord(order.metadata).shipment
  );
  const shipmentMetadata =
    input.action === "mark_shipped"
      ? {
          ...existingShipmentMetadata,
          carrierName:
            input.carrierName?.trim() ||
            stringMetadata(existingShipmentMetadata.carrierName) ||
            null,
          shippedAt: new Date().toISOString(),
          shippedByPersonId: context.actorPerson.id,
          shipmentNotes:
            input.shipmentNotes?.trim() ||
            stringMetadata(existingShipmentMetadata.shipmentNotes) ||
            null,
          trackingNumber:
            input.trackingNumber?.trim() ||
            stringMetadata(existingShipmentMetadata.trackingNumber) ||
            null,
          trackingUrl:
            input.trackingUrl?.trim() ||
            stringMetadata(existingShipmentMetadata.trackingUrl) ||
            null
        }
      : null;

  if (actionTaskType) {
    await ensureOrderWorkflowTask(sql, context, {
      dueAt: order.due_at,
      orderId: order.id,
      organisationId: order.organisation_id,
      taskType: actionTaskType
    });
  }

  await assertOrderWorkflowTaskClaimable(sql, context, {
    orderId: order.id,
    organisationId: order.organisation_id,
    taskTypes: requiredTaskTypes
  });

  if (input.action === "mark_shipped") {
    const integrity = await repairCustomerOrderAllocationIntegrity(context, {
      customerOrderId: order.id,
      dueAt: order.due_at,
      orderNumber: order.order_number,
      organisationId: order.organisation_id,
      source: "ship_order_preflight",
      sql
    });

    if (!integrity.fullyBacked) {
      throw new Error(
        "Stock changed after allocation. The order has been moved back to Awaiting Stock."
      );
    }

    const allocationRows = await sql<Array<{
      customer_order_line_id: string;
      id: string;
      product_id: string;
      quantity_allocated: number | string;
      retail_product_stock_id: string;
    }>>`
      select
        id::text,
        customer_order_line_id::text,
        retail_product_stock_id::text,
        product_id::text,
        quantity_allocated
      from public.retail_order_allocations
      where customer_order_id = ${order.id}::uuid
        and status in ('active', 'picked')
    `;

    for (const allocation of allocationRows) {
      const quantity = integerOrDefault(allocation.quantity_allocated, 0);

      if (quantity < 1) {
        continue;
      }

      await recordRetailStockMovement(context, {
        deferAllocationIntegrityRepair: true,
        movementType: "sale",
        quantity,
        reason: "Customer order shipped",
        stockId: allocation.retail_product_stock_id
      });

      await sql`
        update public.retail_customer_order_lines
        set
          quantity_shipped = least(quantity_ordered, quantity_shipped + ${quantity}),
          updated_at = now()
        where id = ${allocation.customer_order_line_id}::uuid
      `;

      await sql`
        update public.retail_order_allocations
        set status = 'shipped', updated_at = now()
        where id = ${allocation.id}::uuid
      `;
    }
  }

  if (input.action === "return") {
    const shippedRows = await sql<Array<{
      product_id: string;
      quantity_shipped: number | string;
      retail_product_stock_id: string | null;
    }>>`
      select
        retail_customer_order_lines.product_id::text,
        retail_customer_order_lines.quantity_shipped,
        (
          select retail_order_allocations.retail_product_stock_id::text
          from public.retail_order_allocations
          where retail_order_allocations.customer_order_line_id = retail_customer_order_lines.id
          order by retail_order_allocations.created_at desc
          limit 1
        ) as retail_product_stock_id
      from public.retail_customer_order_lines
      where retail_customer_order_lines.customer_order_id = ${order.id}::uuid
        and retail_customer_order_lines.quantity_shipped > 0
    `;

    for (const line of shippedRows) {
      if (!line.retail_product_stock_id) {
        continue;
      }

      await recordRetailStockMovement(context, {
        movementType: "return",
        quantity: integerOrDefault(line.quantity_shipped, 0),
        reason: "Customer order returned",
        stockId: line.retail_product_stock_id
      });
    }
  }

  await sql`
    update public.retail_customer_orders
    set
      status = ${nextStatus},
      shipped_at = case when ${nextStatus} = 'shipped' then now() else shipped_at end,
      delivered_at = case when ${nextStatus} = 'delivered' then now() else delivered_at end,
      metadata = case
        when ${shipmentMetadata !== null}::boolean then jsonb_set(
          coalesce(metadata, '{}'::jsonb),
          '{shipment}',
          ${sql.json(shipmentMetadata ?? {})}::jsonb,
          true
        )
        else metadata
      end,
      updated_at = now()
    where id = ${order.id}::uuid
  `;

  if (input.action === "mark_shipped") {
    await markRetailOrderSettlementDue(sql, {
      actorPersonId: context.actorPerson.id,
      orderId: order.id
    });
  } else if (input.action === "cancel") {
    if (order.status === "shipped" || order.status === "delivered" || order.status === "returned") {
      await markRetailOrderSettlementNeedsReview(sql, {
        actorPersonId: context.actorPerson.id,
        orderId: order.id,
        reason: "Order cancelled after shipment"
      });
    } else {
      await voidPendingRetailOrderSettlement(sql, {
        actorPersonId: context.actorPerson.id,
        orderId: order.id,
        reason: "Order cancelled before shipment"
      });
    }
  } else if (input.action === "return") {
    await markRetailOrderSettlementNeedsReview(sql, {
      actorPersonId: context.actorPerson.id,
      orderId: order.id,
      reason: "Order returned after shipment"
    });
  }

  if (input.action === "mark_shipped") {
    if (order.status === "allocated") {
      await recordRetailOrderBpmEvent(sql, context, {
        eventName: "retail_order_picking",
        eventStatus: "picking",
        metadata: {
          action: input.action,
          implicit: true,
          source: "one_click_ship",
          toStatus: "picking"
        },
        orderId: order.id,
        organisationId: order.organisation_id
      });
    }

    if (order.status === "allocated" || order.status === "picking") {
      await recordRetailOrderBpmEvent(sql, context, {
        eventName: "retail_order_packed",
        eventStatus: "packed",
        metadata: {
          action: input.action,
          implicit: true,
          source: "one_click_ship",
          toStatus: "packed"
        },
        orderId: order.id,
        organisationId: order.organisation_id
      });
    }
  }

  await recordAdminAudit({
    action: "admin.retail_customer_order_advanced",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: order.organisation_id,
    resourceId: order.id,
    resourceType: "retail_customer_order",
    metadata: {
      action: input.action,
      fromStatus: order.status,
      shipment: shipmentMetadata
        ? {
            carrierName: shipmentMetadata.carrierName,
            hasTrackingUrl: Boolean(shipmentMetadata.trackingUrl),
            trackingNumber: shipmentMetadata.trackingNumber
          }
        : null,
      toStatus: nextStatus
    }
  });

  const completionTaskTypes =
    input.action === "mark_shipped"
      ? ["retail_order_pick", "retail_order_pack", "retail_order_ship"]
      : requiredTaskTypes;

  if (completionTaskTypes.length > 0) {
    await completeOrderWorkflowTask(sql, context, {
      action: input.action,
      orderId: order.id,
      organisationId: order.organisation_id,
      taskTypes: completionTaskTypes
    });
  }

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: transition.bpmEventName,
    eventStatus: nextStatus,
    metadata: {
      action: input.action,
      fromStatus: order.status,
      shipment: shipmentMetadata
        ? {
            carrierName: shipmentMetadata.carrierName,
            hasTrackingUrl: Boolean(shipmentMetadata.trackingUrl),
            trackingNumber: shipmentMetadata.trackingNumber
          }
        : null,
      toStatus: nextStatus
    },
    orderId: order.id,
    organisationId: order.organisation_id
  });

  if (transition.customerEmailEvent) {
    await sendRetailOrderWorkflowEmail({
      event: transition.customerEmailEvent,
      locale: context.effectivePerson.preferredLocale,
      orderId: order.id,
      sql
    });
  }

  try {
    const adminEventKey =
      input.action === "cancel"
        ? "retail_order_cancelled"
        : input.action === "mark_delivered"
          ? "retail_order_delivered"
          : input.action === "mark_packed"
            ? "retail_order_ready_to_ship"
            : input.action === "mark_shipped"
              ? "retail_order_shipped"
              : input.action === "return"
                ? "retail_order_returned"
                : null;

    if (adminEventKey) {
      await queueAdminOrganisationCommunication({
        eventKey: adminEventKey,
        metadata: {
          action: input.action,
          fromStatus: order.status,
          source: "retail_order_transition",
          toStatus: nextStatus
        },
        organisationId: order.organisation_id,
        resourceId: order.id,
        resourceType: "retail_customer_order"
      });
    }
  } catch (error) {
    console.warn("Unable to queue retail organisation workflow notification", error);
  }

  const nextTask = transition.nextTask;

  if (nextTask) {
    await queueRetailOperationTask({
      commandId: "advance_customer_order",
      description: nextTask.reason,
      dueAt: order.due_at,
      idempotencyKey: `${order.id}:${nextTask.taskType}`,
      organisationId: order.organisation_id,
      priorityReason: nextTask.reason,
      priorityScore: nextTask.score,
      sourceEntityId: order.id,
      sourceEntityType: "retail_customer_order",
      taskType: nextTask.taskType,
      title: nextTask.title
    });
  }

  return order.id;
}

export async function recordRetailCustomerOrderPickupBooked(
  context: AdminSessionContext,
  input: Readonly<{
    customerOrderId: string;
    pickupProviderStatus?: string | null;
    shipmentId?: string | null;
  }>
) {
  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const orderRows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
    organisation_id: string;
    order_number: string;
    status: string;
  }>>`
    select id::text, organisation_id::text, order_number, status, due_at
    from public.retail_customer_orders
    where id = ${input.customerOrderId.trim()}::uuid
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    throw new Error("Customer order not found");
  }

  const status = customerOrderStatus(order.status);

  if (status !== "allocated" && status !== "picking" && status !== "packed") {
    return order.id;
  }

  await ensureOrderWorkflowTask(sql, context, {
    dueAt: order.due_at,
    orderId: order.id,
    organisationId: order.organisation_id,
    taskType: "retail_order_ship"
  });
  await assertOrderWorkflowTaskClaimable(sql, context, {
    orderId: order.id,
    organisationId: order.organisation_id,
    taskTypes: ["retail_order_ship"]
  });
  const shipTaskRows = await sql<Array<{ id: string }>>`
    update public.tasks
    set
      context = coalesce(context, '{}'::jsonb) || ${sql.json({
        action: "book_pickup",
        pickupProviderStatus: input.pickupProviderStatus?.trim() || null,
        shipmentId: input.shipmentId ?? null,
        workflowAction: "book_pickup"
      })}::jsonb,
      updated_at = now()
    where organisation_id = ${order.organisation_id}::uuid
      and source_entity_type = 'retail_customer_order'
      and source_entity_id = ${order.id}::uuid
      and task_type = 'retail_order_ship'
      and status not in ('completed', 'cancelled', 'skipped')
    returning id::text
  `;

  for (const task of shipTaskRows) {
    await addTaskEvent({
      eventPayload: {
        actorPersonId: context.actorPerson.id,
        pickupProviderStatus: input.pickupProviderStatus?.trim() || null,
        shipmentId: input.shipmentId ?? null,
        source: "retail_order_workflow"
      },
      eventStatus: "succeeded",
      eventType: "retail_order_pickup_booked",
      severity: "low",
      taskId: task.id
    });
  }

  await recordAdminAudit({
    action: "admin.retail_customer_order_pickup_booked",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: order.organisation_id,
    resourceId: order.id,
    resourceType: "retail_customer_order",
      metadata: {
        action: "book_pickup",
        fromStatus: status,
        pickupProviderStatus: input.pickupProviderStatus?.trim() || null,
        shipmentId: input.shipmentId ?? null,
      workflowAction: "book_pickup"
    }
  });

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: "retail_order_pickup_booked",
    eventStatus: "pickup_booked",
    metadata: {
      action: "book_pickup",
      fromStatus: status,
      pickupProviderStatus: input.pickupProviderStatus?.trim() || null,
      shipmentId: input.shipmentId ?? null,
      workflowAction: "book_pickup"
    },
    orderId: order.id,
    organisationId: order.organisation_id
  });

  return order.id;
}

export async function reconcileRetailOrderLifecycle(
  context: AdminSessionContext,
  input: Readonly<{ customerOrderId: string }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const orderRows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
    organisation_id: string;
    order_number: string;
    status: string;
  }>>`
    select id::text, organisation_id::text, order_number, status, due_at
    from public.retail_customer_orders
    where id = ${input.customerOrderId.trim()}::uuid
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const order = orderRows[0];

  if (!order) {
    throw new Error("Customer order not found");
  }

  const status = customerOrderStatus(order.status);

  if (status === "allocated" || status === "picking" || status === "packed") {
    const integrity = await repairCustomerOrderAllocationIntegrity(context, {
      customerOrderId: order.id,
      dueAt: order.due_at,
      orderNumber: order.order_number,
      organisationId: order.organisation_id,
      source: "order_lifecycle_recheck",
      sql
    });

    if (!integrity.fullyBacked) {
      return order.id;
    }

    if (await customerOrderPickupInProgressFromShipmentTable(sql, order.id)) {
      await ensureOrderWorkflowTask(sql, context, {
        dueAt: order.due_at,
        orderId: order.id,
        organisationId: order.organisation_id,
        taskType: "retail_order_ship"
      });
      const staleCancelledCount = await cancelStaleOrderWorkflowTasks(sql, context, {
        expectedTaskTypes: ["retail_order_ship"],
        orderId: order.id,
        organisationId: order.organisation_id,
        reason: "pickup_in_progress",
        status: order.status
      });

      await recordAdminAudit({
        action: "admin.retail_order_lifecycle_reconciled",
        actorPersonId: context.actorPerson.id,
        assumedPersonId: context.assumedPerson?.id ?? null,
        organisationId: order.organisation_id,
        resourceId: order.id,
        resourceType: "retail_customer_order",
        metadata: {
          pickupInProgress: true,
          repaired: staleCancelledCount > 0,
          staleCancelledCount,
          status: order.status
        }
      });

      await recordRetailOrderBpmEvent(sql, context, {
        eventName: "retail_order_lifecycle_reconciled",
        eventStatus: staleCancelledCount > 0 ? "repaired" : "on_track",
        metadata: {
          pickupInProgress: true,
          repaired: staleCancelledCount > 0,
          staleCancelledCount,
          status: order.status
        },
        orderId: order.id,
        organisationId: order.organisation_id
      });

      return order.id;
    }
  }

  const stage = workflowStageForStatus(status);
  const pipeline = aggregatePipelineRows(
    await getRetailStockPipeline({
      customerOrderId: order.id,
      locale: context.effectivePerson.preferredLocale,
      organisationIds: [order.organisation_id],
      sql
    }),
    order.id
  );
  const expectedTaskType =
    status === "placed" || status === "awaiting_stock"
      ? !pipeline
        ? null
        : pipeline.customerDemandUnits > pipeline.allocatedUnits &&
            pipeline.availableNowUnits > 0
          ? "retail_customer_order_allocate"
          : pipeline.unorderedNeedUnits > 0
            ? "retail_shopping_list_review"
            : null
      : expectedTaskTypeForStage(stage);
  const expectedTaskTypes = expectedTaskType ? [expectedTaskType] : [];
  const staleCancelledCount = await cancelStaleOrderWorkflowTasks(sql, context, {
    expectedTaskTypes,
    orderId: order.id,
    organisationId: order.organisation_id,
    reason: "order_stage_changed",
    status: order.status
  });

  if (!expectedTaskType) {
    await recordAdminAudit({
      action: "admin.retail_order_lifecycle_reconciled",
      actorPersonId: context.actorPerson.id,
      assumedPersonId: context.assumedPerson?.id ?? null,
      organisationId: order.organisation_id,
      resourceId: order.id,
      resourceType: "retail_customer_order",
      metadata: {
        repaired: staleCancelledCount > 0,
        stage,
        staleCancelledCount,
        status: order.status
      }
    });

    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_order_lifecycle_reconciled",
      eventStatus: staleCancelledCount > 0 ? "repaired" : "on_track",
      metadata: {
        repaired: staleCancelledCount > 0,
        stage,
        staleCancelledCount,
        status: order.status
      },
      orderId: order.id,
      organisationId: order.organisation_id
    });

    return order.id;
  }

  const reorderAdviceShortageRepair =
    expectedTaskType === "retail_shopping_list_review"
      ? await ensureRetailOrderShortagesInReorderAdvice(context, {
          customerOrderId: order.id,
          orderNumber: order.order_number,
          organisationId: order.organisation_id,
          sql
        })
      : null;
  const taskRows = await sql<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from public.tasks
      where organisation_id = ${order.organisation_id}::uuid
        and source_entity_type = 'retail_customer_order'
        and source_entity_id = ${order.id}::uuid
        and task_type = any(${expectedTaskTypes}::text[])
        and status not in ('completed', 'cancelled', 'skipped')
    ) as exists
  `;
  const hasExpectedTask = Boolean(taskRows[0]?.exists);
  let repaired = (reorderAdviceShortageRepair?.shortageUnits ?? 0) > 0;
  repaired = repaired || staleCancelledCount > 0;

  if (!hasExpectedTask) {
    const taskDetails = retailOrderWorkflowTaskDetails(expectedTaskType);

    await queueRetailOperationTask({
      commandId: retailCommandIdForTaskType(expectedTaskType) ?? undefined,
      description: taskDetails.description,
      dueAt: order.due_at,
      idempotencyKey: `${order.id}:${expectedTaskType}:reconcile`,
      organisationId: order.organisation_id,
      priorityReason: taskDetails.priorityReason,
      priorityScore: taskDetails.priorityScore,
      sourceEntityId: order.id,
      sourceEntityType: "retail_customer_order",
      taskType: expectedTaskType,
      title: taskDetails.title
    });
    repaired = true;
  }

  await recordAdminAudit({
    action: "admin.retail_order_lifecycle_reconciled",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: order.organisation_id,
    resourceId: order.id,
    resourceType: "retail_customer_order",
    metadata: {
      expectedTaskType,
      repaired,
      reorderAdviceLineCount: reorderAdviceShortageRepair?.lineCount ?? 0,
      reorderAdviceShortageUnits:
        reorderAdviceShortageRepair?.shortageUnits ?? 0,
      stage,
      staleCancelledCount,
      status: order.status
    }
  });

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: "retail_order_lifecycle_reconciled",
    eventStatus: repaired ? "repaired" : "on_track",
    metadata: {
      expectedTaskType,
      repaired,
      reorderAdviceLineCount: reorderAdviceShortageRepair?.lineCount ?? 0,
      reorderAdviceShortageUnits:
        reorderAdviceShortageRepair?.shortageUnits ?? 0,
      stage,
      staleCancelledCount,
      status: order.status
    },
    orderId: order.id,
    organisationId: order.organisation_id
  });

  return order.id;
}
