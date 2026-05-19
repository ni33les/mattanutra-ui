import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { removeProductAffiliateLink } from "@/lib/admin-products";
import { isUuid } from "@/lib/assessment-store";

export const runtime = "nodejs";

type ProductAffiliateLinkRouteProps = Readonly<{
  params: Promise<{
    id: string;
    linkId: string;
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
  { params }: ProductAffiliateLinkRouteProps
) {
  const { id, linkId } = await params;
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

  if (!isUuid(id) || !isUuid(linkId)) {
    return NextResponse.json(
      { message: "Product link not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  try {
    const row = await removeProductAffiliateLink({
      actor: "admin_dashboard",
      linkId,
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
    console.error("Unable to remove product affiliate link", error);

    return NextResponse.json(
      { message: "Unable to remove product affiliate link" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
