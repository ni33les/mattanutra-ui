import { NextResponse, type NextRequest } from "next/server";
import { normalizeAdminDashboardRange } from "@/lib/admin-dashboard-data";
import { requireAdminRouteAccess } from "@/lib/admin-route-auth";
import {
  confirmRetailSettlementReceived,
  getAdminRetailFinancialsData,
  markRetailSettlementPaid,
  markRetailSettlementReview,
  retailFinancialsCsv
} from "@/lib/admin-retail-financials";
import { isLocale } from "@/lib/i18n";

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

export async function GET(request: NextRequest) {
  const { context, unauthorized } = await requireAdminRouteAccess(
    request,
    "finance.read"
  );

  if (unauthorized) {
    return unauthorized;
  }

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const range = normalizeAdminDashboardRange(url.searchParams.get("range") ?? undefined);
  const requestedLocale = url.searchParams.get("locale");
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const data = await getAdminRetailFinancialsData(context, range);

  if (url.searchParams.get("format") === "csv") {
    const filename = `retail-financials-${range}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(retailFinancialsCsv(data, locale), {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "text/csv; charset=utf-8"
      }
    });
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const { context, unauthorized } = await requireAdminRouteAccess(
    request,
    "finance.read"
  );

  if (unauthorized) {
    return unauthorized;
  }

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const action = text(body.action);

    if (action === "mark_paid") {
      const resourceId = await markRetailSettlementPaid(context, {
        paidAmount: numberOrNull(body.paidAmount),
        paidAt: text(body.paidAt) || null,
        paidMethod: text(body.paidMethod) || null,
        paidReference: text(body.paidReference) || null,
        settlementId: text(body.settlementId)
      });

      return NextResponse.json({ resourceId, updated: true });
    }

    if (action === "confirm_received") {
      const resourceId = await confirmRetailSettlementReceived(context, {
        confirmedReference: text(body.confirmedReference) || null,
        settlementId: text(body.settlementId)
      });

      return NextResponse.json({ resourceId, updated: true });
    }

    if (action === "mark_review") {
      const resourceId = await markRetailSettlementReview(context, {
        reason: text(body.reason) || null,
        settlementId: text(body.settlementId)
      });

      return NextResponse.json({ resourceId, updated: true });
    }

    return NextResponse.json(
      { error: "Unknown retail financials action" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Retail financials update failed"
      },
      { status: 400 }
    );
  }
}
