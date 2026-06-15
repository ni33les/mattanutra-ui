import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession,
} from "@/lib/admin-access";
import { requestOriginAllowed } from "@/lib/admin-session-cookie";
import {
  advanceRetailCustomerOrder,
  allocateRetailCustomerOrder,
  createRetailCustomerOrder,
  createRetailShoppingList,
  getAdminRetailStockData,
  recordRetailStockMovement,
  reconcileRetailOrderLifecycle,
  reopenRetailShoppingList,
  setRetailStockStatus,
  updateRetailShoppingList,
  type CreateRetailCustomerOrderInput,
  type CreateRetailShoppingListInput,
  type RetailShoppingListStatus,
  type RetailStockStatus,
  type UpdateRetailShoppingListInput,
  type UpdateRetailShoppingListResult,
  upsertRetailStockItem,
  voidRetailStockMovement
} from "@/lib/admin-retail-stock";
import { hasAdminPermission } from "@/lib/admin-rbac";
import {
  bookRetailOrderPickup,
  createRetailOrderShipment,
  generateRetailOrderShippingLabel,
  replayCarrierShipmentEvent,
  syncRetailOrderTracking,
  testRetailCarrierAccount,
  upsertRetailCarrierAccount
} from "@/lib/retail-carrier-shipments";
import { isLocale, type Locale } from "@/lib/i18n";
import { normalizeProductCountryCode } from "@/lib/product-countries";
import {
  executeRetailCommand,
  getRetailCommand,
  type RetailCommandId
} from "@/lib/retail-command-registry";
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

function shoppingListStatusValue(value: unknown): RetailShoppingListStatus {
  return value === "active" ? "active" : "closed";
}

