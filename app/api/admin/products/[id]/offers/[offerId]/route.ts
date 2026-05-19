import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { removeProductOffer } from "@/lib/admin-products";
import { isUuid } from "@/lib/assessment-store";

export const runtime = "nodejs";

type ProductOfferRouteProps = Readonly<{
  params: Promise<{
    id: string;
    offerId: string;
  }>;
}>;

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

export async function DELETE(
  request: Request,
  { params }: ProductOfferRouteProps
) {
  const { id, offerId } = await params;
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

  if (!isUuid(id) || !isUuid(offerId)) {
    return NextResponse.json(
      { message: "Product offer not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  try {
    const row = await removeProductOffer({
      actor: "admin_dashboard",
      offerId: offerId,
      productId: id
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
    console.error("Unable to remove product offer", error);

    return NextResponse.json(
      { message: "Unable to remove product offer" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
