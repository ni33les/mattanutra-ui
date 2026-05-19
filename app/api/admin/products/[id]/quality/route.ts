import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { isUuid } from "@/lib/assessment-store";
import { runProductQualityCheck } from "@/lib/admin-products";

export const runtime = "nodejs";

type AdminProductQualityRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, 2000) : null;
}

export async function POST(
  request: Request,
  { params }: AdminProductQualityRouteProps
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textOrNull(body.accessToken);

  if (!adminDashboardOrClawRequestAllowed(request, accessToken)) {
    return NextResponse.json(
      { message: "Not found" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404
      }
    );
  }

  if (!isUuid(id)) {
    return NextResponse.json(
      { message: "Product not found" },
      {
        headers: { "Cache-Control": "no-store" },
        status: 404
      }
    );
  }

  try {
    const row = await runProductQualityCheck({
      actor: "admin_dashboard",
      productId: id
    });

    return NextResponse.json(
      { productQuality: row.productQuality, row },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Unable to check product quality", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to check product quality"
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 500
      }
    );
  }
}

