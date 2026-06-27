import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  deleteIgnoredAdminProduct,
  isProductAudience,
  isProductLabelStatus,
  isProductStatus,
  loadAdminProductRowsForBrand,
  updateAdminProduct
} from "@/lib/admin-products";
import type {
  ProductAudience,
  ProductConfidence,
  ProductKind
} from "@/lib/product-recommendations";
import {
  normalizeCurrencyCode,
  normalizeProductCountryCode,
  type ProductCountryPricing
} from "@/lib/product-countries";
import { normalizeProductForm, type ProductForm } from "@/lib/product-form";
import { productIdentifiersFromBody } from "@/lib/product-identifiers";
import { productRegulatoryApprovalsFromPayload } from "@/lib/product-regulatory-approvals";
import { isUuid } from "@/lib/assessment-store";
import { normalizeProductTranslationRequest } from "@/lib/product-translation-input";

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

function countryCodesFromBody(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function countryPricingFromBody(value: unknown): ProductCountryPricing[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((item): ProductCountryPricing[] => {
      const record = item && typeof item === "object"
        ? item as Record<string, unknown>
        : null;
      if (!record) {
        return [];
      }
      const countryCode = normalizeProductCountryCode(record.countryCode);
      const parsedRrp = parseOptionalNumber(record.rrpPriceAmount);
      const rrpPriceAmount = parsedRrp === undefined ? null : parsedRrp;

      return countryCode
        ? [{
            countryCode,
            currency: normalizeCurrencyCode(record.currency, "THB"),
            priceUpdatedAt: null,
            rrpPriceAmount
          }]
        : [];
    });
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

function parseProductForm(value: unknown): ProductForm | undefined {
  return normalizeProductForm(value) ?? undefined;
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

function productResponseRow<T extends { sourceSnapshot?: unknown }>(row: T) {
  const { sourceSnapshot, ...responseRow } = row;

  void sourceSnapshot;

  return responseRow;
}

const noStoreHeaders = {
  "Cache-Control": "no-store"
};

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
        headers: noStoreHeaders,
        status: 404
      }
    );
  }

  if (!isUuid(id)) {
    return NextResponse.json(
      { message: "Product not found" },
      {
        headers: noStoreHeaders,
        status: 404
      }
    );
  }

  const status = normalizedKey(body.status);
  const labelStatus = normalizedKey(body.labelStatus);
  const productKind = parseProductKind(body.productKind);
  const productForm = parseProductForm(body.productForm);
  const productAudience = parseProductAudience(body.productAudience);
  const title = body.title === undefined ? undefined : textOrNull(body.title, 500);
  const productUrl = body.productUrl === undefined
    ? undefined
    : textOrNull(body.productUrl, 2000);
  const translationRequest = normalizeProductTranslationRequest({
    body,
    translations: body.translations
  });
  const englishTranslationTitle = textOrNull(
    translationRequest.translations?.en?.title,
    500
  );
  const effectiveTitle = englishTranslationTitle ?? title;

  if (
    (body.title !== undefined && !effectiveTitle) ||
    (body.productUrl !== undefined && !productUrl) ||
    (body.status !== undefined && !isProductStatus(status)) ||
    (body.labelStatus !== undefined && !isProductLabelStatus(labelStatus)) ||
    (body.productKind !== undefined && !productKind) ||
    (body.productForm !== undefined && !productForm) ||
    (body.productAudience !== undefined && !productAudience)
  ) {
    return NextResponse.json(
      { message: "Invalid product governance payload" },
      {
        headers: noStoreHeaders,
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
      countryPricing: countryPricingFromBody(body.countryPricing),
      changeNote: body.changeNote === undefined
        ? undefined
        : textOrNull(body.changeNote, 200),
      description: body.description === undefined
        ? undefined
        : textOrNull(body.description, 4000),
      facts: factsFromBody(body.facts),
      id,
      imageUrl: body.imageUrl === undefined
        ? undefined
        : textOrNull(body.imageUrl, 2000),
      identifiers: productIdentifiersFromBody(body.identifiers),
      labelStatus: isProductLabelStatus(labelStatus) ? labelStatus : undefined,
      availableCountryCodes: countryCodesFromBody(body.availableCountryCodes),
      manufacturerCountryCodes: countryCodesFromBody(body.manufacturerCountryCodes),
      status: isProductStatus(status) ? status : undefined,
      productAudience,
      productForm,
      productKind,
      productUrl,
      regulatoryApprovals: body.regulatoryApprovals === undefined
        ? undefined
        : productRegulatoryApprovalsFromPayload(body.regulatoryApprovals),
      title: effectiveTitle,
      translations: translationRequest.translations
    });
    const rows = body.manufacturerCountryCodes !== undefined && row.brandId
      ? await loadAdminProductRowsForBrand(row.brandId)
      : [row];

    return NextResponse.json(
      {
        row: productResponseRow(row),
        rows: rows.map(productResponseRow),
        ...(translationRequest.warnings.length > 0
          ? { warnings: translationRequest.warnings }
          : {})
      },
      {
        headers: noStoreHeaders
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
        headers: noStoreHeaders,
        status: blocked ? 400 : 500
      }
    );
  }
}

export async function DELETE(
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
        headers: noStoreHeaders,
        status: 404
      }
    );
  }

  if (!isUuid(id)) {
    return NextResponse.json(
      { message: "Product not found" },
      {
        headers: noStoreHeaders,
        status: 404
      }
    );
  }

  try {
    const result = await deleteIgnoredAdminProduct({
      actor: "admin_dashboard",
      productId: id
    });

    return NextResponse.json(
      { result },
      {
        headers: noStoreHeaders
      }
    );
  } catch (error) {
    console.error("Unable to delete product", error);
    const message =
      error instanceof Error ? error.message : "Unable to delete product";
    const blocked =
      message.startsWith("Only ignored products") ||
      message.startsWith("Product cannot be deleted");

    return NextResponse.json(
      { message },
      {
        headers: noStoreHeaders,
        status: message === "Product not found" ? 404 : blocked ? 409 : 500
      }
    );
  }
}
