import { NextResponse } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { queuePlatformAdminCommunication } from "@/lib/communications";
import { createLogger } from "@/lib/logger";
import {
  enforceRateLimit,
  publicRateLimits
} from "@/lib/rate-limit";
import {
  createRetailCheckoutSession,
  isRetailCheckoutLocale,
  retailCheckoutAddressFromUnknown
} from "@/lib/retail-product-checkout";

export const runtime = "nodejs";

const log = createLogger("api.retail.checkout.session");

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function frozenLinesFromUnknown(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const row = record(item);
    const productId = typeof row.productId === "string" ? row.productId : "";
    const productName = typeof row.productName === "string" ? row.productName : "";
    const quantity = Math.max(1, Math.floor(Number(row.quantity) || 0));
    const unitPriceAmount = Number(row.unitPriceAmount);

    if (!productId || !productName || !Number.isFinite(unitPriceAmount) || unitPriceAmount < 0) {
      return [];
    }

    return [{
      productId,
      productName,
      quantity,
      retailerSku: typeof row.retailerSku === "string" ? row.retailerSku : null,
      unitPriceAmount
    }];
  });
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(
    request,
    publicRateLimits.retailCheckoutSession
  );

  if (limited) {
    return limited;
  }

  let body: Record<string, unknown> = {};

  try {
    body = record(await request.json());
  } catch {
    body = {};
  }

  const locale = isRetailCheckoutLocale(body.locale) ? body.locale : null;
  const planId = typeof body.planId === "string" ? body.planId : "";
  const mode = body.mode === "agentic" ? "agentic" : "web";
  const frozenLines = frozenLinesFromUnknown(body.frozenLines);
  const selectedItemIds = stringArray(body.selectedItemIds);
  const selectedRetailerOrganisationId =
    typeof body.selectedRetailerOrganisationId === "string" &&
    isUuid(body.selectedRetailerOrganisationId)
      ? body.selectedRetailerOrganisationId
      : null;
  const agenticOrderId =
    typeof body.agenticOrderId === "string" && body.agenticOrderId.trim()
      ? body.agenticOrderId.trim()
      : null;
  const shippingAmount =
    body.shippingAmount == null ? null : Number(body.shippingAmount);

  if (
    !locale ||
    !isUuid(planId) ||
    (mode === "web" && selectedItemIds.length < 1) ||
    (mode === "agentic" && frozenLines.length < 1)
  ) {
    return NextResponse.json(
      { message: "Invalid basket checkout request" },
      { headers: { "Cache-Control": "no-store" }, status: 400 }
    );
  }

  if (mode === "agentic" && (body.agentAuthorized !== true || !agenticOrderId)) {
    return NextResponse.json(
      { message: "AI-agent authorization is required." },
      { headers: { "Cache-Control": "no-store" }, status: 400 }
    );
  }

  try {
    const session = await createRetailCheckoutSession({
      address: retailCheckoutAddressFromUnknown(body.address),
      agentAuthorized: body.agentAuthorized === true,
      agenticOrderId,
      billingAddress: retailCheckoutAddressFromUnknown(body.billingAddress),
      billingSameAsShipping: body.billingSameAsShipping !== false,
      frozenLines,
      locale,
      mode,
      planId,
      removedItemIds: stringArray(body.removedItemIds),
      request,
      selectedRetailerOrganisationId,
      selectedItemIds:
        selectedItemIds.length > 0
          ? selectedItemIds
          : frozenLines.map((line) => line.productId),
      shippingAmount:
        shippingAmount != null && Number.isFinite(shippingAmount)
          ? shippingAmount
          : null
    });

    return NextResponse.json(session, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    try {
      await queuePlatformAdminCommunication({
        eventKey: "platform_checkout_failed",
        metadata: {
          errorMessage:
            error instanceof Error ? error.message : "Unable to create basket checkout",
          locale,
          planId,
          selectedItemCount: selectedItemIds.length,
          source: "retail_checkout_session_api"
        },
        resourceId: isUuid(planId) ? planId : null,
        resourceType: isUuid(planId) ? "assessment_plan" : "retail_checkout_request"
      });
    } catch (notificationError) {
      log.warn("Unable to queue platform retail checkout failure notification", {
        error: notificationError
      });
    }

    log.warn("Unable to create basket checkout", { error, planId });

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to create basket checkout"
      },
      { headers: { "Cache-Control": "no-store" }, status: 400 }
    );
  }
}
