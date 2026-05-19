import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  isProductAudience,
  isProductLabelStatus,
  isProductStatus,
  updateAdminProduct
} from "@/lib/admin-products";
import type {
  ProductAudience,
  ProductConfidence,
  ProductKind
} from "@/lib/product-recommendations";
import { isUuid } from "@/lib/assessment-store";

export const runtime = "nodejs";

type AdminProductRouteProps = Readonly<{
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

function normalizedKey(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replaceAll("-", "_")
    : "";
}

function parseOptionalNumber(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseProductKind(value: unknown): ProductKind | undefined {
  const normalized = normalizedKey(value);

  return normalized === "food" ||
    normalized === "multi" ||
    normalized === "other" ||
    normalized === "supplement"
    ? normalized
    : undefined;
}

function parseProductAudience(value: unknown): ProductAudience | undefined {
  const normalized = normalizedKey(value);

  return isProductAudience(normalized) ? normalized : undefined;
}

function factsFromBody(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const itemType: "food" | "nutrient" | "supplement" =
        item.itemType === "food" || item.itemType === "nutrient"
          ? item.itemType
          : "supplement";

      return {
        amount: parseOptionalNumber(item.amount) ?? null,
        confidence:
          item.confidence === "high" || item.confidence === "low"
            ? item.confidence as ProductConfidence
            : "moderate" as ProductConfidence,
        itemType,
        name: textOrNull(item.name, 500) ?? "",
        servingLabel: textOrNull(item.servingLabel, 200),
        sourceText: textOrNull(item.sourceText, 1000),
        sourceUrl: textOrNull(item.sourceUrl, 2000),
        supplementId: textOrNull(item.supplementId),
        unit: textOrNull(item.unit, 40)
      };
    })
    .filter((item) => item.name);
}

export async function PATCH(
  request: Request,
  { params }: AdminProductRouteProps
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

  if (!isUuid(id)) {
    return NextResponse.json(
      { message: "Product not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  const status = normalizedKey(body.status);
  const labelStatus = normalizedKey(body.labelStatus);
  const productKind = parseProductKind(body.productKind);
  const productAudience = parseProductAudience(body.productAudience);
  const title = body.title === undefined ? undefined : textOrNull(body.title, 500);
  const productUrl = body.productUrl === undefined
    ? undefined
    : textOrNull(body.productUrl, 2000);

  if (
    (body.title !== undefined && !title) ||
    (body.productUrl !== undefined && !productUrl) ||
    (body.status !== undefined && !isProductStatus(status)) ||
    (body.labelStatus !== undefined && !isProductLabelStatus(labelStatus)) ||
    (body.productKind !== undefined && !productKind) ||
    (body.productAudience !== undefined && !productAudience)
  ) {
    return NextResponse.json(
      { message: "Invalid product governance payload" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const row = await updateAdminProduct({
      actor: "admin_dashboard",
      adminNotes: textOrNull(body.adminNotes),
      brandName: body.brandName === undefined
        ? undefined
        : textOrNull(body.brandName, 200),
      description: body.description === undefined
        ? undefined
        : textOrNull(body.description, 4000),
      descriptionEn: body.descriptionEn === undefined
        ? undefined
        : textOrNull(body.descriptionEn, 4000),
      descriptionTh: body.descriptionTh === undefined
        ? undefined
        : textOrNull(body.descriptionTh, 4000),
      fdaApprovalNumber: body.fdaApprovalNumber === undefined
        ? undefined
        : textOrNull(body.fdaApprovalNumber),
      facts: factsFromBody(body.facts),
      id,
      imageUrl: body.imageUrl === undefined
        ? undefined
        : textOrNull(body.imageUrl, 2000),
      labelStatus: isProductLabelStatus(labelStatus) ? labelStatus : undefined,
      status: isProductStatus(status) ? status : undefined,
      productAudience,
      productKind,
      productUrl,
      title,
      titleEn: body.titleEn === undefined ? undefined : textOrNull(body.titleEn, 500),
      titleTh: body.titleTh === undefined ? undefined : textOrNull(body.titleTh, 500)
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
    console.error("Unable to update product", error);
    const message =
      error instanceof Error ? error.message : "Unable to update product";
    const blocked = message.startsWith("Product validation blocks approval:");

    return NextResponse.json(
      { message },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: blocked ? 400 : 500
      }
    );
  }
}
