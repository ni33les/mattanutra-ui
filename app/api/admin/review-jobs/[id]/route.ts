import { NextResponse } from "next/server";
import { adminDashboardTokenAllowed } from "@/lib/admin-auth";
import {
  decideAdminPlanReviewJob,
  dismissAdminReviewJob,
  resolveAdminReviewJob
} from "@/lib/admin-review-queue";
import {
  isSupplementConfidence,
  isSupplementListStatus,
  type SupplementConfidence,
  type SupplementListStatus
} from "@/lib/admin-supplements";
import { isUuid } from "@/lib/assessment-store";
import { normalizeSupplementSafetyFlags } from "@/lib/supplement-safety-flags";

export const runtime = "nodejs";

type AdminReviewJobRouteProps = Readonly<{
  params: Promise<{
    id: string;
  }>;
}>;

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
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
  { params }: AdminReviewJobRouteProps
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ?? textOrNull(body.accessToken);

  if (!adminDashboardTokenAllowed(accessToken)) {
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
      { message: "Review job not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  const action = textOrNull(body.action);

  if (
    action !== "approve" &&
    action !== "disapprove" &&
    action !== "dismiss" &&
    action !== "resolve"
  ) {
    return NextResponse.json(
      { message: "Unsupported review action" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const data =
      action === "dismiss"
        ? await dismissAdminReviewJob({
            actor: "admin_dashboard",
            id
          })
        : action === "approve" || action === "disapprove"
          ? await decideAdminPlanReviewJob({
              actor: "admin_dashboard",
              clientDoseAmount: amountValue(body.clientDoseAmount),
              clientDoseUnit: textOrNull(body.clientDoseUnit),
              decision: action,
              id,
              reviewerNote: textOrNull(body.reviewerNote)
            })
          : await resolveAdminReviewJob({
            actor: "admin_dashboard",
            category: textOrNull(body.category),
            confidence: parseConfidence(body.confidence) ?? "low",
            id,
            listStatus: parseListStatus(body.listStatus) ?? "review_required",
            maxAmount: amountValue(body.maxAmount),
            maxUnit: textOrNull(body.maxUnit) ?? "",
            safetyFlags: normalizeSupplementSafetyFlags(body.safetyFlags),
            safetyNotes: textOrNull(body.safetyNotes),
            supplementName: textOrNull(body.supplementName) ?? "Unknown supplement"
          });

    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Unable to update review job", {
      error: errorDetails(error),
      reviewJobId: id
    });

    return NextResponse.json(
      {
        details:
          process.env.NODE_ENV === "production" ? undefined : errorDetails(error),
        message: "Unable to update review job"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
