import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import { isProductAudience, resolveProductImportReview } from "@/lib/admin-products";
import type { ProductImportFactInput } from "@/lib/admin-products";
import type { ProductAudience } from "@/lib/product-recommendations";
import {
  decideAdminPlanReviewTask,
  dismissAdminReviewTask,
  resolveAdminReviewTask,
  type AdminReviewLocalizedText
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

type AdminReviewTaskRouteProps = Readonly<{
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

function productImportFactsFromBody(value: unknown): ProductImportFactInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = item && typeof item === "object"
      ? item as Record<string, unknown>
      : null;
    const name = record ? textOrNull(record.name) : null;

    if (!record || !name) {
      return [];
    }

    return [{
      amount: amountValue(record.amount),
      confidence:
        record.confidence === "high" || record.confidence === "low"
          ? record.confidence
          : "moderate",
      itemType:
        record.itemType === "food" || record.itemType === "nutrient"
          ? record.itemType
          : "supplement",
      name,
      supplementId: textOrNull(record.supplementId),
      unit: textOrNull(record.unit)
    }];
  });
}

function localizedTextValue(value: unknown): AdminReviewLocalizedText | null {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed ? { en: trimmed, th: trimmed } : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const en = textOrNull(record.en);
  const th = textOrNull(record.th);
  const fallback = en ?? th;

  return fallback ? { en: en ?? fallback, th: th ?? fallback } : null;
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

function parseProductAudience(value: unknown): ProductAudience | undefined {
  const normalized = normalizedKey(value);

  return isProductAudience(normalized) ? normalized : undefined;
}

function countryCodesFromBody(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
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
  { params }: AdminReviewTaskRouteProps
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
      { message: "Review task not found" },
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
    action !== "approve_product" &&
    action !== "disapprove" &&
    action !== "dismiss" &&
    action !== "ignore_import" &&
    action !== "merge_product" &&
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

  const associatedSupplementId = textOrNull(body.associatedSupplementId);
  const productAudience = parseProductAudience(body.productAudience);

  if (body.productAudience !== undefined && !productAudience) {
    return NextResponse.json(
      { message: "Invalid product audience" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  if (associatedSupplementId && !isUuid(associatedSupplementId)) {
    return NextResponse.json(
      { message: "Invalid associated supplement" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const result =
      action === "approve_product" ||
      action === "ignore_import" ||
      action === "merge_product"
        ? await resolveProductImportReview({
            action:
              action === "approve_product"
                ? "approve"
                : action === "ignore_import"
                  ? "ignore"
                  : "duplicate",
            actor: "admin_dashboard",
            availableCountryCodes: countryCodesFromBody(body.availableCountryCodes),
            brandName: body.brandName === undefined
              ? undefined
              : textOrNull(body.brandName),
            description: body.description === undefined
              ? undefined
              : textOrNull(body.description),
            descriptionEn: body.descriptionEn === undefined
              ? undefined
              : textOrNull(body.descriptionEn),
            descriptionTh: body.descriptionTh === undefined
              ? undefined
              : textOrNull(body.descriptionTh),
            fdaApprovalNumber: body.fdaApprovalNumber === undefined
              ? undefined
              : textOrNull(body.fdaApprovalNumber),
            imageUrl: body.imageUrl === undefined
              ? undefined
              : textOrNull(body.imageUrl),
            manufacturerCountryCodes: countryCodesFromBody(body.manufacturerCountryCodes),
            mergeProductId: textOrNull(body.mergeProductId),
            parsedFacts: productImportFactsFromBody(body.parsedFacts),
            productAudience,
            productUrl: body.productUrl === undefined
              ? undefined
              : textOrNull(body.productUrl),
            reviewerNote: textOrNull(body.reviewerNote),
            taskId: id,
            title: body.title === undefined ? undefined : textOrNull(body.title),
            titleEn: body.titleEn === undefined ? undefined : textOrNull(body.titleEn),
            titleTh: body.titleTh === undefined ? undefined : textOrNull(body.titleTh)
          })
        : action === "dismiss"
        ? await dismissAdminReviewTask({
            actor: "admin_dashboard",
            id
          })
        : action === "approve" || action === "disapprove"
          ? await decideAdminPlanReviewTask({
              actor: "admin_dashboard",
              clientDoseAmount: amountValue(body.clientDoseAmount),
              clientDoseUnit: textOrNull(body.clientDoseUnit),
              decision: action,
              foodFrequency: localizedTextValue(body.foodFrequency),
              foodRationale: localizedTextValue(body.foodRationale),
              foodServing: localizedTextValue(body.foodServing),
              id,
              reviewerNote: textOrNull(body.reviewerNote)
            })
          : await resolveAdminReviewTask({
            actor: "admin_dashboard",
            associatedSupplementId,
            category: textOrNull(body.category),
            confidence: parseConfidence(body.confidence) ?? "low",
            id,
            listStatus: parseListStatus(body.listStatus) ?? "active",
            maxAmount: amountValue(body.maxAmount),
            maxUnit: textOrNull(body.maxUnit) ?? "",
            safetyFlags: normalizeSupplementSafetyFlags(body.safetyFlags),
            safetyNotes: textOrNull(body.safetyNotes),
            supplementName: textOrNull(body.supplementName) ?? "Unknown supplement"
          });

    return NextResponse.json(
      { result },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update review task";
    const status = message.startsWith("Product still needs review") ? 400 : 500;

    console.error("Unable to update review task", {
      error: errorDetails(error),
      reviewTaskId: id
    });

    return NextResponse.json(
      {
        details:
          process.env.NODE_ENV === "production" ? undefined : errorDetails(error),
        message
      },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status
      }
    );
  }
}
