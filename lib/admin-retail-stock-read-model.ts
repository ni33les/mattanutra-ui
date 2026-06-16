import {
  integerOrDefault,
  isoDateOrNull,
  isoDateTime,
  isoDateTimeOrNull,
  lotStatus,
  movementType,
  numberOrNull,
  shoppingListStatus,
  stockBackorderPolicy,
  stockStatus
} from "@/lib/admin-retail-stock-codecs";
import type {
  AdminRetailCarrierAccount,
  AdminRetailShoppingList,
  AdminRetailShoppingListLine,
  AdminRetailStockLot,
  AdminRetailStockMovement,
  AdminRetailStockProductOption,
  AdminRetailStockReorderAdvice,
  AdminRetailStockRow
} from "@/lib/admin-retail-stock";

export type RetailCarrierAccountRow = Readonly<{
  capabilities: string[];
  carrier_id: string;
  display_name: string | null;
  id: string;
  last_test_status: string | null;
  last_tested_at: Date | string | null;
  organisation_id: string;
  status: string;
  updated_at: Date | string;
}>;

export type RetailProductOptionRow = Readonly<{
  brand_name: string | null;
  ean13: string | null;
  id: string;
  image_url: string | null;
  manufacturer_sku: string | null;
  product_kind: string;
  title: string;
}>;

export type RetailStockLotRow = Readonly<{
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
}>;

export type RetailStockMovementRow = Readonly<{
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
}>;

export type RetailStockReorderAdviceRow = Readonly<{
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
}>;

export type RetailStockRow = Readonly<{
  backorder_policy: string | null;
  brand_name: string | null;
  currency: string;
  ean13: string | null;
  id: string;
  image_url: string | null;
  lead_time_days: number | string;
  manufacturer_sku: string | null;
  notes: string | null;
  organisation_id: string;
  organisation_name: string;
  product_id: string;
  product_kind: string;
  product_status: string;
  product_title: string;
  retail_override_price_amount: string | number | null;
  retail_price_amount: string | number | null;
  retail_sellable_product_id: string | null;
  status: string;
  stock_quantity: number | string;
  updated_at: Date | string;
  wholesale_price_amount: string | number | null;
}>;

export type RetailShoppingListLineRow = Readonly<{
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
}>;

export type RetailShoppingListRow = Readonly<{
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
}>;

export function mapRetailCarrierAccountRow(
  row: RetailCarrierAccountRow
): AdminRetailCarrierAccount {
  return {
    capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
    carrierId: row.carrier_id,
    displayName: row.display_name,
    id: row.id,
    lastTestStatus: row.last_test_status,
    lastTestedAt: isoDateTimeOrNull(row.last_tested_at),
    organisationId: row.organisation_id,
    status: row.status,
    updatedAt: isoDateTime(row.updated_at)
  };
}

export function mapRetailProductOptionRow(
  row: RetailProductOptionRow
): AdminRetailStockProductOption {
  return {
    brandName: row.brand_name,
    ean13: row.ean13,
    id: row.id,
    imageUrl: row.image_url,
    manufacturerSku: row.manufacturer_sku,
    productKind: row.product_kind,
    title: row.title
  };
}

export function mapRetailStockLotRow(row: RetailStockLotRow): AdminRetailStockLot {
  return {
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
  };
}

export function mapRetailStockMovementRow(
  row: RetailStockMovementRow
): AdminRetailStockMovement {
  return {
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
  };
}

export function mapRetailStockReorderAdviceRow(
  row: RetailStockReorderAdviceRow
): AdminRetailStockReorderAdvice {
  return {
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
  };
}

export function mapRetailStockRow(row: RetailStockRow): AdminRetailStockRow {
  return {
    backorderPolicy: stockBackorderPolicy(row.backorder_policy),
    brandName: row.brand_name,
    currency: row.currency,
    ean13: row.ean13,
    id: row.id,
    imageUrl: row.image_url,
    leadTimeDays: integerOrDefault(row.lead_time_days, 0),
    manufacturerSku: row.manufacturer_sku,
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
  };
}

export function mapRetailShoppingListLineRow(
  row: RetailShoppingListLineRow
): AdminRetailShoppingListLine {
  return {
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
  };
}

export function mapRetailShoppingListRow(
  row: RetailShoppingListRow
): AdminRetailShoppingList {
  return {
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
  };
}
