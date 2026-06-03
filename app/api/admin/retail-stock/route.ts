import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession,
} from "@/lib/admin-access";
import { requestOriginAllowed } from "@/lib/admin-session-cookie";
import {
  advanceRetailCustomerOrder,
  applyRetailShoppingList,
  allocateRetailCustomerOrder,
  buildPurchaseOrderDraftFromBackorderTask,
  createPurchaseOrderFromReorderAdvice,
  createRetailCustomerOrder,
  createRetailPurchaseOrder,
  createRetailShoppingList,
  getAdminRetailStockData,
  markRetailPurchaseOrderOrdered,
  markRetailPurchaseOrderLineMissing,
  recordRetailStockMovement,
  receiveRetailPurchaseOrderLine,
  reconcileRetailPurchaseOrderLineShortfall,
  reconcileRetailOrderLifecycle,
  setRetailStockStatus,
  updateRetailShoppingList,
  updateRetailOperationsTask,
  voidRetailPurchaseOrder,
  type CreateRetailCustomerOrderInput,
  type CreateRetailPurchaseOrderInput,
  type CreateRetailShoppingListInput,
  type RetailOperationsTaskAction,
  type RetailPurchaseOrderShortfallResolution,
  type RetailShoppingListAvailabilityStatus,
  type RetailShoppingListStatus,
  type RetailStockStatus,
  type UpdateRetailShoppingListInput,
  upsertRetailStockItem,
  voidRetailStockMovement
} from "@/lib/admin-retail-stock";
import { hasAdminPermission } from "@/lib/admin-rbac";
import { isLocale, type Locale } from "@/lib/i18n";
import { normalizeProductCountryCode } from "@/lib/product-countries";
import type { BackorderPolicy } from "@/lib/retail-cart-availability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function statusValue(value: unknown): RetailStockStatus {
  return value === "disabled" || value === "deleted" ? value : "active";
}

function backorderPolicyValue(value: unknown): BackorderPolicy {
  return value === "deny" ? "deny" : "allow";
}

function shoppingAvailabilityValue(
  value: unknown
): RetailShoppingListAvailabilityStatus {
  return value === "available" || value === "partial" || value === "not_available"
    ? value
    : "unknown";
}

function shoppingListStatusValue(value: unknown): RetailShoppingListStatus {
  return value === "closed" || value === "cancelled" ? value : "draft";
}

function movementValue(value: unknown) {
  return value === "sale" ||
    value === "adjustment" ||
    value === "return" ||
    value === "transfer_in" ||
    value === "transfer_out" ||
    value === "expiry_write_off"
    ? value
    : "receive";
}

function taskActionValue(value: unknown): RetailOperationsTaskAction {
  return value === "claim" ||
    value === "complete" ||
    value === "snooze" ||
    value === "escalate" ||
    value === "cancel" ||
    value === "recalculate"
    ? value
    : "claim";
}

