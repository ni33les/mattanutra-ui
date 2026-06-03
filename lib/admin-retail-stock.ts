import type postgres from "postgres";
import { getSql } from "@/lib/db";
import {
  recordAdminAudit,
  type AdminOrganisation,
  type AdminSessionContext
} from "@/lib/admin-access";
import { hasAdminPermission } from "@/lib/admin-rbac";
import type { Locale } from "@/lib/i18n";
import { AGENT_CAPABILITIES } from "@/lib/system-agents";
import { addTaskEvent, createTask } from "@/lib/task-service";
import { resolveUsdRateForCurrency } from "@/lib/finance-fx";
import { writeFulfillmentBpmEvent } from "@/lib/fulfillment-bpm";
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
export type RetailPurchaseOrderStatus =
  | "cancelled"
  | "closed"
  | "draft"
  | "ordered"
  | "partially_received"
  | "received";
export type RetailShoppingListStatus = "applied" | "cancelled" | "closed" | "draft";
export type RetailShoppingListAvailabilityStatus =
  | "available"
  | "not_available"
  | "partial"
  | "unknown";
export type RetailPurchaseOrderShortfallResolution =
  | "close_short"
  | "damaged_rejected"
  | "replacement_shipment"
  | "supplier_backorder"
  | "supplier_credit"
  | "supplier_refund";
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
  | "delivered"
  | "pack"
  | "pick"
  | "returned"
  | "ship"
  | "terminal";
export type RetailTaskPriorityBand = "high" | "low" | "normal" | "urgent";
export type RetailOperationsTaskAction =
  | "cancel"
  | "claim"
  | "complete"
  | "escalate"
  | "recalculate"
  | "snooze";
export type RetailStockPipelineStatus =
  | "available_now"
  | "backorder"
  | "partially_allocated"
  | "unordered"
  | "waiting_for_po";

