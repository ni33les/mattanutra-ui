import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession,
} from "@/lib/admin-access";
import { requestOriginAllowed } from "@/lib/admin-session-cookie";
import {
  getAdminRetailStockData,
  setRetailStockStatus,
  type RetailStockStatus,
  upsertRetailStockItem
} from "@/lib/admin-retail-stock";
import { hasAdminPermission } from "@/lib/admin-rbac";
import { isLocale, type Locale } from "@/lib/i18n";

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

function statusValue(value: unknown): RetailStockStatus {
  return value === "disabled" || value === "deleted" ? value : "active";
}

function localeValue(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const context = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });

  if (!context || !hasAdminPermission(context, "stock.write")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const action = text(body.action);
    const locale = localeValue(body.locale);

    if (action === "upsert_stock_item") {
      const productId = text(body.productId);

      if (!productId) {
        return NextResponse.json({ error: "Product is required" }, { status: 400 });
      }

      await upsertRetailStockItem(context, {
        expiresAt: text(body.expiresAt) || null,
        leadTimeDays: numberOrNull(body.leadTimeDays),
        notes: text(body.notes) || null,
        organisationId: text(body.organisationId) || null,
        productId,
        retailPriceAmount: numberOrNull(body.retailPriceAmount),
        status: statusValue(body.status),
        stockQuantity: numberOrNull(body.stockQuantity),
        wholesalePriceAmount: numberOrNull(body.wholesalePriceAmount)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    if (action === "set_stock_status") {
      await setRetailStockStatus(context, {
        id: text(body.id),
        status: statusValue(body.status)
      });

      return NextResponse.json({
        data: await getAdminRetailStockData(context, locale),
        updated: true
      });
    }

    return NextResponse.json({ error: "Unknown stock action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stock update failed" },
      { status: 400 }
    );
  }
}
