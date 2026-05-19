import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { getAdminProductsData } from "@/lib/admin-products";
import { correctProductFactsWithAi } from "@/lib/product-fact-correction";

export const runtime = "nodejs";

function textOrNull(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function integerOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export async function POST(request: Request) {
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

  const brand = textOrNull(body.brand, 200)?.toLowerCase() ?? "";
  const status = textOrNull(body.status, 80);
  const limit = Math.min(20, Math.max(1, integerOrDefault(body.limit, 10)));

  try {
    const data = await getAdminProductsData();
    const rows = data.rows
      .filter((row) => !brand || row.brandName?.toLowerCase() === brand)
      .filter((row) => !status || row.listStatus === status || row.productQuality.status === status)
      .filter((row) => row.productQuality.status !== "pass" || row.listStatus !== "whitelisted")
      .slice(0, limit);
    const repaired = [];
    const failed = [];

    for (const row of rows) {
      const result = await correctProductFactsWithAi({
        actor: "admin_dashboard_bulk_ai_repair",
        productId: row.id
      });

      if (result.row.productQuality.status === "pass") {
        repaired.push(result.row);
      } else {
        failed.push({
          id: result.row.id,
          productQuality: result.row.productQuality,
          title: result.row.title
        });
      }
    }

    return NextResponse.json(
      {
        failed,
        inspected: rows.length,
        limit,
        repaired
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Unable to run product catalogue repair", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to run product catalogue repair"
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 500
      }
    );
  }
}

