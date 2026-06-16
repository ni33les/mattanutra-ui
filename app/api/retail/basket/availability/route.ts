import { NextResponse } from "next/server";
import {
  normalizeRetailRoutingPreference,
  resolveRegionalBasketAvailability,
  type RegionalBasketLineInput
} from "@/lib/retail-cart-availability";
import { writeBpmEvent } from "@/lib/bpm";
import { isUuid } from "@/lib/assessment-store";
import { isLocale } from "@/lib/i18n";
import { normalizeProductCountryCode } from "@/lib/product-countries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function linesValue(value: unknown): RegionalBasketLineInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((line) => record(line))
    .map((line) => ({
      productId: text(line.productId),
      quantity: Number(line.quantity)
    }))
    .filter((line) => line.productId && Number.isFinite(line.quantity));
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = record(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shippingCountry = normalizeProductCountryCode(body.shippingCountry);
  const lines = linesValue(body.lines);
  const locale = isLocale(body.locale) ? body.locale : undefined;
  const planId = typeof body.planId === "string" && isUuid(body.planId)
    ? body.planId
    : null;
  const preferredRetailerOrganisationId =
    typeof body.selectedRetailerOrganisationId === "string" &&
    isUuid(body.selectedRetailerOrganisationId)
      ? body.selectedRetailerOrganisationId
      : null;
  const previewOnly = body.previewOnly === true;

  if (!shippingCountry || lines.length === 0) {
    return NextResponse.json(
      { error: "Shipping country and basket lines are required" },
      { status: 400 }
    );
  }

  const availability = await resolveRegionalBasketAvailability({
    lines,
    preference: normalizeRetailRoutingPreference(body.routingPreference),
    preferredRetailerOrganisationId,
    shippingCountry
  });

  void writeBpmEvent({
    actorType: planId ? "visitor" : "admin",
    emittedBy: planId ? "retail_product_checkout" : "admin_mock_basket",
    eventName: planId && !previewOnly
      ? "retail_delivery_details_confirmed"
      : availability.canCheckout
        ? "retail_basket_routing_preview"
        : "retail_basket_no_payable_local_lines",
    eventStatus: availability.canCheckout ? "available" : "blocked",
    eventType: "funnel",
    locale,
    planId,
    properties: {
      lineCount: availability.lines.length,
      payableLineCount: availability.payableLines.length,
      preference: availability.preference,
      selectedRetailerOrganisationId:
        availability.selectedRetailer?.organisationId ?? null,
      shippingAmount: availability.shippingAmount,
      shippingCountry,
      totalAmount: availability.totalAmount,
      unavailableLineCount: availability.unavailableLines.length
    }
  });

  return NextResponse.json(
    { availability },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