export type AdminRetailStockPipelineRow = Readonly<{
  allocatedUnits: number;
  availableNowUnits: number;
  customerDemandUnits: number;
  customerOrderId: string | null;
  customerOrderLineId: string | null;
  draftPoUnits: number;
  incomingUnits: number;
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

export type AdminRetailCustomerOrderActionState = Readonly<{
  enabled: boolean;
  reason: string | null;
}>;

export type AdminRetailCustomerOrderActionStates = Readonly<{
  allocateAvailable: AdminRetailCustomerOrderActionState;
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

export type AdminRetailPurchaseOrder = Readonly<{
  currency: string;
  expectedAt: string | null;
  id: string;
  lineCount: number;
  notes: string | null;
  orderedAt: string | null;
  orderedUnits: number;
  organisationId: string;
  organisationName: string;
  poNumber: string;
  receivedAt: string | null;
  receivedUnits: number;
  status: RetailPurchaseOrderStatus;
  supplierContact: string | null;
  supplierName: string;
  totalWholesaleAmount: number | null;
  updatedAt: string;
}>;

export type AdminRetailPurchaseOrderLine = Readonly<{
  expectedExpiresAt: string | null;
  id: string;
  latestShortfallExpectedAt: string | null;
  latestShortfallReference: string | null;
  latestShortfallResolution: RetailPurchaseOrderShortfallResolution | null;
  notes: string | null;
  openUnits: number;
  productId: string;
  productTitle: string;
  purchaseOrderId: string;
  quantityClosedShort: number;
  quantityCancelled: number;
  quantityOrdered: number;
  quantityReceived: number;
  wholesalePriceAmount: number | null;
}>;

export type AdminRetailShoppingList = Readonly<{
  appliedAt: string | null;
  createdAt: string;
  currency: string;
  id: string;
  lineCount: number;
  listNumber: string;
  notes: string | null;
  organisationId: string;
  organisationName: string;
  purchasedUnits: number;
  requiredUnits: number;
  status: RetailShoppingListStatus;
  updatedAt: string;
}>;

export type AdminRetailShoppingListLine = Readonly<{
  availabilityStatus: RetailShoppingListAvailabilityStatus;
  brandName: string | null;
  currentStockQuantity: number;
  id: string;
  notes: string | null;
  organisationId: string;
  productId: string;
  productTitle: string;
  purchasedQuantity: number;
  requiredQuantity: number;
  retailPriceAmount: number | null;
  shoppingListId: string;
  suggestedQuantity: number;
  unorderedNeedQuantity: number;
  wholesalePriceAmount: number | null;
  wholesalerTried: string | null;
}>;

export type AdminRetailCustomerOrder = Readonly<{
  actionStates: AdminRetailCustomerOrderActionStates;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  deliveredAt: string | null;
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
  source: "checkout" | "manual";
  status: RetailCustomerOrderStatus;
  stuckReason: string | null;
  taskCount: number;
  totalRetailAmount: number | null;
  updatedAt: string;
  workflowStage: RetailOrderWorkflowStage;
  workflowHealth: AdminRetailCustomerOrderWorkflowHealth;
  workflowTaskIds: readonly string[];
}>;

export type AdminRetailCustomerOrderLine = Readonly<{
  availabilityStatus: RetailAvailabilityStatus | null;
  backorderQuantity: number | null;
  customerOrderId: string;
  etaDate: string | null;
  fxRateId: string | null;
  id: string;
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
  customerOrderLines: AdminRetailCustomerOrderLine[];
  customerOrders: AdminRetailCustomerOrder[];
  databaseAvailable: boolean;
  generatedAt: string;
  lots: AdminRetailStockLot[];
  movements: AdminRetailStockMovement[];
  organisations: AdminRetailStockOrganisation[];
  pipeline: AdminRetailStockPipelineRow[];
  productOptions: AdminRetailStockProductOption[];
  purchaseOrderLines: AdminRetailPurchaseOrderLine[];
  purchaseOrders: AdminRetailPurchaseOrder[];
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

export type RetailPurchaseOrderLineInput = Readonly<{
  expectedExpiresAt?: string | null;
  notes?: string | null;
  productId: string;
  quantityOrdered: number;
  wholesalePriceAmount?: number | null;
}>;

export type CreateRetailPurchaseOrderInput = Readonly<{
  expectedAt?: string | null;
  lines: RetailPurchaseOrderLineInput[];
  notes?: string | null;
  organisationId?: string | null;
  poNumber?: string | null;
  supplierContact?: string | null;
  supplierName: string;
}>;

export type BuildPurchaseOrderDraftFromBackorderTaskInput = Readonly<{
  expectedAt?: string | null;
  lines: RetailPurchaseOrderLineInput[];
  notes?: string | null;
  purchaseOrderId?: string | null;
  supplierContact?: string | null;
  supplierName?: string | null;
  taskId: string;
}>;

export type ReceiveRetailPurchaseOrderLineInput = Readonly<{
  expiresAt?: string | null;
  lineId: string;
  notes?: string | null;
  quantity: number;
  reason?: string | null;
}>;

export type ReconcileRetailPurchaseOrderLineShortfallInput = Readonly<{
  expectedAt?: string | null;
  lineId: string;
  notes?: string | null;
  reference?: string | null;
  reason?: string | null;
  resolution: RetailPurchaseOrderShortfallResolution;
}>;

export type MarkRetailPurchaseOrderLineMissingInput = Readonly<{
  expectedAt?: string | null;
  lineId: string;
  notes?: string | null;
  reason?: string | null;
  reference?: string | null;
  resolution?: RetailPurchaseOrderShortfallResolution;
}>;

export type RetailCustomerOrderLineInput = Readonly<{
  notes?: string | null;
  productId: string;
  quantityOrdered: number;
  retailPriceAmount?: number | null;
}>;

export type RetailShoppingListLineInput = Readonly<{
  availabilityStatus?: RetailShoppingListAvailabilityStatus | null;
  currentStockQuantity?: number | null;
  notes?: string | null;
  productId: string;
  purchasedQuantity?: number | null;
  requiredQuantity: number;
  retailPriceAmount?: number | null;
  suggestedQuantity?: number | null;
  unorderedNeedQuantity?: number | null;
  wholesalePriceAmount?: number | null;
  wholesalerTried?: string | null;
}>;

export type CreateRetailShoppingListInput = Readonly<{
  lines: RetailShoppingListLineInput[];
  notes?: string | null;
  organisationId?: string | null;
}>;

export type UpdateRetailShoppingListInput = Readonly<{
  lines: ReadonlyArray<RetailShoppingListLineInput & { id?: string | null }>;
  notes?: string | null;
  shoppingListId: string;
  status?: RetailShoppingListStatus | null;
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

function normalizeCurrency(value: string | null | undefined, type: string) {
  const currency = value?.trim().toUpperCase() ?? "";

  return /^[A-Z]{3}$/.test(currency)
    ? currency
    : type === "platform"
      ? "USD"
      : "THB";
}

function stockStatus(value: unknown): RetailStockStatus {
  return value === "disabled" || value === "deleted" ? value : "active";
}

function stockBackorderPolicy(value: unknown): BackorderPolicy {
  return value === "deny" ? "deny" : "allow";
}

function lotStatus(value: unknown): RetailStockLotStatus {
  return value === "depleted" || value === "disabled" || value === "deleted"
    ? value
    : "active";
}

function movementType(value: unknown): RetailStockMovementType {
  return value === "sale" ||
    value === "adjustment" ||
    value === "void" ||
    value === "return" ||
    value === "transfer_in" ||
    value === "transfer_out" ||
    value === "expiry_write_off"
    ? value
    : "receive";
}

function movementDelta(type: Exclude<RetailStockMovementType, "void">, quantity: number) {
  const rounded = Math.round(quantity);

  if (!Number.isFinite(rounded) || rounded === 0) {
    throw new Error("Movement quantity is required");
  }

  if (type === "adjustment") {
    return rounded;
  }

  const absolute = Math.abs(rounded);

  return type === "sale" ||
    type === "transfer_out" ||
    type === "expiry_write_off"
    ? -absolute
    : absolute;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function purchaseOrderStatusFromTotals(input: Readonly<{
  cancelledUnits: number;
  orderedUnits: number;
  receivedUnits: number;
}>): RetailPurchaseOrderStatus {
  const openUnits = Math.max(
    0,
    input.orderedUnits - input.receivedUnits - input.cancelledUnits
  );

  if (openUnits === 0) {
    if (input.receivedUnits >= input.orderedUnits) {
      return "received";
    }

    return "closed";
  }

  return input.receivedUnits > 0 ? "partially_received" : "ordered";
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integerOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function isoDateOrNull(value: unknown) {
  if (!value) {
    return null;
  }

  const date = new Date(String(value));

  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function isoDateTime(value: Date | string) {
  return new Date(value).toISOString();
}

function isoDateTimeOrNull(value: Date | string | null) {
  return value ? isoDateTime(value) : null;
}

function purchaseOrderStatus(value: unknown): RetailPurchaseOrderStatus {
  return value === "cancelled" ||
    value === "closed" ||
    value === "ordered" ||
    value === "partially_received" ||
    value === "received"
    ? value
    : "draft";
}

function shoppingListStatus(value: unknown): RetailShoppingListStatus {
  return value === "applied" || value === "cancelled" || value === "closed"
    ? value
    : "draft";
}

function shoppingListAvailabilityStatus(
  value: unknown
): RetailShoppingListAvailabilityStatus {
  return value === "available" || value === "not_available" || value === "partial"
    ? value
    : "unknown";
}

function shortfallResolution(
  value: unknown
): RetailPurchaseOrderShortfallResolution {
  return value === "replacement_shipment" ||
    value === "supplier_credit" ||
    value === "supplier_refund" ||
    value === "close_short" ||
    value === "damaged_rejected"
    ? value
    : "supplier_backorder";
}

function shortfallResolutionClosesUnits(
  resolution: RetailPurchaseOrderShortfallResolution
) {
  return (
    resolution === "supplier_credit" ||
    resolution === "supplier_refund" ||
    resolution === "close_short" ||
    resolution === "damaged_rejected"
  );
}

function customerOrderStatus(value: unknown): RetailCustomerOrderStatus {
  return value === "allocated" ||
    value === "awaiting_stock" ||
    value === "cancelled" ||
    value === "delivered" ||
    value === "packed" ||
    value === "picking" ||
    value === "placed" ||
    value === "returned" ||
    value === "shipped"
    ? value
    : "draft";
}

function customerOrderSource(value: unknown): "checkout" | "manual" {
  return value === "checkout" ? "checkout" : "manual";
}

function priorityBand(score: number): RetailTaskPriorityBand {
  if (score >= 700) {
    return "urgent";
  }

  if (score >= 450) {
    return "high";
  }

  if (score < 180) {
    return "low";
  }

  return "normal";
}

function orderNumber(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

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
      to_regclass('public.retail_purchase_orders') is not null
      and to_regclass('public.retail_purchase_order_lines') is not null
      and to_regclass('public.retail_customer_orders') is not null
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

function numberMetadata(value: unknown, fallback = 0) {
  const number = numberOrNull(value);

  return number === null ? fallback : number;
}

function stringMetadata(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function routingSnapshotFromMetadata(
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

function pricingSnapshotFromMetadata(
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

function fulfillmentPromiseFromMetadata(
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

function lineAvailabilityFromMetadata(value: unknown): Pick<
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

function workflowStageForStatus(
  status: RetailCustomerOrderStatus
): RetailOrderWorkflowStage {
  if (status === "cancelled") {
    return "cancelled";
  }

  if (status === "returned") {
    return "returned";
  }

  if (status === "delivered") {
    return "delivered";
  }

  if (status === "packed") {
    return "ship";
  }

  if (status === "picking") {
    return "pack";
  }

  if (status === "allocated") {
    return "pick";
  }

  if (status === "awaiting_stock") {
    return "awaiting_stock";
  }

  if (status === "placed" || status === "draft") {
    return "allocate";
  }

  return "terminal";
}

function expectedTaskTypeForStage(stage: RetailOrderWorkflowStage) {
  if (stage === "allocate") {
    return "retail_customer_order_allocate";
  }

  if (stage === "awaiting_stock") {
    return "retail_stock_reorder_review";
  }

  if (stage === "pick") {
    return "retail_order_pick";
  }

  if (stage === "pack") {
    return "retail_order_pack";
  }

  if (stage === "ship") {
    return "retail_order_ship";
  }

  return null;
}

function workflowActionForStage(stage: RetailOrderWorkflowStage) {
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

  if (stage === "ship") {
    return "mark_shipped";
  }

  return null;
}

export function getRetailCustomerOrderActionStates(
  status: RetailCustomerOrderStatus,
  pipeline: AdminRetailStockPipelineRow | null
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

  return {
    allocateAvailable: {
      enabled: allocationEnabled,
      reason: allocationReason
    },
    deliver: {
      enabled: status === "shipped",
      reason: status === "shipped" ? null : "Order must be shipped first."
    },
    pack: {
      enabled: status === "picking",
      reason: status === "picking" ? null : "Order must be picking first."
    },
    pick: {
      enabled: status === "allocated",
      reason: status === "allocated" ? null : "Order must be allocated first."
    },
    recheckWorkflow: {
      enabled: true,
      reason: null
    },
    ship: {
      enabled: status === "packed",
      reason: status === "packed" ? null : "Order must be packed first."
    }
  };
}

function getRetailCustomerOrderWorkflowHealth(input: Readonly<{
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
      expectedTaskType = "retail_stock_low_stock_review";
      nextAction = "build_draft_po";
      reason = "Unordered need exists. Build or update a draft purchase order.";
    } else if (input.pipeline.incomingUnits > 0) {
      expectedTaskType = "retail_purchase_order_receive";
      nextAction = "receive_stock";
      reason = "Incoming supplier stock exists. Receive stock before allocation.";
    } else if (input.pipeline.draftPoUnits > 0) {
      expectedTaskType = "retail_purchase_order_place_order";
      nextAction = "place_purchase_order";
      reason = "Draft PO coverage exists. Place the supplier order.";
    }
  } else {
    expectedTaskType = expectedTaskTypeForStage(input.workflowStage);
    nextAction = workflowActionForStage(input.workflowStage);
    reason = nextAction ? null : null;
  }

  const expectedTaskTypes =
    expectedTaskType === "retail_stock_low_stock_review"
      ? ["retail_stock_low_stock_review", "retail_stock_reorder_review"]
      : expectedTaskType
        ? [expectedTaskType]
        : [];
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

function isTerminalTaskStatus(status: string) {
  return status === "completed" || status === "cancelled" || status === "skipped";
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
  draftPoUnits: number;
  incomingUnits: number;
  unorderedNeedUnits: number;
}>): RetailStockPipelineStatus {
  if (input.unorderedNeedUnits > 0) {
    return "unordered";
  }

  if (input.incomingUnits > 0 || input.draftPoUnits > 0) {
    return "waiting_for_po";
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
      customerDemandUnits: total.customerDemandUnits + row.customerDemandUnits,
      draftPoUnits: total.draftPoUnits + row.draftPoUnits,
      incomingUnits: total.incomingUnits + row.incomingUnits,
      shippedUnits: total.shippedUnits + row.shippedUnits,
      unorderedNeedUnits: total.unorderedNeedUnits + row.unorderedNeedUnits
    }),
    {
      allocatedUnits: 0,
      availableNowUnits: 0,
      customerDemandUnits: 0,
      draftPoUnits: 0,
      incomingUnits: 0,
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
    status: pipelineStatus(totals)
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
    draft_po_units: number | string | null;
    incoming_units: number | string | null;
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
    ),
    draft_pos as (
      select
        retail_purchase_order_lines.organisation_id,
        retail_purchase_order_lines.product_id,
        coalesce(
          sum(
            retail_purchase_order_lines.quantity_ordered
              - retail_purchase_order_lines.quantity_received
              - retail_purchase_order_lines.quantity_cancelled
          ),
          0
        )::int as draft_po_units
      from public.retail_purchase_order_lines
      join public.retail_purchase_orders
        on retail_purchase_orders.id = retail_purchase_order_lines.purchase_order_id
      where retail_purchase_order_lines.organisation_id = any(${input.organisationIds}::uuid[])
        and retail_purchase_orders.status = 'draft'
      group by retail_purchase_order_lines.organisation_id, retail_purchase_order_lines.product_id
    ),
    incoming_pos as (
      select
        retail_purchase_order_lines.organisation_id,
        retail_purchase_order_lines.product_id,
        coalesce(
          sum(
            retail_purchase_order_lines.quantity_ordered
              - retail_purchase_order_lines.quantity_received
              - retail_purchase_order_lines.quantity_cancelled
          ),
          0
        )::int as incoming_units
      from public.retail_purchase_order_lines
      join public.retail_purchase_orders
        on retail_purchase_orders.id = retail_purchase_order_lines.purchase_order_id
      where retail_purchase_order_lines.organisation_id = any(${input.organisationIds}::uuid[])
        and retail_purchase_orders.status in ('ordered', 'partially_received')
      group by retail_purchase_order_lines.organisation_id, retail_purchase_order_lines.product_id
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
      coalesce(active_allocations.active_allocated_units, 0)::int as active_allocated_units,
      coalesce(draft_pos.draft_po_units, 0)::int as draft_po_units,
      coalesce(incoming_pos.incoming_units, 0)::int as incoming_units
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
    left join draft_pos
      on draft_pos.organisation_id = order_lines.organisation_id
      and draft_pos.product_id = order_lines.product_id
    left join incoming_pos
      on incoming_pos.organisation_id = order_lines.organisation_id
      and incoming_pos.product_id = order_lines.product_id
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
    const availableNowUnits = Math.max(0, physicalStockUnits - activeAllocatedUnits);
    const draftPoUnits = integerOrDefault(row.draft_po_units, 0);
    const incomingUnits = integerOrDefault(row.incoming_units, 0);
    const shippedUnits = integerOrDefault(row.shipped_units, 0);
    const unorderedNeedUnits = Math.max(
      0,
      customerDemandUnits -
        allocatedUnits -
        availableNowUnits -
        incomingUnits -
        draftPoUnits
    );
    const statusInput = {
      allocatedUnits,
      availableNowUnits,
      customerDemandUnits,
      draftPoUnits,
      incomingUnits,
      unorderedNeedUnits
    };

    return {
      allocatedUnits,
      availableNowUnits,
      customerDemandUnits,
      customerOrderId: row.customer_order_id,
      customerOrderLineId: row.customer_order_line_id,
      draftPoUnits,
      incomingUnits,
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
  await writeFulfillmentBpmEvent({
    eventName: input.eventName,
    eventStatus: input.eventStatus,
    fulfillmentOrderId: input.orderId,
    locale: context.effectivePerson.preferredLocale,
    properties: {
      actorPersonId: context.actorPerson.id,
      assumedPersonId: context.assumedPerson?.id ?? null,
      organisationId: input.organisationId,
      ...input.metadata
    },
    sql
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

async function productApproved(sql: Db, productId: string) {
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
  sql: Db,
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

async function queueRetailOperationTask(input: Readonly<{
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
      scheduledFor: input.dueAt ?? new Date(),
      sourceEntityId: input.sourceEntityId ?? null,
      sourceEntityType: input.sourceEntityType ?? null,
      taskType: input.taskType,
      title: input.title
    });
  } catch (error) {
    console.warn("Unable to queue retail operations task", error);
  }
}

async function queuePurchaseOrderPlaceTask(input: Readonly<{
  expectedAt?: Date | string | null;
  organisationId: string;
  purchaseOrderId: string;
  supplierName: string;
}>) {
  await queueRetailOperationTask({
    description: "Review and place this draft supplier purchase order.",
    dueAt: input.expectedAt ?? null,
    idempotencyKey: `${input.purchaseOrderId}:place-order`,
    organisationId: input.organisationId,
    payload: {
      purchaseOrderId: input.purchaseOrderId,
      supplierName: input.supplierName
    },
    priorityReason: `Draft purchase order for ${input.supplierName} is ready to place.`,
    priorityScore: 560,
    sourceEntityId: input.purchaseOrderId,
    sourceEntityType: "retail_purchase_order",
    taskType: "retail_purchase_order_place_order",
    title: "Place purchase order"
  });
}

async function completePurchaseOrderPlaceTask(
  sql: StockDb,
  context: AdminSessionContext,
  input: Readonly<{
    organisationId: string;
    purchaseOrderId: string;
  }>
) {
  const taskRows = await sql<Array<{ id: string; status: string }>>`
    select id::text, status
    from public.tasks
    where organisation_id = ${input.organisationId}::uuid
      and source_entity_type = 'retail_purchase_order'
      and source_entity_id = ${input.purchaseOrderId}::uuid
      and task_type = 'retail_purchase_order_place_order'
      and status not in ('completed', 'cancelled', 'skipped')
    order by updated_at asc
    limit 1
  `;
  const task = taskRows[0];

  if (!task) {
    return null;
  }

  await sql`
    update public.tasks
    set
      status = 'completed',
      completed_at = now(),
      context = coalesce(context, '{}'::jsonb) || ${sql.json({
        completedByDisplayName: context.actorPerson.displayName,
        completedByEmail: context.actorPerson.email,
        completedByPersonId: context.actorPerson.id,
        workflowAction: "mark_purchase_order_ordered"
      })},
      updated_at = now()
    where id = ${task.id}::uuid
  `;

  await addTaskEvent({
    eventPayload: {
      actorPersonId: context.actorPerson.id,
      fromStatus: task.status,
      purchaseOrderId: input.purchaseOrderId,
      source: "retail_purchase_order_workflow"
    },
    eventStatus: "succeeded",
    eventType: "retail_purchase_order_place_task_completed",
    severity: "low",
    taskId: task.id
  });

  return task.id;
}

async function completePurchaseOrderReceiveTasks(
  sql: StockDb,
  context: AdminSessionContext,
  input: Readonly<{
    organisationId: string;
    purchaseOrderId: string;
    workflowAction: string;
  }>
) {
  const taskRows = await sql<Array<{ id: string; status: string }>>`
    update public.tasks
    set
      status = 'completed',
      completed_at = now(),
      context = coalesce(context, '{}'::jsonb) || ${sql.json({
        completedByDisplayName: context.actorPerson.displayName,
        completedByEmail: context.actorPerson.email,
        completedByPersonId: context.actorPerson.id,
        purchaseOrderId: input.purchaseOrderId,
        workflowAction: input.workflowAction
      })},
      updated_at = now()
    where organisation_id = ${input.organisationId}::uuid
      and source_entity_type = 'retail_purchase_order'
      and source_entity_id = ${input.purchaseOrderId}::uuid
      and task_type = 'retail_purchase_order_receive'
      and status not in ('completed', 'cancelled', 'skipped')
    returning id::text, status
  `;

  for (const task of taskRows) {
    await addTaskEvent({
      eventPayload: {
        actorPersonId: context.actorPerson.id,
        fromStatus: task.status,
        purchaseOrderId: input.purchaseOrderId,
        source: "retail_purchase_order_workflow"
      },
      eventStatus: "succeeded",
      eventType: "retail_purchase_order_receive_task_completed",
      severity: "low",
      taskId: task.id
    });
  }

  return taskRows.map((task) => task.id);
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
    limit 1
  `;
  const task = taskRows[0];

  if (!task) {
    return null;
  }

  if (
    task.claimed_by_person_id &&
    task.claimed_by_person_id !== context.actorPerson.id &&
    !canOverrideRetailTaskClaim(context)
  ) {
    throw new Error("This workflow task is claimed by another person");
  }

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

  return task.id;
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

  const details =
    input.taskType === "retail_customer_order_allocate"
      ? {
          description: "Allocate live stock to this customer order.",
          priorityReason:
            "Workflow repair restored allocation work because live stock is available.",
          priorityScore: 700,
          title: "Allocate customer order"
        }
      : {
          description: "Continue this customer order workflow.",
          priorityReason: "Workflow repair restored missing order work.",
          priorityScore: 650,
          title: "Continue customer order"
        };

  await queueRetailOperationTask({
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

async function queueStockReviewTasks(row: RetailStockSnapshotRow, reason: string) {
  const stockQuantity = integerOrDefault(row.stock_quantity, 0);
  const retailPriceAmount = numberOrNull(row.retail_price_amount);
  const stockoutImpact = Math.max(0, stockQuantity === 0 ? retailPriceAmount ?? 0 : 0);

  if (stockQuantity === 0) {
    await queueRetailOperationTask({
      description: "Review out-of-stock retail inventory and decide whether to reorder.",
      idempotencyKey: `${row.id}:low-stock`,
      organisationId: row.organisation_id,
      priorityReason: "Product is out of stock.",
      priorityScore: 760,
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
  stockId?: string | null;
}>) {
  const sql = getSql();

  if (!sql || !(await operationalStockTablesAvailable(sql))) {
    return { refreshed: 0 };
  }

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
      and (${input.stockId ?? null}::uuid is null or retail_product_stock.id = ${input.stockId ?? null}::uuid)
      and (${input.productId ?? null}::uuid is null or retail_product_stock.product_id = ${input.productId ?? null}::uuid)
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
          ? 820
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
        description: "Review reorder advice and decide whether to create a purchase order.",
        dueAt: reorderBy,
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
    customerOrderLines: [],
    customerOrders: [],
    databaseAvailable: false,
    generatedAt: new Date().toISOString(),
    lots: [],
    movements: [],
    organisations: [],
    pipeline: [],
    productOptions: [],
    purchaseOrderLines: [],
    purchaseOrders: [],
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
      const [
        taskRows,
        purchaseOrderRows,
        purchaseOrderLineRows,
        customerOrderRows,
    customerOrderLineRows
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
            and tasks.task_type like 'retail_%'
            and tasks.task_type <> 'retail_purchase_order_review'
          order by
            case when tasks.status in ('completed', 'cancelled', 'skipped') then 1 else 0 end,
            coalesce(tasks.priority_score, tasks.business_value) desc,
            coalesce(tasks.due_at, tasks.scheduled_for) asc,
            tasks.updated_at desc
          limit 300
        `,
        sql<Array<{
          currency: string;
          expected_at: Date | string | null;
          id: string;
          line_count: number | string;
          notes: string | null;
          ordered_at: Date | string | null;
          ordered_units: number | string;
          organisation_id: string;
          organisation_name: string;
          po_number: string;
          received_at: Date | string | null;
          received_units: number | string;
          status: string;
          supplier_contact: string | null;
          supplier_name: string;
          total_wholesale_amount: number | string | null;
          updated_at: Date | string;
        }>>`
          select
            retail_purchase_orders.id::text,
            retail_purchase_orders.organisation_id::text,
            organisations.name as organisation_name,
            retail_purchase_orders.po_number,
            retail_purchase_orders.supplier_name,
            retail_purchase_orders.supplier_contact,
            retail_purchase_orders.status,
            retail_purchase_orders.currency,
            retail_purchase_orders.expected_at,
            retail_purchase_orders.ordered_at,
            retail_purchase_orders.received_at,
            retail_purchase_orders.notes,
            retail_purchase_orders.updated_at,
            count(retail_purchase_order_lines.id)::int as line_count,
            coalesce(sum(retail_purchase_order_lines.quantity_ordered), 0)::int as ordered_units,
            coalesce(sum(retail_purchase_order_lines.quantity_received), 0)::int as received_units,
            sum(retail_purchase_order_lines.quantity_ordered * retail_purchase_order_lines.wholesale_price_amount) as total_wholesale_amount
          from public.retail_purchase_orders
          join public.organisations
            on organisations.id = retail_purchase_orders.organisation_id
          left join public.retail_purchase_order_lines
            on retail_purchase_order_lines.purchase_order_id = retail_purchase_orders.id
          where retail_purchase_orders.organisation_id = any(${organisationIds}::uuid[])
          group by retail_purchase_orders.id, organisations.name
          order by retail_purchase_orders.updated_at desc
          limit 200
        `,
        sql<Array<{
          expected_expires_at: Date | string | null;
          id: string;
          latest_shortfall_expected_at: Date | string | null;
          latest_shortfall_reference: string | null;
          latest_shortfall_resolution: string | null;
          notes: string | null;
          open_units: number | string;
          product_id: string;
          product_title: string;
          purchase_order_id: string;
          quantity_ordered: number | string;
          quantity_cancelled: number | string;
          quantity_received: number | string;
          wholesale_price_amount: number | string | null;
        }>>`
          select
            retail_purchase_order_lines.id::text,
            retail_purchase_order_lines.purchase_order_id::text,
            retail_purchase_order_lines.product_id::text,
            ${productTitle} as product_title,
            retail_purchase_order_lines.quantity_ordered,
            retail_purchase_order_lines.quantity_cancelled,
            retail_purchase_order_lines.quantity_received,
            greatest(
              0,
              retail_purchase_order_lines.quantity_ordered
                - retail_purchase_order_lines.quantity_received
                - retail_purchase_order_lines.quantity_cancelled
            )::int as open_units,
            retail_purchase_order_lines.wholesale_price_amount,
            retail_purchase_order_lines.expected_expires_at,
            retail_purchase_order_lines.notes,
            latest_shortfall.resolution as latest_shortfall_resolution,
            latest_shortfall.reference as latest_shortfall_reference,
            latest_shortfall.expected_at as latest_shortfall_expected_at
          from public.retail_purchase_order_lines
          join public.products
            on products.id = retail_purchase_order_lines.product_id
          left join public.product_translations
            on product_translations.product_id = products.id
            and product_translations.locale = ${locale}
            and product_translations.status <> 'missing'
          left join lateral (
            select
              shortfalls.resolution,
              shortfalls.reference,
              shortfalls.expected_at
            from public.retail_purchase_order_line_shortfalls shortfalls
            where shortfalls.purchase_order_line_id = retail_purchase_order_lines.id
            order by shortfalls.created_at desc
            limit 1
          ) latest_shortfall on true
          where retail_purchase_order_lines.organisation_id = any(${organisationIds}::uuid[])
          order by retail_purchase_order_lines.created_at desc
          limit 500
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
          id: string;
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
          where retail_customer_order_lines.organisation_id = any(${organisationIds}::uuid[])
          order by retail_customer_order_lines.created_at desc
          limit 500
        `
      ])
    : [[], [], [], [], []];
  const shoppingListTablesReady = organisationIds.length > 0
    ? await retailShoppingListTablesAvailable(sql)
    : false;
  const [shoppingListRows, shoppingListLineRows] = shoppingListTablesReady
    ? await Promise.all([
        sql<Array<{
          applied_at: Date | string | null;
          created_at: Date | string;
          currency: string;
          id: string;
          line_count: number | string;
          list_number: string;
          notes: string | null;
          organisation_id: string;
          organisation_name: string;
          purchased_units: number | string;
          required_units: number | string;
          status: string;
          updated_at: Date | string;
        }>>`
          select
            retail_shopping_lists.id::text,
            retail_shopping_lists.organisation_id::text,
            organisations.name as organisation_name,
            retail_shopping_lists.list_number,
            retail_shopping_lists.status,
            retail_shopping_lists.currency,
            retail_shopping_lists.notes,
            retail_shopping_lists.applied_at,
            retail_shopping_lists.created_at,
            retail_shopping_lists.updated_at,
            count(retail_shopping_list_lines.id)::int as line_count,
            coalesce(sum(retail_shopping_list_lines.required_quantity), 0)::int as required_units,
            coalesce(sum(retail_shopping_list_lines.purchased_quantity), 0)::int as purchased_units
          from public.retail_shopping_lists
          join public.organisations
            on organisations.id = retail_shopping_lists.organisation_id
          left join public.retail_shopping_list_lines
            on retail_shopping_list_lines.shopping_list_id = retail_shopping_lists.id
          where retail_shopping_lists.organisation_id = any(${organisationIds}::uuid[])
            and retail_shopping_lists.status <> 'cancelled'
          group by retail_shopping_lists.id, organisations.name
          order by retail_shopping_lists.updated_at desc
          limit 50
        `,
        sql<Array<{
          availability_status: string;
          brand_name: string | null;
          current_stock_quantity: number | string;
          id: string;
          notes: string | null;
          organisation_id: string;
          product_id: string;
          product_title: string;
          purchased_quantity: number | string;
          required_quantity: number | string;
          retail_price_amount: number | string | null;
          shopping_list_id: string;
          suggested_quantity: number | string;
          unordered_need_quantity: number | string;
          wholesale_price_amount: number | string | null;
          wholesaler_tried: string | null;
        }>>`
          select
            retail_shopping_list_lines.id::text,
            retail_shopping_list_lines.shopping_list_id::text,
            retail_shopping_list_lines.organisation_id::text,
            retail_shopping_list_lines.product_id::text,
            ${productTitle} as product_title,
            products.brand_name,
            retail_shopping_list_lines.required_quantity,
            retail_shopping_list_lines.current_stock_quantity,
            retail_shopping_list_lines.unordered_need_quantity,
            retail_shopping_list_lines.suggested_quantity,
            retail_shopping_list_lines.wholesaler_tried,
            retail_shopping_list_lines.availability_status,
            retail_shopping_list_lines.purchased_quantity,
            retail_shopping_list_lines.wholesale_price_amount,
            retail_shopping_list_lines.retail_price_amount,
            retail_shopping_list_lines.notes
          from public.retail_shopping_list_lines
          join public.products
            on products.id = retail_shopping_list_lines.product_id
          left join public.product_translations
            on product_translations.product_id = products.id
            and product_translations.locale = ${locale}
            and product_translations.status <> 'missing'
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
    customerOrderLines: customerOrderLineRows.map((row) => ({
      ...lineAvailabilityFromMetadata(row.metadata),
      customerOrderId: row.customer_order_id,
      id: row.id,
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
      const workflowStage = workflowStageForStatus(status);
      const pipeline = pipelineByOrderId.get(row.id) ?? null;
      const relatedTasks = tasksByCustomerOrderId.get(row.id) ?? [];
      const openTasks = relatedTasks.filter(
        (task) => !isTerminalTaskStatus(task.status)
      );
      const actionStates = getRetailCustomerOrderActionStates(status, pipeline);
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

      return {
        actionStates,
        currency: row.currency,
        customerEmail: row.customer_email,
        customerName: row.customer_name,
        deliveredAt: isoDateTimeOrNull(row.delivered_at),
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
        placedAt: isoDateTimeOrNull(row.placed_at),
        pipeline,
        pricingSnapshot: pricingSnapshotFromMetadata(row.metadata, row.currency),
        routingSnapshot: routingSnapshotFromMetadata(row.metadata),
        shippedAt: isoDateTimeOrNull(row.shipped_at),
        shippedUnits: integerOrDefault(row.shipped_units, 0),
        source: customerOrderSource(row.source),
        status,
        stuckReason: workflowHealth.reason,
        taskCount: relatedTasks.length,
        totalRetailAmount: numberOrNull(row.total_retail_amount),
        updatedAt: isoDateTime(row.updated_at),
        workflowStage,
        workflowHealth,
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
    purchaseOrderLines: purchaseOrderLineRows.map((row) => ({
      expectedExpiresAt: isoDateOrNull(row.expected_expires_at),
      id: row.id,
      latestShortfallExpectedAt: isoDateOrNull(row.latest_shortfall_expected_at),
      latestShortfallReference: row.latest_shortfall_reference,
      latestShortfallResolution:
        row.latest_shortfall_resolution === null
          ? null
          : shortfallResolution(row.latest_shortfall_resolution),
      notes: row.notes,
      openUnits: integerOrDefault(row.open_units, 0),
      productId: row.product_id,
      productTitle: row.product_title,
      purchaseOrderId: row.purchase_order_id,
      quantityClosedShort: integerOrDefault(row.quantity_cancelled, 0),
      quantityCancelled: integerOrDefault(row.quantity_cancelled, 0),
      quantityOrdered: integerOrDefault(row.quantity_ordered, 0),
      quantityReceived: integerOrDefault(row.quantity_received, 0),
      wholesalePriceAmount: numberOrNull(row.wholesale_price_amount)
    })),
    purchaseOrders: purchaseOrderRows.map((row) => ({
      currency: row.currency,
      expectedAt: isoDateOrNull(row.expected_at),
      id: row.id,
      lineCount: integerOrDefault(row.line_count, 0),
      notes: row.notes,
      orderedAt: isoDateTimeOrNull(row.ordered_at),
      orderedUnits: integerOrDefault(row.ordered_units, 0),
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      poNumber: row.po_number,
      receivedAt: isoDateTimeOrNull(row.received_at),
      receivedUnits: integerOrDefault(row.received_units, 0),
      status: purchaseOrderStatus(row.status),
      supplierContact: row.supplier_contact,
      supplierName: row.supplier_name,
      totalWholesaleAmount: numberOrNull(row.total_wholesale_amount),
      updatedAt: isoDateTime(row.updated_at)
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
      availabilityStatus: shoppingListAvailabilityStatus(row.availability_status),
      brandName: row.brand_name,
      currentStockQuantity: integerOrDefault(row.current_stock_quantity, 0),
      id: row.id,
      notes: row.notes,
      organisationId: row.organisation_id,
      productId: row.product_id,
      productTitle: row.product_title,
      purchasedQuantity: integerOrDefault(row.purchased_quantity, 0),
      requiredQuantity: integerOrDefault(row.required_quantity, 0),
      retailPriceAmount: numberOrNull(row.retail_price_amount),
      shoppingListId: row.shopping_list_id,
      suggestedQuantity: integerOrDefault(row.suggested_quantity, 0),
      unorderedNeedQuantity: integerOrDefault(row.unordered_need_quantity, 0),
      wholesalePriceAmount: numberOrNull(row.wholesale_price_amount),
      wholesalerTried: row.wholesaler_tried
    })),
    shoppingLists: shoppingListRows.map((row) => ({
      appliedAt: isoDateTimeOrNull(row.applied_at),
      createdAt: isoDateTime(row.created_at),
      currency: row.currency,
      id: row.id,
      lineCount: integerOrDefault(row.line_count, 0),
      listNumber: row.list_number,
      notes: row.notes,
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      purchasedUnits: integerOrDefault(row.purchased_units, 0),
      requiredUnits: integerOrDefault(row.required_units, 0),
      status: shoppingListStatus(row.status),
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
  await queueRetailStockIntelligenceRefresh(rows[0], "stock_status_updated");
  await queueStockReviewTasks(rows[0], "stock_status_updated");

  return rows[0].id;
}

async function ensureRetailStockRow(
  context: AdminSessionContext,
  input: Readonly<{
    organisationId: string;
    productId: string;
    wholesalePriceAmount?: number | null;
  }>
) {
  const sql = getSql();

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
        source: "admin_stock_receiving"
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
    source: "purchase_order_receiving"
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

  if (!sql || !(await retailShoppingListTablesAvailable(sql))) {
    throw new Error("Retail shopping list tables are not available");
  }

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
      notes,
      created_by_person_id,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${organisation.id}::uuid,
      ${orderNumber("SL")},
      'draft',
      ${organisation.currency},
      ${input.notes?.trim() || null},
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
    await sql`
      insert into public.retail_shopping_list_lines (
        shopping_list_id,
        organisation_id,
        product_id,
        required_quantity,
        current_stock_quantity,
        unordered_need_quantity,
        suggested_quantity,
        wholesaler_tried,
        availability_status,
        purchased_quantity,
        wholesale_price_amount,
        retail_price_amount,
        notes,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${shoppingListId}::uuid,
        ${organisation.id}::uuid,
        ${line.productId.trim()}::uuid,
        ${integerOrDefault(line.requiredQuantity, 0)},
        ${integerOrDefault(line.currentStockQuantity, 0)},
        ${integerOrDefault(line.unorderedNeedQuantity, 0)},
        ${integerOrDefault(line.suggestedQuantity, 0)},
        ${line.wholesalerTried?.trim() || null},
        ${shoppingListAvailabilityStatus(line.availabilityStatus)},
        ${integerOrDefault(line.purchasedQuantity, 0)},
        ${numberOrNull(line.wholesalePriceAmount)},
        ${numberOrNull(line.retailPriceAmount)},
        ${line.notes?.trim() || null},
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

export async function updateRetailShoppingList(
  context: AdminSessionContext,
  input: UpdateRetailShoppingListInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailShoppingListTablesAvailable(sql))) {
    throw new Error("Retail shopping list tables are not available");
  }

  const listRows = await sql<Array<{ id: string; organisation_id: string; status: string }>>`
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

  if (list.status === "applied") {
    throw new Error("Applied shopping lists cannot be edited");
  }

  for (const line of input.lines) {
    if (!line.id) {
      continue;
    }

    await sql`
      update public.retail_shopping_list_lines
      set
        required_quantity = ${integerOrDefault(line.requiredQuantity, 0)},
        current_stock_quantity = ${integerOrDefault(line.currentStockQuantity, 0)},
        unordered_need_quantity = ${integerOrDefault(line.unorderedNeedQuantity, 0)},
        suggested_quantity = ${integerOrDefault(line.suggestedQuantity, 0)},
        wholesaler_tried = ${line.wholesalerTried?.trim() || null},
        availability_status = ${shoppingListAvailabilityStatus(line.availabilityStatus)},
        purchased_quantity = ${integerOrDefault(line.purchasedQuantity, 0)},
        wholesale_price_amount = ${numberOrNull(line.wholesalePriceAmount)},
        retail_price_amount = ${numberOrNull(line.retailPriceAmount)},
        notes = ${line.notes?.trim() || null},
        updated_at = now()
      where id = ${line.id}::uuid
        and shopping_list_id = ${list.id}::uuid
        and organisation_id = ${list.organisation_id}::uuid
    `;
  }

  await sql`
    update public.retail_shopping_lists
    set
      status = ${shoppingListStatus(input.status)},
      notes = ${input.notes?.trim() || null},
      updated_at = now()
    where id = ${list.id}::uuid
  `;

  await recordAdminAudit({
    action: "admin.retail_shopping_list_updated",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: list.organisation_id,
    resourceId: list.id,
    resourceType: "retail_shopping_list",
    metadata: {
      lineCount: input.lines.length,
      status: shoppingListStatus(input.status)
    }
  });

  return list.id;
}

export async function applyRetailShoppingList(
  context: AdminSessionContext,
  input: Readonly<{ shoppingListId: string }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailShoppingListTablesAvailable(sql))) {
    throw new Error("Retail shopping list tables are not available");
  }

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

  if (list.status === "applied") {
    throw new Error("Shopping list has already been applied");
  }

  const lineRows = await sql<Array<{
    id: string;
    notes: string | null;
    product_id: string;
    purchased_quantity: number | string;
    retail_price_amount: number | string | null;
    wholesale_price_amount: number | string | null;
    wholesaler_tried: string | null;
  }>>`
    select
      id::text,
      product_id::text,
      purchased_quantity,
      wholesale_price_amount,
      retail_price_amount,
      wholesaler_tried,
      notes
    from public.retail_shopping_list_lines
    where shopping_list_id = ${list.id}::uuid
      and organisation_id = ${list.organisation_id}::uuid
    order by created_at
  `;

  for (const line of lineRows) {
    const purchasedQuantity = integerOrDefault(line.purchased_quantity, 0);
    const wholesalePriceAmount = numberOrNull(line.wholesale_price_amount);
    const retailPriceAmount = numberOrNull(line.retail_price_amount);

    if (purchasedQuantity > 0) {
      const stockId = await ensureRetailStockRow(context, {
        organisationId: list.organisation_id,
        productId: line.product_id,
        wholesalePriceAmount
      });

      await recordRetailStockMovement(context, {
        movementType: "receive",
        notes: line.notes,
        quantity: purchasedQuantity,
        reason: "Shopping list purchase",
        stockId,
        unitCostAmount: wholesalePriceAmount
      });
    }

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
          ${line.product_id}::uuid,
          'active',
          ${retailPriceAmount},
          ${wholesalePriceAmount},
          ${list.currency},
          0,
          'allow',
          ${line.notes},
          ${sql.json({
            shoppingListId: list.id,
            shoppingListLineId: line.id,
            updatedByPersonId: context.actorPerson.id,
            wholesalerTried: line.wholesaler_tried
          })},
          now(),
          now()
        )
        on conflict (organisation_id, product_id)
        do update set
          rrp_price_amount = coalesce(excluded.rrp_price_amount, retail_sellable_products.rrp_price_amount),
          wholesale_price_amount = coalesce(excluded.wholesale_price_amount, retail_sellable_products.wholesale_price_amount),
          currency = excluded.currency,
          metadata = retail_sellable_products.metadata || excluded.metadata,
          updated_at = now()
      `;
    }
  }

  await sql`
    update public.retail_shopping_lists
    set status = 'applied', applied_at = now(), updated_at = now()
    where id = ${list.id}::uuid
  `;

  await recordAdminAudit({
    action: "admin.retail_shopping_list_applied",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: list.organisation_id,
    resourceId: list.id,
    resourceType: "retail_shopping_list",
    metadata: {
      lineCount: lineRows.length,
      purchasedUnits: lineRows.reduce(
        (total, line) => total + integerOrDefault(line.purchased_quantity, 0),
        0
      )
    }
  });

  return list.id;
}

export async function createRetailPurchaseOrder(
  context: AdminSessionContext,
  input: CreateRetailPurchaseOrderInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const organisation = await organisationForStockWrite(
    sql,
    context,
    input.organisationId
  );
  const lines = input.lines.filter((line) => line.productId.trim());

  if (!input.supplierName.trim()) {
    throw new Error("Supplier is required");
  }

  if (lines.length < 1) {
    throw new Error("At least one purchase order line is required");
  }

  for (const line of lines) {
    if (!(await productApproved(sql, line.productId.trim()))) {
      throw new Error("Only approved master products can be ordered");
    }

    if (integerOrDefault(line.quantityOrdered, 0) < 1) {
      throw new Error("Purchase order quantity is required");
    }
  }

  const poNumber = input.poNumber?.trim() || orderNumber("PO");
  const purchaseRows = await sql<Array<{ id: string }>>`
    insert into public.retail_purchase_orders (
      organisation_id,
      po_number,
      supplier_name,
      supplier_contact,
      status,
      currency,
      expected_at,
      notes,
      created_by_person_id,
      metadata,
      created_at,
      updated_at
    )
    values (
      ${organisation.id}::uuid,
      ${poNumber},
      ${input.supplierName.trim()},
      ${input.supplierContact?.trim() || null},
      'draft',
      ${organisation.currency},
      ${isoDateOrNull(input.expectedAt)},
      ${input.notes?.trim() || null},
      ${context.actorPerson.id}::uuid,
      ${sql.json({
        assumedPersonId: context.assumedPerson?.id ?? null,
        source: "admin_retail_operations"
      })},
      now(),
      now()
    )
    returning id::text
  `;
  const purchaseOrderId = purchaseRows[0]?.id;

  if (!purchaseOrderId) {
    throw new Error("Purchase order could not be created");
  }

  for (const line of lines) {
    await sql`
      insert into public.retail_purchase_order_lines (
        purchase_order_id,
        organisation_id,
        product_id,
        quantity_ordered,
        wholesale_price_amount,
        expected_expires_at,
        notes,
        metadata,
        created_at,
        updated_at
      )
      values (
        ${purchaseOrderId}::uuid,
        ${organisation.id}::uuid,
        ${line.productId.trim()}::uuid,
        ${integerOrDefault(line.quantityOrdered, 1)},
        ${numberOrNull(line.wholesalePriceAmount)},
        ${isoDateOrNull(line.expectedExpiresAt)},
        ${line.notes?.trim() || null},
        ${sql.json({ source: "admin_retail_operations" })},
        now(),
        now()
      )
    `;
  }

  await recordAdminAudit({
    action: "admin.retail_purchase_order_created",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: organisation.id,
    resourceId: purchaseOrderId,
    resourceType: "retail_purchase_order",
    metadata: {
      lineCount: lines.length,
      poNumber,
      supplierName: input.supplierName.trim()
    }
  });

  await queuePurchaseOrderPlaceTask({
    expectedAt: input.expectedAt ?? null,
    organisationId: organisation.id,
    purchaseOrderId,
    supplierName: input.supplierName.trim()
  });

  return purchaseOrderId;
}

export async function createPurchaseOrderFromReorderAdvice(
  context: AdminSessionContext,
  input: Readonly<{
    adviceId: string;
    notes?: string | null;
    supplierName?: string | null;
  }>
) {
  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

  const rows = await sql<Array<{
    lead_time_days: number | string;
    organisation_id: string;
    product_id: string;
    suggested_order_quantity: number | string;
  }>>`
    select
      organisation_id::text,
      product_id::text,
      suggested_order_quantity,
      lead_time_days
    from public.retail_stock_reorder_advice
    where id = ${input.adviceId.trim()}::uuid
    limit 1
  `;
  const advice = rows[0];

  if (!advice) {
    throw new Error("Reorder advice not found");
  }

  const expectedAt = new Date(
    Date.now() + integerOrDefault(advice.lead_time_days, 0) * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);

  return createRetailPurchaseOrder(context, {
    expectedAt,
    lines: [
      {
        productId: advice.product_id,
        quantityOrdered: Math.max(
          1,
          integerOrDefault(advice.suggested_order_quantity, 1)
        )
      }
    ],
    notes: input.notes ?? "Created from reorder advice.",
    organisationId: advice.organisation_id,
    supplierName: input.supplierName?.trim() || "Supplier to confirm"
  });
}

export async function addLinesToDraftPurchaseOrder(
  context: AdminSessionContext,
  input: Readonly<{
    lines: RetailPurchaseOrderLineInput[];
    purchaseOrderId: string;
  }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const purchaseRows = await sql<Array<{
    expected_at: Date | string | null;
    id: string;
    organisation_id: string;
    supplier_name: string;
  }>>`
    select id::text, organisation_id::text, supplier_name, expected_at
    from public.retail_purchase_orders
    where id = ${input.purchaseOrderId.trim()}::uuid
      and status = 'draft'
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const purchaseOrder = purchaseRows[0];

  if (!purchaseOrder) {
    throw new Error("Draft purchase order not found");
  }

  const lines = input.lines.filter((line) => line.productId.trim());

  if (lines.length < 1) {
    throw new Error("At least one purchase order line is required");
  }

  for (const line of lines) {
    const productId = line.productId.trim();
    const quantityOrdered = integerOrDefault(line.quantityOrdered, 0);

    if (!(await productApproved(sql, productId))) {
      throw new Error("Only approved master products can be ordered");
    }

    if (quantityOrdered < 1) {
      throw new Error("Purchase order quantity is required");
    }

    const existingRows = await sql<Array<{ id: string }>>`
      select id::text
      from public.retail_purchase_order_lines
      where purchase_order_id = ${purchaseOrder.id}::uuid
        and product_id = ${productId}::uuid
      order by created_at asc
      limit 1
    `;
    const existing = existingRows[0];

    if (existing) {
      await sql`
        update public.retail_purchase_order_lines
        set
          quantity_ordered = quantity_ordered + ${quantityOrdered},
          wholesale_price_amount = coalesce(${numberOrNull(line.wholesalePriceAmount)}, wholesale_price_amount),
          notes = coalesce(${line.notes?.trim() || null}, notes),
          metadata = metadata || ${sql.json({
            addedByPersonId: context.actorPerson.id,
            source: "admin_backorder_task"
          })},
          updated_at = now()
        where id = ${existing.id}::uuid
      `;
    } else {
      await sql`
        insert into public.retail_purchase_order_lines (
          purchase_order_id,
          organisation_id,
          product_id,
          quantity_ordered,
          wholesale_price_amount,
          expected_expires_at,
          notes,
          metadata,
          created_at,
          updated_at
        )
        values (
          ${purchaseOrder.id}::uuid,
          ${purchaseOrder.organisation_id}::uuid,
          ${productId}::uuid,
          ${quantityOrdered},
          ${numberOrNull(line.wholesalePriceAmount)},
          ${isoDateOrNull(line.expectedExpiresAt)},
          ${line.notes?.trim() || null},
          ${sql.json({
            addedByPersonId: context.actorPerson.id,
            source: "admin_backorder_task"
          })},
          now(),
          now()
        )
      `;
    }
  }

  await queuePurchaseOrderPlaceTask({
    expectedAt: purchaseOrder.expected_at,
    organisationId: purchaseOrder.organisation_id,
    purchaseOrderId: purchaseOrder.id,
    supplierName: purchaseOrder.supplier_name
  });

  await recordAdminAudit({
    action: "admin.retail_purchase_order_lines_added",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: purchaseOrder.organisation_id,
    resourceId: purchaseOrder.id,
    resourceType: "retail_purchase_order",
    metadata: {
      lineCount: lines.length,
      source: "admin_backorder_task"
    }
  });

  return purchaseOrder.id;
}

export async function buildPurchaseOrderDraftFromBackorderTask(
  context: AdminSessionContext,
  input: BuildPurchaseOrderDraftFromBackorderTaskInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const taskRows = await sql<Array<{
    id: string;
    organisation_id: string;
    payload: unknown;
    source_entity_id: string | null;
    source_entity_type: string | null;
    status: string;
    task_type: string;
  }>>`
    select
      id::text,
      organisation_id::text,
      payload,
      source_entity_id::text,
      source_entity_type,
      status,
      task_type
    from public.tasks
    where id = ${input.taskId.trim()}::uuid
      and task_type in ('retail_stock_reorder_review', 'retail_stock_low_stock_review')
      and status not in ('completed', 'cancelled', 'skipped')
    limit 1
  `;
  const task = taskRows[0];

  if (!task || !canAccessRetailOrganisation(context, task.organisation_id)) {
    throw new Error("Backorder task not found");
  }

  const lines = input.lines.filter((line) => line.productId.trim());

  if (lines.length < 1) {
    throw new Error("At least one purchase order line is required");
  }

  const purchaseOrderId = input.purchaseOrderId?.trim()
    ? await addLinesToDraftPurchaseOrder(context, {
        lines,
        purchaseOrderId: input.purchaseOrderId
      })
    : await createRetailPurchaseOrder(context, {
        expectedAt: input.expectedAt ?? null,
        lines,
        notes: input.notes ?? "Created from backorder task.",
        organisationId: task.organisation_id,
        supplierContact: input.supplierContact ?? null,
        supplierName: input.supplierName?.trim() || "Supplier to confirm"
      });
  const payload = objectRecord(task.payload);
  const payloadProductId = stringMetadata(payload.productId);
  const pipelineRows = task.source_entity_type === "retail_customer_order"
    ? await getRetailStockPipeline({
        customerOrderId: task.source_entity_id,
        locale: context.effectivePerson.preferredLocale,
        organisationIds: [task.organisation_id],
        productId: payloadProductId,
        sql
      })
    : [];
  const unresolvedUnits = pipelineRows.reduce(
    (total, row) => total + row.unorderedNeedUnits,
    0
  );

  if (unresolvedUnits === 0) {
    await sql`
      update public.tasks
      set
        status = 'completed',
        completed_at = now(),
        context = coalesce(context, '{}'::jsonb) || ${sql.json({
          completedByDisplayName: context.actorPerson.displayName,
          completedByEmail: context.actorPerson.email,
          completedByPersonId: context.actorPerson.id,
          purchaseOrderId,
          workflowAction: "build_purchase_order"
        })},
        updated_at = now()
      where id = ${task.id}::uuid
    `;
  }

  await addTaskEvent({
    eventPayload: {
      actorPersonId: context.actorPerson.id,
      lineCount: lines.length,
      purchaseOrderId,
      unresolvedUnits
    },
    eventStatus: "succeeded",
    eventType: "retail_backorder_purchase_order_built",
    severity: unresolvedUnits === 0 ? "low" : "medium",
    taskId: task.id
  });

  await recordAdminAudit({
    action: "admin.retail_backorder_purchase_order_built",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: task.organisation_id,
    resourceId: purchaseOrderId,
    resourceType: "retail_purchase_order",
    metadata: {
      lineCount: lines.length,
      taskId: task.id,
      unresolvedUnits
    }
  });

  if (task.source_entity_type === "retail_customer_order" && task.source_entity_id) {
    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_backorder_purchase_order_built",
      eventStatus: unresolvedUnits === 0 ? "covered" : "partial",
      metadata: {
        purchaseOrderId,
        taskId: task.id,
        unresolvedUnits
      },
      orderId: task.source_entity_id,
      organisationId: task.organisation_id
    });
  }

  return purchaseOrderId;
}

export async function markRetailPurchaseOrderOrdered(
  context: AdminSessionContext,
  input: Readonly<{ purchaseOrderId: string }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const rows = await sql<Array<{
    expected_at: Date | string | null;
    id: string;
    organisation_id: string;
  }>>`
    update public.retail_purchase_orders
    set
      status = 'ordered',
      ordered_at = coalesce(ordered_at, now()),
      updated_at = now()
    where id = ${input.purchaseOrderId.trim()}::uuid
      and status in ('draft', 'ordered')
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    returning id::text, organisation_id::text, expected_at
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Purchase order cannot be marked ordered");
  }

  await recordAdminAudit({
    action: "admin.retail_purchase_order_ordered",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: row.organisation_id,
    resourceId: row.id,
    resourceType: "retail_purchase_order",
    metadata: {}
  });

  await completePurchaseOrderPlaceTask(sql, context, {
    organisationId: row.organisation_id,
    purchaseOrderId: row.id
  });

  await queueRetailOperationTask({
    description: "Receive this purchase order when supplier stock arrives.",
    dueAt: row.expected_at,
    idempotencyKey: `${row.id}:receive`,
    organisationId: row.organisation_id,
    priorityReason: row.expected_at
      ? "Purchase order has an expected receiving date."
      : "Purchase order has been placed and needs receiving.",
    priorityScore: 380,
    sourceEntityId: row.id,
    sourceEntityType: "retail_purchase_order",
    taskType: "retail_purchase_order_receive",
    title: "Receive purchase order"
  });

  return row.id;
}

export async function voidRetailPurchaseOrder(
  context: AdminSessionContext,
  input: Readonly<{ purchaseOrderId: string }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const rows = await sql<Array<{
    id: string;
    organisation_id: string;
  }>>`
    update public.retail_purchase_orders
    set
      status = 'cancelled',
      updated_at = now()
    where id = ${input.purchaseOrderId.trim()}::uuid
      and status in ('draft', 'ordered')
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    returning id::text, organisation_id::text
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Purchase order cannot be voided");
  }

  const cancelledTaskRows = await sql<Array<{
    from_status: string;
    id: string;
  }>>`
    with open_tasks as (
      select id, status
      from public.tasks
      where task_type = 'retail_purchase_order_receive'
        and source_entity_type = 'retail_purchase_order'
        and source_entity_id = ${row.id}::uuid
        and status not in ('completed', 'cancelled', 'skipped')
    ),
    cancelled as (
      update public.tasks
      set
        status = 'cancelled',
        result_payload = result_payload || ${sql.json({
          cancelledByAction: "void_purchase_order",
          cancelledByPersonId: context.actorPerson.id,
          purchaseOrderId: row.id
        })},
        updated_at = now()
      from open_tasks
      where public.tasks.id = open_tasks.id
      returning public.tasks.id::text, open_tasks.status as from_status
    )
    select id, from_status
    from cancelled
  `;

  for (const task of cancelledTaskRows) {
    await addTaskEvent({
      eventPayload: {
        action: "cancel",
        actorPersonId: context.actorPerson.id,
        cancelledByAction: "void_purchase_order",
        fromStatus: task.from_status,
        purchaseOrderId: row.id
      },
      eventStatus: "succeeded",
      eventType: "retail_task_cancel",
      severity: "low",
      taskId: task.id
    });
  }

  await recordAdminAudit({
    action: "admin.retail_purchase_order_voided",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: row.organisation_id,
    resourceId: row.id,
    resourceType: "retail_purchase_order",
    metadata: {
      cancelledTaskIds: cancelledTaskRows.map((task) => task.id)
    }
  });

  return row.id;
}

export async function receiveRetailPurchaseOrderLine(
  context: AdminSessionContext,
  input: ReceiveRetailPurchaseOrderLineInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const lineRows = await sql<Array<{
    currency: string;
    id: string;
    organisation_id: string;
    product_id: string;
    purchase_order_id: string;
    quantity_cancelled: number | string;
    quantity_ordered: number | string;
    quantity_received: number | string;
    wholesale_price_amount: number | string | null;
  }>>`
    select
      retail_purchase_order_lines.id::text,
      retail_purchase_order_lines.purchase_order_id::text,
      retail_purchase_order_lines.organisation_id::text,
      retail_purchase_order_lines.product_id::text,
      retail_purchase_order_lines.quantity_cancelled,
      retail_purchase_order_lines.quantity_ordered,
      retail_purchase_order_lines.quantity_received,
      retail_purchase_order_lines.wholesale_price_amount,
      retail_purchase_orders.currency
    from public.retail_purchase_order_lines
    join public.retail_purchase_orders
      on retail_purchase_orders.id = retail_purchase_order_lines.purchase_order_id
    where retail_purchase_order_lines.id = ${input.lineId.trim()}::uuid
      and retail_purchase_orders.status in ('ordered', 'partially_received')
      and (
        ${canReadAllRetailStock(context)}::boolean
        or retail_purchase_order_lines.organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const line = lineRows[0];

  if (!line) {
    throw new Error("Purchase order line cannot be received");
  }

  const remaining =
    integerOrDefault(line.quantity_ordered, 0) -
    integerOrDefault(line.quantity_received, 0) -
    integerOrDefault(line.quantity_cancelled, 0);
  const quantity = Number(input.quantity);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > remaining) {
    throw new Error("Receiving quantity must be a whole number within the remaining amount");
  }

  const stockId = await ensureRetailStockRow(context, {
    organisationId: line.organisation_id,
    productId: line.product_id,
    wholesalePriceAmount: numberOrNull(line.wholesale_price_amount)
  });

  const movementId = await recordRetailStockMovement(context, {
    expiresAt: input.expiresAt ?? null,
    movementType: "receive",
    notes: input.notes ?? null,
    quantity,
    reason: input.reason ?? "Purchase order receiving",
    stockId,
    unitCostAmount: numberOrNull(line.wholesale_price_amount)
  });

  await sql`
    update public.retail_purchase_order_lines
    set
      quantity_received = quantity_received + ${quantity},
      updated_at = now()
    where id = ${line.id}::uuid
  `;

  const totals = await sql<Array<{
    cancelled_units: number | string;
    ordered_units: number | string;
    received_units: number | string;
  }>>`
    select
      coalesce(sum(quantity_cancelled), 0)::int as cancelled_units,
      coalesce(sum(quantity_ordered), 0)::int as ordered_units,
      coalesce(sum(quantity_received), 0)::int as received_units
    from public.retail_purchase_order_lines
    where purchase_order_id = ${line.purchase_order_id}::uuid
  `;
  const cancelledUnits = integerOrDefault(totals[0]?.cancelled_units, 0);
  const orderedUnits = integerOrDefault(totals[0]?.ordered_units, 0);
  const receivedUnits = integerOrDefault(totals[0]?.received_units, 0);
  const nextStatus = purchaseOrderStatusFromTotals({
    cancelledUnits,
    orderedUnits,
    receivedUnits
  });
  const openUnits = Math.max(0, orderedUnits - receivedUnits - cancelledUnits);

  await sql`
    update public.retail_purchase_orders
    set
      status = ${nextStatus},
      received_at = case when ${nextStatus} = 'received' then now() else received_at end,
      updated_at = now()
    where id = ${line.purchase_order_id}::uuid
  `;

  await recordAdminAudit({
    action: "admin.retail_purchase_order_received",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: line.organisation_id,
    resourceId: line.purchase_order_id,
    resourceType: "retail_purchase_order",
    metadata: {
      lineId: line.id,
      movementId,
      productId: line.product_id,
      quantity,
      status: nextStatus
    }
  });

  if (openUnits > 0) {
    await queueRetailOperationTask({
      description: "Continue receiving the remaining purchase order quantities.",
      idempotencyKey: `${line.purchase_order_id}:receive:remaining`,
      organisationId: line.organisation_id,
      priorityReason: "Purchase order was partially received.",
      priorityScore: 520,
      sourceEntityId: line.purchase_order_id,
      sourceEntityType: "retail_purchase_order",
      taskType: "retail_purchase_order_receive",
      title: "Receive remaining purchase order"
    });
  } else {
    await completePurchaseOrderReceiveTasks(sql, context, {
      organisationId: line.organisation_id,
      purchaseOrderId: line.purchase_order_id,
      workflowAction: "receive_purchase_order_lines"
    });
  }

  const awaitingOrderRows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
  }>>`
    select
      retail_customer_orders.id::text as id,
      retail_customer_orders.due_at
    from public.retail_customer_orders
    where retail_customer_orders.organisation_id = ${line.organisation_id}::uuid
      and retail_customer_orders.status = 'awaiting_stock'
      and exists (
        select 1
        from public.retail_customer_order_lines
        where retail_customer_order_lines.customer_order_id = retail_customer_orders.id
          and retail_customer_order_lines.product_id = ${line.product_id}::uuid
      )
    order by retail_customer_orders.due_at nulls last, retail_customer_orders.id::text
    limit 50
  `;

  for (const awaitingOrder of awaitingOrderRows) {
    await queueRetailOperationTask({
      description:
        "Supplier stock has been received. Re-run allocation for this waiting customer order.",
      dueAt: awaitingOrder.due_at,
      idempotencyKey: `${awaitingOrder.id}:allocate`,
      organisationId: line.organisation_id,
      priorityReason: "Received stock may now cover a backordered customer order.",
      priorityScore: 810,
      sourceEntityId: awaitingOrder.id,
      sourceEntityType: "retail_customer_order",
      taskType: "retail_customer_order_allocate",
      title: "Allocate received stock"
    });
  }

  return movementId;
}

export async function reconcileRetailPurchaseOrderLineShortfall(
  context: AdminSessionContext,
  input: ReconcileRetailPurchaseOrderLineShortfallInput
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql || !(await retailOperationsTablesAvailable(sql))) {
    throw new Error("Retail operations tables are not available");
  }

  const lineRows = await sql<Array<{
    id: string;
    organisation_id: string;
    product_id: string;
    purchase_order_id: string;
    quantity_cancelled: number | string;
    quantity_ordered: number | string;
    quantity_received: number | string;
  }>>`
    select
      retail_purchase_order_lines.id::text,
      retail_purchase_order_lines.purchase_order_id::text,
      retail_purchase_order_lines.organisation_id::text,
      retail_purchase_order_lines.product_id::text,
      retail_purchase_order_lines.quantity_cancelled,
      retail_purchase_order_lines.quantity_ordered,
      retail_purchase_order_lines.quantity_received
    from public.retail_purchase_order_lines
    join public.retail_purchase_orders
      on retail_purchase_orders.id = retail_purchase_order_lines.purchase_order_id
    where retail_purchase_order_lines.id = ${input.lineId.trim()}::uuid
      and retail_purchase_orders.status in ('ordered', 'partially_received')
      and (
        ${canReadAllRetailStock(context)}::boolean
        or retail_purchase_order_lines.organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const line = lineRows[0];

  if (!line) {
    throw new Error("Purchase order line shortfall cannot be reconciled");
  }

  const shortfallQuantity =
    integerOrDefault(line.quantity_ordered, 0) -
    integerOrDefault(line.quantity_received, 0) -
    integerOrDefault(line.quantity_cancelled, 0);

  if (shortfallQuantity < 1) {
    return line.id;
  }

  const resolution = shortfallResolution(input.resolution);
  const closesUnits = shortfallResolutionClosesUnits(resolution);
  const expectedAt = isoDateOrNull(input.expectedAt ?? null);
  const reference = input.reference?.trim() || null;
  const notes = input.notes?.trim() || null;
  const reason =
    input.reason?.trim() ?? "Purchase order receive-time shortfall reconciliation";

  await sql.begin(async (transaction) => {
    await transaction`
      insert into public.retail_purchase_order_line_shortfalls (
        purchase_order_id,
        purchase_order_line_id,
        organisation_id,
        product_id,
        quantity,
        resolution,
        reference,
        expected_at,
        notes,
        metadata,
        created_by_person_id
      )
      values (
        ${line.purchase_order_id}::uuid,
        ${line.id}::uuid,
        ${line.organisation_id}::uuid,
        ${line.product_id}::uuid,
        ${shortfallQuantity},
        ${resolution},
        ${reference},
        ${expectedAt},
        ${notes},
        ${transaction.json({
          closedShort: closesUnits,
          reason
        })}::jsonb,
        ${context.actorPerson.id}::uuid
      )
    `;

    await transaction`
      update public.retail_purchase_order_lines
      set
        quantity_cancelled = quantity_cancelled + case
          when ${closesUnits}::boolean then ${shortfallQuantity}
          else 0
        end,
        metadata = metadata || ${transaction.json({
          lastShortfallAt: new Date().toISOString(),
          lastShortfallByPersonId: context.actorPerson.id,
          lastShortfallClosedShort: closesUnits,
          lastShortfallExpectedAt: expectedAt,
          lastShortfallQuantity: shortfallQuantity,
          lastShortfallReference: reference,
          lastShortfallResolution: resolution,
          lastShortfallReason: reason
        })}::jsonb,
        notes = case
          when ${notes}::text is null then notes
          when notes is null or notes = '' then ${notes}
          else notes || E'\n' || ${notes}
        end,
        updated_at = now()
      where id = ${line.id}::uuid
    `;
  });

  const totals = await sql<Array<{
    cancelled_units: number | string;
    ordered_units: number | string;
    received_units: number | string;
  }>>`
    select
      coalesce(sum(quantity_cancelled), 0)::int as cancelled_units,
      coalesce(sum(quantity_ordered), 0)::int as ordered_units,
      coalesce(sum(quantity_received), 0)::int as received_units
    from public.retail_purchase_order_lines
    where purchase_order_id = ${line.purchase_order_id}::uuid
  `;
  const cancelledUnits = integerOrDefault(totals[0]?.cancelled_units, 0);
  const orderedUnits = integerOrDefault(totals[0]?.ordered_units, 0);
  const receivedUnits = integerOrDefault(totals[0]?.received_units, 0);
  const nextStatus = purchaseOrderStatusFromTotals({
    cancelledUnits,
    orderedUnits,
    receivedUnits
  });
  const openUnits = Math.max(0, orderedUnits - receivedUnits - cancelledUnits);

  await sql`
    update public.retail_purchase_orders
    set
      status = ${nextStatus},
      received_at = case when ${nextStatus} = 'received' then now() else received_at end,
      metadata = metadata || ${sql.json({
        lastShortfallAt: new Date().toISOString(),
        lastShortfallClosedShort: closesUnits,
        lastShortfallResolution: resolution
      })}::jsonb,
      updated_at = now()
    where id = ${line.purchase_order_id}::uuid
  `;

  await recordAdminAudit({
    action: "admin.retail_purchase_order_shortfall_reconciled",
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: line.organisation_id,
    resourceId: line.purchase_order_id,
    resourceType: "retail_purchase_order",
    metadata: {
      closedShort: closesUnits,
      expectedAt,
      lineId: line.id,
      productId: line.product_id,
      quantity: shortfallQuantity,
      reference,
      resolution,
      status: nextStatus
    }
  });

  await writeFulfillmentBpmEvent({
    eventName: "retail_purchase_order_shortfall_reconciled",
    eventStatus: resolution,
    fulfillmentOrderId: line.purchase_order_id,
    locale: context.effectivePerson.preferredLocale,
    properties: {
      actorPersonId: context.actorPerson.id,
      closedShort: closesUnits,
      organisationId: line.organisation_id,
      productId: line.product_id,
      purchaseOrderLineId: line.id,
      quantity: shortfallQuantity,
      resolution
    },
    sql
  });

  if (openUnits > 0) {
    await queueRetailOperationTask({
      description: closesUnits
        ? "Receive the remaining supplier-owned purchase order quantities."
        : "Supplier still owes stock for this purchase order. Follow up and receive it when it arrives.",
      dueAt: expectedAt,
      idempotencyKey: `${line.purchase_order_id}:receive:remaining`,
      organisationId: line.organisation_id,
      priorityReason: closesUnits
        ? "Purchase order still has open receiving quantities."
        : "Supplier backorder remains open after receiving.",
      priorityScore: closesUnits ? 520 : 540,
      sourceEntityId: line.purchase_order_id,
      sourceEntityType: "retail_purchase_order",
      taskType: "retail_purchase_order_receive",
      title: "Receive remaining purchase order"
    });
  } else {
    await completePurchaseOrderReceiveTasks(sql, context, {
      organisationId: line.organisation_id,
      purchaseOrderId: line.purchase_order_id,
      workflowAction: "reconcile_purchase_order_shortfall"
    });
  }

  if (!closesUnits) {
    return line.id;
  }

  const awaitingOrderRows = await sql<Array<{
    due_at: Date | string | null;
    id: string;
    order_number: string;
  }>>`
    select
      retail_customer_orders.id::text as id,
      retail_customer_orders.order_number,
      retail_customer_orders.due_at
    from public.retail_customer_orders
    where retail_customer_orders.organisation_id = ${line.organisation_id}::uuid
      and retail_customer_orders.status = 'awaiting_stock'
      and exists (
        select 1
        from public.retail_customer_order_lines
        where retail_customer_order_lines.customer_order_id = retail_customer_orders.id
          and retail_customer_order_lines.product_id = ${line.product_id}::uuid
      )
    order by retail_customer_orders.due_at nulls last, retail_customer_orders.id::text
    limit 50
  `;

  for (const awaitingOrder of awaitingOrderRows) {
    const pipelineRows = await getRetailStockPipeline({
      customerOrderId: awaitingOrder.id,
      locale: context.effectivePerson.preferredLocale,
      organisationIds: [line.organisation_id],
      productId: line.product_id,
      sql
    });
    const unorderedNeedUnits = pipelineRows.reduce(
      (total, row) => total + row.unorderedNeedUnits,
      0
    );

    if (unorderedNeedUnits < 1) {
      continue;
    }

    const productName = pipelineRows[0]?.productTitle ?? line.product_id;

    await queueRetailOperationTask({
      description:
        "Supplier shortfall closed purchase order coverage. Build a replacement draft purchase order or add this gap to an existing draft PO.",
      dueAt: awaitingOrder.due_at,
      idempotencyKey: `${awaitingOrder.id}:${line.product_id}:shortfall:${line.id}`,
      organisationId: line.organisation_id,
      payload: {
        customerOrderId: awaitingOrder.id,
        productId: line.product_id,
        productName,
        shortfallPurchaseOrderLineId: line.id,
        shortfallQuantity,
        shortfallResolution: resolution,
        unorderedNeedUnits
      },
      priorityReason:
        `${productName} for ${awaitingOrder.order_number}: supplier shortfall closed ${shortfallQuantity}; unordered demand is now ${unorderedNeedUnits}.`,
      priorityScore: 860,
      sourceEntityId: awaitingOrder.id,
      sourceEntityType: "retail_customer_order",
      taskType: "retail_stock_reorder_review",
      title: `Order ${unorderedNeedUnits} units for ${awaitingOrder.order_number}`
    });

    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_purchase_order_shortfall_reopened_demand",
      eventStatus: "unordered_demand_reopened",
      metadata: {
        productId: line.product_id,
        productName,
        purchaseOrderId: line.purchase_order_id,
        shortfallPurchaseOrderLineId: line.id,
        shortfallQuantity,
        shortfallResolution: resolution,
        unorderedNeedUnits
      },
      orderId: awaitingOrder.id,
      organisationId: line.organisation_id
    });
  }

  return line.id;
}

export async function markRetailPurchaseOrderLineMissing(
  context: AdminSessionContext,
  input: MarkRetailPurchaseOrderLineMissingInput
) {
  return reconcileRetailPurchaseOrderLineShortfall(context, {
    ...input,
    reason: input.reason ?? "Supplier shortfall closed at receiving",
    resolution: input.resolution ?? "close_short"
  });
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

    await queueRetailOperationTask({
      description: hasBackorder
        ? "Allocate available stock and keep the remaining quantity waiting for receiving."
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
      description:
        "Build a draft purchase order or add this gap to an existing draft PO.",
      dueAt: preparedLine.etaDate,
      idempotencyKey: `${orderId}:${productId}:backorder-reorder-review`,
      organisationId: organisation.id,
      payload: {
        backorderQuantity: preparedLine.backorderQuantity,
        customerOrderId: orderId,
        draftPoUnits: pipeline?.draftPoUnits ?? 0,
        incomingUnits: pipeline?.incomingUnits ?? 0,
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
        }, incoming ${pipeline?.incomingUnits ?? 0}, draft PO ${
          pipeline?.draftPoUnits ?? 0
        }, unordered ${unorderedNeedUnits}.`,
      priorityScore: 860,
      profitImpactAmount:
        preparedLine.priceAmount * integerOrDefault(preparedLine.line.quantityOrdered, 1),
      profitImpactCurrency: organisation.currency,
      sourceEntityId: orderId,
      sourceEntityType: "retail_customer_order",
      taskType: "retail_stock_reorder_review",
      title: `Order ${Math.max(1, unorderedNeedUnits)} units for ${orderNumberValue}`
    });

  }

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
      description:
        "Build a draft purchase order, add this gap to an existing draft PO, or choose a substitution.",
      idempotencyKey: `${input.order.id}:${gap.productId}:awaiting-stock`,
      organisationId: input.order.organisation_id,
      payload: {
        customerOrderId: input.order.id,
        draftPoUnits: pipeline?.draftPoUnits ?? 0,
        incomingUnits: pipeline?.incomingUnits ?? 0,
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
        }, incoming ${pipeline?.incomingUnits ?? 0}, draft PO ${
          pipeline?.draftPoUnits ?? 0
        }, unordered ${unorderedNeedUnits}.`,
      priorityScore: 780,
      sourceEntityId: input.order.id,
      sourceEntityType: "retail_customer_order",
      taskType: "retail_stock_low_stock_review",
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

    throw new Error(
      "No live stock is available to allocate. Recheck reorder and purchase order tasks."
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
    eventName: fullyAllocated
      ? "retail_order_allocated"
      : "retail_order_allocation_blocked",
    eventStatus: nextStatus,
    metadata: {
      fullyAllocated,
      status: nextStatus
    },
    orderId: order.id,
    organisationId: order.organisation_id
  });

  if (fullyAllocated) {
    await queueRetailOperationTask({
      description: "Pick allocated stock for this customer order.",
      dueAt: order.due_at,
      idempotencyKey: `${order.id}:pick`,
      organisationId: order.organisation_id,
      priorityReason: "Order has allocated stock and is ready to pick.",
      priorityScore: 650,
      sourceEntityId: order.id,
      sourceEntityType: "retail_customer_order",
      taskType: "retail_order_pick",
      title: "Pick customer order"
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
    customerOrderId: string;
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
    organisation_id: string;
    status: string;
  }>>`
    select id::text, organisation_id::text, status, due_at
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

  const nextStatusByAction: Record<typeof input.action, RetailCustomerOrderStatus> = {
    cancel: "cancelled",
    mark_delivered: "delivered",
    mark_packed: "packed",
    mark_picking: "picking",
    mark_shipped: "shipped",
    return: "returned"
  };
  const nextStatus = nextStatusByAction[input.action];
  const requiredTaskTypes =
    input.action === "mark_picking"
      ? ["retail_order_pick"]
      : input.action === "mark_packed"
        ? ["retail_order_pack"]
        : input.action === "mark_shipped"
          ? ["retail_order_ship"]
          : [];

  await assertOrderWorkflowTaskClaimable(sql, context, {
    orderId: order.id,
    organisationId: order.organisation_id,
    taskTypes: requiredTaskTypes
  });

  if (input.action === "mark_shipped") {
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
      updated_at = now()
    where id = ${order.id}::uuid
  `;

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
      toStatus: nextStatus
    }
  });

  if (requiredTaskTypes.length > 0) {
    await completeOrderWorkflowTask(sql, context, {
      action: input.action,
      orderId: order.id,
      organisationId: order.organisation_id,
      taskTypes: requiredTaskTypes
    });
  }

  await recordRetailOrderBpmEvent(sql, context, {
    eventName:
      nextStatus === "shipped"
        ? "retail_order_shipped"
        : nextStatus === "delivered"
          ? "retail_order_delivered"
          : nextStatus === "cancelled"
            ? "retail_order_cancelled"
            : nextStatus === "returned"
              ? "retail_order_returned"
              : "retail_order_status_transition",
    eventStatus: nextStatus,
    metadata: {
      action: input.action,
      fromStatus: order.status,
      toStatus: nextStatus
    },
    orderId: order.id,
    organisationId: order.organisation_id
  });

  const nextTask =
    input.action === "mark_picking"
      ? {
          taskType: "retail_order_pack",
          title: "Pack customer order",
          reason: "Picked order is ready to pack.",
          score: 640
        }
      : input.action === "mark_packed"
        ? {
            taskType: "retail_order_ship",
            title: "Ship customer order",
            reason: "Packed order is ready to ship.",
            score: 720
          }
        : null;

  if (nextTask) {
    await queueRetailOperationTask({
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
    status: string;
  }>>`
    select id::text, organisation_id::text, status, due_at
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
            ? "retail_stock_low_stock_review"
            : pipeline.incomingUnits > 0
              ? "retail_purchase_order_receive"
              : pipeline.draftPoUnits > 0
                ? "retail_purchase_order_place_order"
                : null
      : expectedTaskTypeForStage(stage);

  if (!expectedTaskType) {
    await recordAdminAudit({
      action: "admin.retail_order_lifecycle_reconciled",
      actorPersonId: context.actorPerson.id,
      assumedPersonId: context.assumedPerson?.id ?? null,
      organisationId: order.organisation_id,
      resourceId: order.id,
      resourceType: "retail_customer_order",
      metadata: {
        repaired: false,
        stage,
        status: order.status
      }
    });

    await recordRetailOrderBpmEvent(sql, context, {
      eventName: "retail_order_lifecycle_reconciled",
      eventStatus: "on_track",
      metadata: {
        repaired: false,
        stage,
        status: order.status
      },
      orderId: order.id,
      organisationId: order.organisation_id
    });

    return order.id;
  }

  const expectedTaskTypes =
    expectedTaskType === "retail_stock_low_stock_review"
      ? ["retail_stock_reorder_review", "retail_stock_low_stock_review"]
      : [expectedTaskType];
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
  let repaired = false;

  if (!hasExpectedTask) {
    const taskDetails =
      expectedTaskType === "retail_customer_order_allocate"
        ? {
            description: "Allocate stock to this customer order.",
            priorityReason: "Lifecycle reconciliation restored the allocation task.",
            priorityScore: 700,
            title: "Allocate customer order"
          }
        : expectedTaskType === "retail_stock_reorder_review"
          ? {
              description:
                "Review stock gap, reorder, purchase order, or receiving work for this waiting order.",
              priorityReason:
                "Lifecycle reconciliation restored stock-gap review work.",
              priorityScore: 780,
              title: "Review customer order stock gap"
            }
          : expectedTaskType === "retail_stock_low_stock_review"
            ? {
                description:
                  "Build a draft purchase order or add this customer demand to an existing draft PO.",
                priorityReason:
                  "Lifecycle reconciliation restored stock-gap ordering work.",
                priorityScore: 780,
                title: "Review customer order stock gap"
              }
            : expectedTaskType === "retail_purchase_order_receive"
              ? {
                  description:
                    "Receive incoming supplier stock so this customer order can be allocated.",
                  priorityReason:
                    "Lifecycle reconciliation restored receiving work for waiting demand.",
                  priorityScore: 720,
                  title: "Receive stock for customer order"
                }
              : expectedTaskType === "retail_purchase_order_place_order"
                ? {
                    description:
                      "Place the draft purchase order covering this customer demand.",
                    priorityReason:
                      "Lifecycle reconciliation restored purchase order placement work.",
                    priorityScore: 740,
                    title: "Place purchase order"
                  }
          : expectedTaskType === "retail_order_pick"
            ? {
                description: "Pick allocated stock for this customer order.",
                priorityReason: "Lifecycle reconciliation restored the pick task.",
                priorityScore: 650,
                title: "Pick customer order"
              }
            : expectedTaskType === "retail_order_pack"
              ? {
                  description: "Pack the picked customer order.",
                  priorityReason:
                    "Lifecycle reconciliation restored the pack task.",
                  priorityScore: 640,
                  title: "Pack customer order"
                }
              : {
                  description: "Ship the packed customer order.",
                  priorityReason:
                    "Lifecycle reconciliation restored the ship task.",
                  priorityScore: 720,
                  title: "Ship customer order"
                };

    await queueRetailOperationTask({
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
      stage,
      status: order.status
    }
  });

  await recordRetailOrderBpmEvent(sql, context, {
    eventName: "retail_order_lifecycle_reconciled",
    eventStatus: repaired ? "repaired" : "on_track",
    metadata: {
      expectedTaskType,
      repaired,
      stage,
      status: order.status
    },
    orderId: order.id,
    organisationId: order.organisation_id
  });

  return order.id;
}

export async function updateRetailOperationsTask(
  context: AdminSessionContext,
  input: Readonly<{
    action: RetailOperationsTaskAction;
    taskId: string;
  }>
) {
  if (!canWriteRetailStock(context)) {
    throw new Error("Stock write permission is required");
  }

  const sql = getSql();

  if (!sql) {
    throw new Error("Database is not configured");
  }

	  const taskRows = await sql<Array<{
	    is_claimed: boolean;
	    id: string;
	    organisation_id: string;
	    payload: unknown;
	    priority_score: number | string;
	    source_entity_id: string | null;
	    source_entity_type: string | null;
	    status: string;
	    task_type: string;
	  }>>`
	    select
	      id::text,
	      organisation_id::text,
	      status,
	      task_type,
	      source_entity_type,
	      source_entity_id::text,
	      payload,
	      priority_score,
	      context ? 'claimedByPersonId' as is_claimed
    from public.tasks
    where id = ${input.taskId.trim()}::uuid
      and task_type like 'retail_%'
      and (
        ${canReadAllRetailStock(context)}::boolean
        or organisation_id = ${context.effectiveOrganisation.id}::uuid
      )
    limit 1
  `;
  const task = taskRows[0];

  if (!task) {
    throw new Error("Retail task not found");
  }

  if (input.action === "claim") {
    await sql`
      update public.tasks
      set
        status = 'running',
        started_at = coalesce(started_at, now()),
        context = context || ${sql.json({
          claimedByDisplayName: context.actorPerson.displayName,
          claimedByEmail: context.actorPerson.email,
          claimedByPersonId: context.actorPerson.id
        })},
        updated_at = now()
      where id = ${task.id}::uuid
        and status in ('queued', 'needs_review', 'waiting_approval')
    `;
	  } else if (input.action === "complete") {
	    if (!task.is_claimed) {
	      throw new Error("Task must be claimed before it can be completed");
	    }

	    if (
	      task.task_type === "retail_stock_reorder_review" ||
	      task.task_type === "retail_stock_low_stock_review"
	    ) {
	      const taskPayload = objectRecord(task.payload);
	      const productId = stringMetadata(taskPayload.productId);
	      const pipelineRows = task.source_entity_type === "retail_customer_order" && task.source_entity_id
	        ? await getRetailStockPipeline({
	            customerOrderId: task.source_entity_id,
	            locale: context.effectivePerson.preferredLocale,
	            organisationIds: [task.organisation_id],
	            productId,
	            sql
	          })
	        : [];
	      const unresolvedUnits = pipelineRows.reduce(
	        (total, row) => total + row.unorderedNeedUnits,
	        0
	      );

	      if (unresolvedUnits > 0) {
	        throw new Error("Build a draft purchase order before completing this task");
	      }
	    }

	    if (
	      task.task_type === "retail_purchase_order_place_order" &&
	      task.source_entity_type === "retail_purchase_order" &&
	      task.source_entity_id
	    ) {
	      const purchaseRows = await sql<Array<{ status: string }>>`
	        select status
	        from public.retail_purchase_orders
	        where id = ${task.source_entity_id}::uuid
	        limit 1
	      `;

	      if (purchaseRows[0]?.status === "draft") {
	        throw new Error("Place the purchase order before completing this task");
	      }
	    }

	    await sql`
      update public.tasks
      set status = 'completed', completed_at = now(), updated_at = now()
      where id = ${task.id}::uuid
        and status not in ('completed', 'cancelled', 'skipped')
    `;
  } else if (input.action === "snooze") {
    await sql`
      update public.tasks
      set
        status = 'queued',
        scheduled_for = now() + interval '1 day',
        due_at = coalesce(due_at, now() + interval '1 day'),
        updated_at = now()
      where id = ${task.id}::uuid
        and status not in ('completed', 'cancelled', 'skipped')
    `;
  } else if (input.action === "escalate") {
    await sql`
      update public.tasks
      set
        priority_score = least(10000, priority_score + 150),
        priority_reason = coalesce(priority_reason || ' ', '') || 'Escalated by admin.',
        updated_at = now()
      where id = ${task.id}::uuid
        and status not in ('completed', 'cancelled', 'skipped')
    `;
  } else if (input.action === "cancel") {
    await sql`
      update public.tasks
      set status = 'cancelled', updated_at = now()
      where id = ${task.id}::uuid
        and status not in ('completed', 'cancelled', 'skipped')
    `;
  } else {
    await sql`
      update public.tasks
      set
        priority_score = greatest(200, business_value),
        priority_reason = coalesce(priority_reason, 'Priority recalculated from business value.'),
        updated_at = now()
      where id = ${task.id}::uuid
        and status not in ('completed', 'cancelled', 'skipped')
    `;
  }

  await addTaskEvent({
    eventPayload: {
      action: input.action,
      actorPersonId: context.actorPerson.id,
      fromStatus: task.status,
      previousPriorityScore: integerOrDefault(task.priority_score, 0)
    },
    eventStatus: "succeeded",
    eventType: `retail_task_${input.action}`,
    severity: input.action === "cancel" || input.action === "escalate" ? "medium" : "low",
    taskId: task.id
  });

  await recordAdminAudit({
    action: `admin.retail_task_${input.action}`,
    actorPersonId: context.actorPerson.id,
    assumedPersonId: context.assumedPerson?.id ?? null,
    organisationId: task.organisation_id,
    resourceId: task.id,
    resourceType: "task",
    metadata: {
      status: task.status
    }
  });

  return task.id;
}
