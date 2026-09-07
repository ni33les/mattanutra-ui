import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
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
    return Response.json(
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
    return Response.json(
      { message: "Product fact was not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  return Response.json(
    {
      code: "reference_review_required",
      message: "Review reference source evidence in Supplements. A product's labelled dose cannot set or raise a global reference limit.",
      nextAction: "review_reference_evidence"
    },
    { headers: { "Cache-Control": "no-store" }, status: 410 }
  );
}
