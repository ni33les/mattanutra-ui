import { NextResponse } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import {
  createRetailCheckoutSession,
  isRetailCheckoutLocale,
  retailCheckoutAddressFromUnknown
} from "@/lib/retail-product-checkout";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};

  try {
    body = record(await request.json());
  } catch {
    body = {};
  }

  const locale = isRetailCheckoutLocale(body.locale) ? body.locale : null;
  const planId = typeof body.planId === "string" ? body.planId : "";
  const selectedItemIds = stringArray(body.selectedItemIds);

  if (!locale || !isUuid(planId) || selectedItemIds.length < 1) {
    return NextResponse.json(
      { message: "Invalid basket checkout request" },
      { headers: { "Cache-Control": "no-store" }, status: 400 }
    );
  }

  try {
    const session = await createRetailCheckoutSession({
      address: retailCheckoutAddressFromUnknown(body.address),
      billingAddress: retailCheckoutAddressFromUnknown(body.billingAddress),
      billingSameAsShipping: body.billingSameAsShipping !== false,
      locale,
      planId,
      removedItemIds: stringArray(body.removedItemIds),
      request,
      selectedItemIds
    });

    return NextResponse.json(session, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
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