function shortfallResolutionValue(
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

function linesValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

function localeValue(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}

function countryValue(value: unknown) {
  const countryCode = text(value);

  return countryCode ? normalizeProductCountryCode(countryCode) : null;
}

function actionFailureMessage(action: string) {
  if (action === "create_customer_order") {
    return "Customer order update failed";
  }

  return "Stock update failed";
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const context = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });

  if (!context || !hasAdminPermission(context, "stock.write")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = text(body.action);
  const locale = localeValue(body.locale);

  try {

    if (action === "upsert_stock_item") {
      const productId = text(body.productId);

      if (!productId) {
        return NextResponse.json({ error: "Product is required" }, { status: 400 });
      }

      await upsertRetailStockItem(context, {
        backorderPolicy: backorderPolicyValue(body.backorderPolicy),
        leadTimeDays: numberOrNull(body.leadTimeDays),
        notes: text(body.notes) || null,
        organisationId: text(body.organisationId) || null,
        productId,
        retailPriceAmount: numberOrNull(body.retailPriceAmount),
        status: statusValue(body.status),
        stockQuantity: numberOrNull(body.stockQuantity),
        wholesalePriceAmount: numberOrNull(body.wholesalePriceAmount)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "set_stock_status") {
      await setRetailStockStatus(context, {
        id: text(body.id),
        status: statusValue(body.status)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "record_stock_movement") {
      await recordRetailStockMovement(context, {
        expiresAt: text(body.expiresAt) || null,
        lotId: text(body.lotId) || null,
        movementType: movementValue(body.movementType),
        notes: text(body.notes) || null,
        quantity: Number(body.quantity),
        reason: text(body.reason) || null,
        retailPriceAmount: numberOrNull(body.retailPriceAmount),
        stockId: text(body.stockId),
        unitCostAmount: numberOrNull(body.unitCostAmount)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "void_stock_movement") {
      await voidRetailStockMovement(context, {
        movementId: text(body.movementId),
        notes: text(body.notes) || null,
        reason: text(body.reason) || null
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "create_shopping_list") {
      await createRetailShoppingList(context, {
        lines: linesValue(body.lines).map((line) => ({
          availabilityStatus: shoppingAvailabilityValue(line.availabilityStatus),
          currentStockQuantity: numberOrNull(line.currentStockQuantity),
          notes: text(line.notes) || null,
          productId: text(line.productId),
          purchasedQuantity: numberOrNull(line.purchasedQuantity),
          requiredQuantity: Number(line.requiredQuantity),
          retailPriceAmount: numberOrNull(line.retailPriceAmount),
          suggestedQuantity: numberOrNull(line.suggestedQuantity),
          unorderedNeedQuantity: numberOrNull(line.unorderedNeedQuantity),
          wholesalePriceAmount: numberOrNull(line.wholesalePriceAmount),
          wholesalerTried: text(line.wholesalerTried) || null
        })),
        notes: text(body.notes) || null,
        organisationId: text(body.organisationId) || null
      } satisfies CreateRetailShoppingListInput);

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "update_shopping_list") {
      await updateRetailShoppingList(context, {
        lines: linesValue(body.lines).map((line) => ({
          availabilityStatus: shoppingAvailabilityValue(line.availabilityStatus),
          currentStockQuantity: numberOrNull(line.currentStockQuantity),
          id: text(line.id) || null,
          notes: text(line.notes) || null,
          productId: text(line.productId),
          purchasedQuantity: numberOrNull(line.purchasedQuantity),
          requiredQuantity: Number(line.requiredQuantity),
          retailPriceAmount: numberOrNull(line.retailPriceAmount),
          suggestedQuantity: numberOrNull(line.suggestedQuantity),
          unorderedNeedQuantity: numberOrNull(line.unorderedNeedQuantity),
          wholesalePriceAmount: numberOrNull(line.wholesalePriceAmount),
          wholesalerTried: text(line.wholesalerTried) || null
        })),
        notes: text(body.notes) || null,
        shoppingListId: text(body.shoppingListId),
        status: shoppingListStatusValue(body.status)
      } satisfies UpdateRetailShoppingListInput);

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "apply_shopping_list") {
      await applyRetailShoppingList(context, {
        shoppingListId: text(body.shoppingListId)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "create_purchase_order") {
      await createRetailPurchaseOrder(context, {
        expectedAt: text(body.expectedAt) || null,
        lines: linesValue(body.lines).map((line) => ({
          expectedExpiresAt: text(line.expectedExpiresAt) || null,
          notes: text(line.notes) || null,
          productId: text(line.productId),
          quantityOrdered: Number(line.quantityOrdered),
          wholesalePriceAmount: numberOrNull(line.wholesalePriceAmount)
        })),
        notes: text(body.notes) || null,
        organisationId: text(body.organisationId) || null,
        poNumber: text(body.poNumber) || null,
        supplierContact: text(body.supplierContact) || null,
        supplierName: text(body.supplierName)
      } satisfies CreateRetailPurchaseOrderInput);

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "create_purchase_order_from_reorder_advice") {
      await createPurchaseOrderFromReorderAdvice(context, {
        adviceId: text(body.adviceId),
        notes: text(body.notes) || null,
        supplierName: text(body.supplierName) || null
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "build_purchase_order_from_backorder_task") {
      await buildPurchaseOrderDraftFromBackorderTask(context, {
        expectedAt: text(body.expectedAt) || null,
        lines: linesValue(body.lines).map((line) => ({
          expectedExpiresAt: text(line.expectedExpiresAt) || null,
          notes: text(line.notes) || null,
          productId: text(line.productId),
          quantityOrdered: Number(line.quantityOrdered),
          wholesalePriceAmount: numberOrNull(line.wholesalePriceAmount)
        })),
        notes: text(body.notes) || null,
        purchaseOrderId: text(body.purchaseOrderId) || null,
        supplierContact: text(body.supplierContact) || null,
        supplierName: text(body.supplierName) || null,
        taskId: text(body.taskId)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "mark_purchase_order_ordered") {
      await markRetailPurchaseOrderOrdered(context, {
        purchaseOrderId: text(body.purchaseOrderId)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "void_purchase_order") {
      await voidRetailPurchaseOrder(context, {
        purchaseOrderId: text(body.purchaseOrderId)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "receive_purchase_order_lines") {
      for (const line of linesValue(body.lines)) {
        const lineId = text(line.lineId);
        const quantity = Number(line.quantityReceived ?? line.quantity ?? 0);
        const shortfallResolution = shortfallResolutionValue(
          line.shortfallResolution
        );
        const reconcileShortfall =
          Boolean(line.reconcileShortfall) ||
          Boolean(line.markMissing) ||
          shortfallResolutionClosesUnits(shortfallResolution) ||
          Boolean(text(line.shortfallReference)) ||
          Boolean(text(line.shortfallExpectedAt));

        if (quantity > 0) {
          await receiveRetailPurchaseOrderLine(context, {
            expiresAt: null,
            lineId,
            notes: text(body.notes) || null,
            quantity,
            reason: text(body.reason) || null
          });
        }

        if (reconcileShortfall) {
          await reconcileRetailPurchaseOrderLineShortfall(context, {
            expectedAt: text(line.shortfallExpectedAt) || null,
            lineId,
            notes: text(body.notes) || null,
            reason: text(body.reason) || null,
            reference: text(line.shortfallReference) || null,
            resolution: Boolean(line.markMissing)
              ? "close_short"
              : shortfallResolution
          });
        }
      }

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "receive_purchase_order_line") {
      await receiveRetailPurchaseOrderLine(context, {
        expiresAt: null,
        lineId: text(body.lineId),
        notes: text(body.notes) || null,
        quantity: Number(body.quantity),
        reason: text(body.reason) || null
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "mark_purchase_order_line_missing") {
      await markRetailPurchaseOrderLineMissing(context, {
        lineId: text(body.lineId),
        notes: text(body.notes) || null,
        reason: text(body.reason) || null,
        resolution: "close_short"
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "create_customer_order") {
      const rawShippingCountry = text(body.shippingCountry);
      const shippingCountry = countryValue(body.shippingCountry);

      if (rawShippingCountry && !shippingCountry) {
        return NextResponse.json(
          { error: "Invalid shipping country" },
          { status: 400 }
        );
      }

      await createRetailCustomerOrder(context, {
        customerEmail: text(body.customerEmail) || null,
        customerName: text(body.customerName) || null,
        dueAt: text(body.dueAt) || null,
        lines: linesValue(body.lines).map((line) => ({
          notes: text(line.notes) || null,
          productId: text(line.productId),
          quantityOrdered: Number(line.quantityOrdered),
          retailPriceAmount: numberOrNull(line.retailPriceAmount)
        })),
        notes: text(body.notes) || null,
        orderNumber: text(body.orderNumber) || null,
        organisationId: text(body.organisationId) || null,
        routingPreference:
          text(body.routingPreference) === "cheapest_price"
            ? "cheapest_price"
            : "fastest_delivery",
        selectedRetailerOrganisationId:
          text(body.selectedRetailerOrganisationId) || null,
        shippingCountry,
        source: text(body.source) === "checkout" ? "checkout" : "manual"
      } satisfies CreateRetailCustomerOrderInput);

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "allocate_customer_order") {
      await allocateRetailCustomerOrder(context, {
        customerOrderId: text(body.customerOrderId)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "advance_customer_order") {
      const orderAction = text(body.orderAction);

      await advanceRetailCustomerOrder(context, {
        action:
          orderAction === "mark_picking" ||
          orderAction === "mark_packed" ||
          orderAction === "mark_shipped" ||
          orderAction === "mark_delivered" ||
          orderAction === "return" ||
          orderAction === "cancel"
            ? orderAction
            : "mark_picking",
        customerOrderId: text(body.customerOrderId)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "reconcile_customer_order_lifecycle") {
      await reconcileRetailOrderLifecycle(context, {
        customerOrderId: text(body.customerOrderId)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "update_retail_task") {
      await updateRetailOperationsTask(context, {
        action: taskActionValue(body.taskAction),
        taskId: text(body.taskId)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    return NextResponse.json({ error: "Unknown stock action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : actionFailureMessage(action)
      },
      { status: 400 }
    );
  }
}
