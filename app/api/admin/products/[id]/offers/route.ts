import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  isProductAvailabilityStatus,
  upsertProductOffer
} from "@/lib/admin-products";
import { isUuid } from "@/lib/assessment-store";

export const runtime = "nodejs";

type ProductOffersRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function textOrNull(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizedKey(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replaceAll("-", "_")
    : "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function POST(
  request: Request,
  { params }: ProductOffersRouteProps
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textOrNull(body.accessToken);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return NextResponse.json(
      { message: "Not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  const availabilityStatus = normalizedKey(body.availabilityStatus);
  const linkType = normalizedKey(body.linkType);
  const status = normalizedKey(body.status);
  const url = textOrNull(body.url);

  if (
    !isUuid(id) ||
    !url ||
    (body.availabilityStatus !== undefined &&
      !isProductAvailabilityStatus(availabilityStatus)) ||
    (body.linkType !== undefined &&
      linkType !== "affiliate" &&
      linkType !== "direct") ||
    (body.status !== undefined &&
      status !== "active" &&
      status !== "flagged_stale" &&
      status !== "inactive")
  ) {
    return NextResponse.json(
      { message: "Invalid product offer payload" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const row = await upsertProductOffer({
      actor: "admin_dashboard",
      availabilityStatus: isProductAvailabilityStatus(availabilityStatus)
        ? availabilityStatus
        : undefined,
      commissionRate: numberOrNull(body.commissionRate),
      currency: textOrNull(body.currency, 20),
      linkType: linkType === "direct" ? "direct" : "affiliate",
      network: textOrNull(body.network, 100),
      platform: textOrNull(body.platform, 100),
      priceAmount: numberOrNull(body.priceAmount),
      priority: numberOrNull(body.priority) ?? undefined,
      productId: id,
      status:
        status === "flagged_stale" || status === "inactive"
          ? status
          : "active",
      trackingId: textOrNull(body.trackingId, 500),
      url
    });

    return NextResponse.json(
      { row },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Unable to add product offer", error);

    return NextResponse.json(
      { message: "Unable to add product offer" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
