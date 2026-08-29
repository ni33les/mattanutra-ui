import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  isSupplementConfidence,
  isSupplementListStatus,
  type AdminSupplementCountryAvailabilityInput,
  type SupplementConfidence,
  type AdminSupplementTranslationInput,
  type SupplementListStatus,
  deleteAdminSupplement,
  parseAdminSupplementSafetyBands,
  updateAdminSupplement
} from "@/lib/admin-supplements";
import { isUuid } from "@/lib/assessment-store";
import { normalizeSupplementSafetyFlags } from "@/lib/supplement-safety-flags";
import {
  isSupplementCountryAvailabilityStatus,
  normalizeSupplementAvailabilityCountryCode
} from "@/lib/supplement-country-availability";

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

function parseTranslations(value: unknown): AdminSupplementTranslationInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const translations: AdminSupplementTranslationInput[] = [];

  for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }

      const translation = item as Record<string, unknown>;
      const aliases = Array.isArray(translation.aliases)
        ? translation.aliases.filter((alias): alias is string => typeof alias === "string")
        : [];

      translations.push({
        aliases,
        categoryLabel: textOrNull(translation.categoryLabel),
        locale: typeof translation.locale === "string" ? translation.locale : "",
        name: textOrNull(translation.name),
        primaryUseCase: textOrNull(translation.primaryUseCase),
        safetyNotes: textOrNull(translation.safetyNotes),
        status:
          translation.status === "complete" || translation.status === "missing"
            ? translation.status
            : "draft"
      });
  }

  return translations;
}

function parseCountryAvailability(
  value: unknown
): AdminSupplementCountryAvailabilityInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): AdminSupplementCountryAvailabilityInput[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const status = record.status;

    if (!isSupplementCountryAvailabilityStatus(status)) {
      return [];
    }

    return [{
      countryCode: normalizeSupplementAvailabilityCountryCode(
        typeof record.countryCode === "string"
          ? record.countryCode
          : typeof record.country_code === "string"
            ? record.country_code
            : null
      ),
      reason: textOrNull(record.reason),
      status
    }];
  });
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

function supplementErrorStatus(message: string) {
  if (message === "Supplement not found") {
    return 404;
  }

  if (message === "Supplement name already exists") {
    return 409;
  }

  if (
    message === "Supplement name is required" ||
    message === "Invalid supplement list status" ||
    message === "Invalid supplement confidence"
  ) {
    return 400;
  }

  return 500;
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
  const name = body.name === undefined ? undefined : textOrNull(body.name);

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

  if (body.name !== undefined && !name) {
    return NextResponse.json(
      { message: "Supplement name is required" },
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
      category: body.category === undefined
        ? undefined
        : textOrNull(body.category),
      confidence,
      countryAvailability: parseCountryAvailability(body.countryAvailability),
      id,
      listStatus,
      maxAmount: amountValue(body.maxAmount),
      maxUnit: textOrNull(body.maxUnit) ?? "",
      name,
      safetyBands: parseAdminSupplementSafetyBands(body.safetyBands),
      primaryUseCase: body.primaryUseCase === undefined
        ? undefined
        : textOrNull(body.primaryUseCase),
      safetyFlags,
      safetyNotes: textOrNull(body.safetyNotes),
      translations: parseTranslations(body.translations)
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
    const message =
      error instanceof Error ? error.message : "Unable to update supplement";
    const status = supplementErrorStatus(message);

    console.error("Unable to update supplement", {
      error: errorDetails(error),
      supplementId: id
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

export async function DELETE(
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

  try {
    const result = await deleteAdminSupplement({
      actor: "admin_dashboard",
      id
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
      error instanceof Error ? error.message : "Unable to delete supplement";
    const status = supplementErrorStatus(message);

    console.error("Unable to delete supplement", {
      error: errorDetails(error),
      supplementId: id
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
