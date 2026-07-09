import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRouteAccess } from "@/lib/admin-route-auth";
import { isLocale, type Locale } from "@/lib/i18n";
import { renderRetailPlanInsertPdfForOrder } from "@/lib/retail-plan-insert";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteProps = Readonly<{
  params: Promise<{
    orderId: string;
  }>;
}>;

function localeFromRequest(request: NextRequest): Locale | null {
  const value = new URL(request.url).searchParams.get("locale");

  return isLocale(value) ? value : null;
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  const { context, unauthorized } = await requireAdminRouteAccess(
    request,
    "stock.read"
  );

  if (unauthorized) {
    return unauthorized;
  }

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const allowedOrganisationIds =
    context.effectiveOrganisation.type === "platform"
      ? null
      : [context.effectiveOrganisation.id];
  const rendered = await renderRetailPlanInsertPdfForOrder({
    allowedOrganisationIds,
    locale: localeFromRequest(request),
    orderId
  });

  if (!rendered) {
    return NextResponse.json(
      { error: "No linked personalized plan is available for this order" },
      { status: 404 }
    );
  }

  const body = new Uint8Array(rendered.buffer);

  return new NextResponse(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="${rendered.filename}"`,
      "Content-Type": "application/pdf"
    }
  });
}
