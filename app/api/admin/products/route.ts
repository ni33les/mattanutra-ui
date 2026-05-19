import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  createAdminProduct,
  isProductAudience,
  isProductLabelStatus,
  isProductStatus,
  isProductPlatform
} from "@/lib/admin-products";
import type {
  ProductAudience,
  ProductConfidence,
  ProductKind
} from "@/lib/product-recommendations";

export const runtime = "nodejs";

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, 2000) : null;
}

function normalizedKey(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replaceAll("-", "_")
    : "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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
    return [];
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
        amount: numberOrNull(item.amount),
        confidence:
        item.confidence === "high" || item.confidence === "low"
          ? item.confidence as ProductConfidence
          : "moderate" as ProductConfidence,
        itemType,
        name: textOrNull(item.name) ?? "",
        supplementId: textOrNull(item.supplementId),
        unit: textOrNull(item.unit)
      };
    })
    .filter((item) => item.name);
}

export async function POST(request: Request) {
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

  const platform = normalizedKey(body.platform);
  const status = normalizedKey(body.status);
  const labelStatus = normalizedKey(body.labelStatus);
  const productKind = parseProductKind(body.productKind);
  const productAudience = parseProductAudience(body.productAudience);
  const title = textOrNull(body.title);
  const productUrl = textOrNull(body.productUrl);

  if (
    !title ||
    !productUrl ||
    !isProductPlatform(platform) ||
    (body.status !== undefined && !isProductStatus(status)) ||
    (body.labelStatus !== undefined && !isProductLabelStatus(labelStatus)) ||
    (body.productKind !== undefined && !productKind) ||
    (body.productAudience !== undefined && !productAudience)
  ) {
    return NextResponse.json(
      { message: "Invalid product import payload" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const row = await createAdminProduct({
      actor: "admin_dashboard",
      brandName: textOrNull(body.brandName),
      currency: textOrNull(body.currency) ?? "THB",
      facts: factsFromBody(body.facts),
      fdaApprovalNumber: textOrNull(body.fdaApprovalNumber),
      imageUrl: textOrNull(body.imageUrl),
      labelStatus: isProductLabelStatus(labelStatus) ? labelStatus : undefined,
      status: isProductStatus(status) ? status : undefined,
      platform,
      productAudience,
      productKind,
      productUrl,
      region: textOrNull(body.region) ?? "TH",
      title
    });

    return NextResponse.json(
      { row },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 201
      }
    );
  } catch (error) {
    console.error("Unable to import product", error);

    return NextResponse.json(
      { message: "Unable to import product" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
