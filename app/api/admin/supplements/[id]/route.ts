import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  isSupplementConfidence,
  isSupplementListStatus,
  type SupplementConfidence,
  type SupplementListStatus,
  updateAdminSupplement
} from "@/lib/admin-supplements";
import { isUuid } from "@/lib/assessment-store";
import { normalizeSupplementSafetyFlags } from "@/lib/supplement-safety-flags";

export const runtime = "nodejs";

type AdminSupplementRouteProps = Readonly<{
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

function amountValue(value: unknown) {
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizedKey(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replaceAll("-", "_")
    : "";
}

function parseListStatus(value: unknown): SupplementListStatus | null {
  const normalized = normalizedKey(value);

  return isSupplementListStatus(normalized) ? normalized : null;
}

function parseConfidence(value: unknown): SupplementConfidence | null {
  const normalized = normalizedKey(value);

  return isSupplementConfidence(normalized) ? normalized : null;
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  const databaseError = error as Error & {
    code?: string;
    column_name?: string;
    constraint_name?: string;
    detail?: string;
    table_name?: string;
  };

  return {
    code: databaseError.code,
    column: databaseError.column_name,
    constraint: databaseError.constraint_name,
    detail: databaseError.detail,
    message: error.message,
    name: error.name,
    table: databaseError.table_name
  };
}

export async function PATCH(
  request: Request,
  { params }: AdminSupplementRouteProps
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

  if (!isUuid(id)) {
    return NextResponse.json(
      { message: "Supplement not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  const listStatus = parseListStatus(body.listStatus);
  const confidence = parseConfidence(body.confidence);
  const safetyFlags = normalizeSupplementSafetyFlags(body.safetyFlags);

  if (!listStatus) {
    return NextResponse.json(
      { message: "Invalid supplement list status" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  if (!confidence) {
    return NextResponse.json(
      { message: "Invalid supplement confidence" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const row = await updateAdminSupplement({
      actor: "admin_dashboard",
      confidence,
      id,
      listStatus,
      maxAmount: amountValue(body.maxAmount),
      maxUnit: textOrNull(body.maxUnit) ?? "",
      safetyFlags,
      safetyNotes: textOrNull(body.safetyNotes)
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
    console.error("Unable to update supplement", {
      error: errorDetails(error),
      supplementId: id
    });

    return NextResponse.json(
      { message: "Unable to update supplement" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
