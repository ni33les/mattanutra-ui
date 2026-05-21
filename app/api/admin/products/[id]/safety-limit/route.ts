import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { increaseProductFactSafetyLimit } from "@/lib/admin-products";
import { isUuid } from "@/lib/assessment-store";

export const runtime = "nodejs";

type AdminProductSafetyLimitRouteProps = Readonly<{
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

export async function POST(
  request: Request,
  { params }: AdminProductSafetyLimitRouteProps
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
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

  const factId = textOrNull(body.factId, 80);

  if (!isUuid(id) || !isUuid(factId ?? "")) {
    return NextResponse.json(
      { message: "Product fact was not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  try {
    const result = await increaseProductFactSafetyLimit({
      actor: "admin_dashboard",
      factId: factId!,
      productId: id
    });

    return NextResponse.json(
      {
        revalidatedProductIds: result.revalidatedProductIds,
        rows: result.revalidatedRows,
        row: result.row
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Unable to increase product safety limit", error);

    return NextResponse.json(
      {
        message: error instanceof Error
          ? error.message
          : "Unable to increase product safety limit"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }
}