function responseModeValue(value: unknown) {
  return value === "minimal" ? "minimal" : "full";
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

function linesValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

function objectValue(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

type RetailStockRouteHandler = (
  context: NonNullable<Awaited<ReturnType<typeof resolveAdminSession>>>,
  body: Record<string, unknown>
) => Promise<{
  resourceId: string | null;
  resourceType?: string | null;
  result: unknown;
}>;

function routeCommandId(action: string): RetailCommandId | null {
  const command = getRetailCommand(action);

  return command?.routeAction ? command.id : null;
}

const retailStockRouteHandlers: Partial<Record<RetailCommandId, RetailStockRouteHandler>> = {
  async upsert_stock_item(context, body) {
    const productId = text(body.productId);

    if (!productId) {
      throw new Error("Product is required");
    }

    const resourceId = await upsertRetailStockItem(context, {
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

    return { resourceId, result: { shoppingListId: resourceId } };
  },
  async set_stock_status(context, body) {
    const resourceId = await setRetailStockStatus(context, {
      id: text(body.id),
      status: statusValue(body.status)
    });

    return { resourceId, result: null };
  },
  async record_stock_movement(context, body) {
    const resourceId = await recordRetailStockMovement(context, {
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

    return { resourceId, result: null };
  },
  async void_stock_movement(context, body) {
    const resourceId = await voidRetailStockMovement(context, {
      movementId: text(body.movementId),
      notes: text(body.notes) || null,
      reason: text(body.reason) || null
    });

    return { resourceId, result: null };
  },
  async create_shopping_list(context, body) {
    const resourceId = await createRetailShoppingList(context, {
      lines: linesValue(body.lines).map((line) => ({
        actualQuantity: numberOrNull(line.actualQuantity),
        assignedQuantity: numberOrNull(line.assignedQuantity),
        currentStockQuantity: numberOrNull(line.currentStockQuantity),
        productId: text(line.productId),
        requiredQuantity: Number(line.requiredQuantity),
        retailPriceAmount: numberOrNull(line.retailPriceAmount),
        unorderedNeedQuantity: numberOrNull(line.unorderedNeedQuantity),
        wholesalePriceAmount: numberOrNull(line.wholesalePriceAmount)
      })),
      organisationId: text(body.organisationId) || null
    } satisfies CreateRetailShoppingListInput);

    return { resourceId, result: { shoppingListId: resourceId } };
  },
  async update_shopping_list(context, body) {
    const result: UpdateRetailShoppingListResult = await updateRetailShoppingList(context, {
      lines: linesValue(body.lines).map((line) => ({
        actualQuantity: numberOrNull(line.actualQuantity),
        assignedQuantity: numberOrNull(line.assignedQuantity),
        currentStockQuantity: numberOrNull(line.currentStockQuantity),
        id: text(line.id) || null,
        productId: text(line.productId),
        requiredQuantity: Number(line.requiredQuantity),
        retailPriceAmount: numberOrNull(line.retailPriceAmount),
        unorderedNeedQuantity: numberOrNull(line.unorderedNeedQuantity),
        wholesalePriceAmount: numberOrNull(line.wholesalePriceAmount)
      })),
      shoppingListId: text(body.shoppingListId),
      status: shoppingListStatusValue(body.status)
    } satisfies UpdateRetailShoppingListInput);

    return {
      resourceId: result.shoppingListId,
      result
    };
  },
  async reopen_shopping_list(context, body) {
    const resourceId = await reopenRetailShoppingList(context, {
      shoppingListId: text(body.shoppingListId)
    });

    return { resourceId, result: null };
  },
  async create_customer_order(context, body) {
    const rawShippingCountry = text(body.shippingCountry);
    const shippingCountry = countryValue(body.shippingCountry);

    if (rawShippingCountry && !shippingCountry) {
      throw new Error("Invalid shipping country");
    }

    const resourceId = await createRetailCustomerOrder(context, {
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

    return { resourceId, result: null };
  },
  async allocate_customer_order(context, body) {
    const resourceId = await allocateRetailCustomerOrder(context, {
      customerOrderId: text(body.customerOrderId)
    });

    return { resourceId, result: null };
  },
  async advance_customer_order(context, body) {
    const orderAction = text(body.orderAction);
    const resourceId = await advanceRetailCustomerOrder(context, {
      action:
        orderAction === "mark_picking" ||
        orderAction === "mark_packed" ||
        orderAction === "mark_shipped" ||
        orderAction === "mark_delivered" ||
        orderAction === "return" ||
        orderAction === "cancel"
          ? orderAction
          : "mark_picking",
      carrierName: text(body.carrierName) || null,
      customerOrderId: text(body.customerOrderId),
      shipmentNotes: text(body.shipmentNotes) || null,
      trackingNumber: text(body.trackingNumber) || null,
      trackingUrl: text(body.trackingUrl) || null
    });

    return { resourceId, result: null };
  },
  async configure_carrier_account(context, body) {
    const resourceId = await upsertRetailCarrierAccount(context, {
      capabilities: Array.isArray(body.capabilities)
        ? body.capabilities.map((capability) => text(capability)).filter(Boolean)
        : null,
      carrierId: text(body.carrierId) || null,
      carrierName: text(body.carrierName) || null,
      credentialMetadata: objectValue(body.credentialMetadata),
      encryptedCredentials: objectValue(body.encryptedCredentials),
      organisationId: text(body.organisationId) || null,
      status:
        text(body.status) === "disabled" || text(body.status) === "deleted"
          ? text(body.status) as "deleted" | "disabled"
          : "active"
    });

    return { resourceId, resourceType: "retail_carrier_account", result: null };
  },
  async create_order_shipment(context, body) {
    const resourceId = await createRetailOrderShipment(context, {
      carrierAccountId: text(body.carrierAccountId) || null,
      carrierId: text(body.carrierId) || null,
      carrierName: text(body.carrierName) || null,
      customerOrderId: text(body.customerOrderId),
      providerShipmentId: text(body.providerShipmentId) || null,
      trackingNumber: text(body.trackingNumber) || null,
      trackingUrl: text(body.trackingUrl) || null
    });

    return { resourceId, resourceType: "retail_order_shipment", result: null };
  },
  async test_carrier_account(context, body) {
    const result = await testRetailCarrierAccount(context, {
      carrierAccountId: text(body.carrierAccountId) || null,
      carrierId: text(body.carrierId) || null,
      organisationId: text(body.organisationId) || null
    });

    return {
      resourceId: result.accountId,
      resourceType: "retail_carrier_account",
      result
    };
  },
  async replay_carrier_shipment_event(context, body) {
    const resourceId = await replayCarrierShipmentEvent(context, {
      eventId: text(body.eventId)
    });

    return {
      resourceId,
      resourceType: "retail_order_shipment_event",
      result: null
    };
  },
  async generate_order_shipping_label(context, body) {
    const resourceId = await generateRetailOrderShippingLabel(context, {
      carrierId: text(body.carrierId) || null,
      carrierName: text(body.carrierName) || null,
      customerOrderId: text(body.customerOrderId),
      labelUrl: text(body.labelUrl) || null
    });

    return { resourceId, resourceType: "retail_order_shipment", result: null };
  },
  async book_order_pickup(context, body) {
    const resourceId = await bookRetailOrderPickup(context, {
      carrierId: text(body.carrierId) || null,
      carrierName: text(body.carrierName) || null,
      customerOrderId: text(body.customerOrderId),
      pickupProviderStatus: text(body.pickupProviderStatus) || null,
      pickupRequestId: text(body.pickupRequestId) || null,
      pickupWindowEnd: text(body.pickupWindowEnd) || null,
      pickupWindowStart: text(body.pickupWindowStart) || null,
      shipmentNotes: text(body.shipmentNotes) || null,
      trackingNumber: text(body.trackingNumber) || null,
      trackingUrl: text(body.trackingUrl) || null
    });

    return { resourceId, resourceType: "retail_order_shipment", result: null };
  },
  async sync_order_tracking(context, body) {
    const result = await syncRetailOrderTracking(context, {
      customerOrderId: text(body.customerOrderId) || null,
      shipmentId: text(body.shipmentId) || null
    });

    return {
      resourceId: text(body.shipmentId) || text(body.customerOrderId) || null,
      resourceType: "retail_order_shipment",
      result
    };
  },
  async reconcile_customer_order_lifecycle(context, body) {
    const resourceId = await reconcileRetailOrderLifecycle(context, {
      customerOrderId: text(body.customerOrderId)
    });

    return { resourceId, result: null };
  }
};

export async function GET(request: NextRequest) {
  const context = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });

  if (!context || !hasAdminPermission(context, "stock.read")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locale = localeValue(new URL(request.url).searchParams.get("locale"));

  try {
    return NextResponse.json({
      data: await getAdminRetailStockData(context, locale)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Unable to load retail stock"
      },
      { status: 400 }
    );
  }
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

  if (
    !context ||
    (
      !hasAdminPermission(context, "stock.write") &&
      !hasAdminPermission(context, "shipments.write") &&
      !hasAdminPermission(context, "shipments.configure")
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = text(body.action);
  const locale = localeValue(body.locale);
  const responseMode = responseModeValue(body.responseMode);
  const commandId = routeCommandId(action);
  const handler = commandId ? retailStockRouteHandlers[commandId] : null;

  try {
    if (!commandId || !handler) {
      return NextResponse.json({ error: "Unknown stock action" }, { status: 400 });
    }

    const mutationStartedAt = Date.now();
    const result = await executeRetailCommand({
      actorKind: "human",
      commandId,
      context,
      handler: () => handler(context, body),
      payload: body
    });
    const mutationMs = Date.now() - mutationStartedAt;

    if (responseMode === "minimal") {
      return NextResponse.json({
        result,
        timingsMs: {
          mutation: mutationMs,
          readModel: 0
        },
        updated: true
      });
    }

    const readModelStartedAt = Date.now();
    const data = await getAdminRetailStockData(context, locale);

    return NextResponse.json({
      data,
      timingsMs: {
        mutation: mutationMs,
        readModel: Date.now() - readModelStartedAt
      },
      updated: true
    });
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
