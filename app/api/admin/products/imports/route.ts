import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  getProductImportRuns,
  stageProductImport,
  type ProductImportFactInput
} from "@/lib/admin-products";
import type { ProductConfidence } from "@/lib/product-recommendations";

export const runtime = "nodejs";

function textOrNull(value: unknown, max = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, max) : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function confidence(value: unknown): ProductConfidence {
  return value === "high" || value === "low" ? value : "moderate";
}

function textArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = textOrNull(item);

        return text ? [text] : [];
      })
    : [];
}

function factsFromBody(value: unknown): ProductImportFactInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = item && typeof item === "object"
      ? item as Record<string, unknown>
      : null;
    const name = record ? textOrNull(record.name, 300) : null;

    if (!record || !name) {
      return [];
    }

    return [{
      amount: numberOrNull(record.amount),
      confidence: confidence(record.confidence),
      itemType:
        record.itemType === "food" || record.itemType === "nutrient"
          ? record.itemType
          : "supplement",
      name,
      supplementId: textOrNull(record.supplementId, 100),
      unit: textOrNull(record.unit, 40)
    }];
  });
}

function recordPayload(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accessToken =
    request.headers.get("x-admin-dashboard-token") ??
    textOrNull(url.searchParams.get("access_token"));

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

  const limit = numberOrNull(url.searchParams.get("limit")) ?? 50;
  const data = await getProductImportRuns({ limit });

  return NextResponse.json(
    { data, generatedAt: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function POST(request: Request) {
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

  const brandName = textOrNull(body.brandName, 300);
  const productTitle = textOrNull(body.productTitle ?? body.title, 500);
  const sourceUrl = textOrNull(body.sourceUrl ?? body.productUrl);

  if (!brandName || !productTitle || !sourceUrl) {
    return NextResponse.json(
      { message: "Product import requires brandName, productTitle, and sourceUrl" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const result = await stageProductImport({
      actor: "admin_api",
      brandName,
      description: textOrNull(body.description, 4000),
      descriptionEn: textOrNull(body.descriptionEn, 4000),
      descriptionTh: textOrNull(body.descriptionTh, 4000),
      duplicateProductIds: textArray(body.duplicateProductIds),
      fdaApprovalNumber: textOrNull(body.fdaApprovalNumber, 100),
      imageUrls: textArray(body.imageUrls),
      parsedFacts: factsFromBody(body.parsedFacts ?? body.facts),
      parseConfidence: confidence(body.parseConfidence),
      productTitle,
      rawSnapshot: recordPayload(body.rawSnapshot),
      source: textOrNull(body.source, 200),
      sourceUrl,
      titleEn: textOrNull(body.titleEn, 500),
      titleTh: textOrNull(body.titleTh, 500)
    });

    return NextResponse.json(
      { result },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 201
      }
    );
  } catch (error) {
    console.error("Unable to stage product import", error);

    return NextResponse.json(
      { message: "Unable to stage product import" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
