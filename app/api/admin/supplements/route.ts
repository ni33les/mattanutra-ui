import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import {
  createAdminSupplement,
  isSupplementConfidence,
  isSupplementListStatus,
  type AdminSupplementTranslationInput,
  type SupplementConfidence,
  type SupplementListStatus
} from "@/lib/admin-supplements";
import { normalizeSupplementSafetyFlags } from "@/lib/supplement-safety-flags";

export const runtime = "nodejs";

function textOrNull(value: unknown, maxLength = 2000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, maxLength) : null;
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
        categoryLabel: textOrNull(translation.categoryLabel, 120),
        locale: typeof translation.locale === "string" ? translation.locale : "",
        name: textOrNull(translation.name, 200),
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

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  const databaseError = error as Error & {
    code?: string;
    constraint_name?: string;
    detail?: string;
  };

  return {
    code: databaseError.code,
    constraint: databaseError.constraint_name,
    detail: databaseError.detail,
    message: error.message,
    name: error.name
  };
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

  const name = textOrNull(body.name, 200);

  if (!name) {
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
    const row = await createAdminSupplement({
      actor: "admin_dashboard",
      category: textOrNull(body.category, 120),
      confidence: parseConfidence(body.confidence),
      listStatus: parseListStatus(body.listStatus),
      maxAmount: amountValue(body.maxAmount),
      maxUnit: textOrNull(body.maxUnit, 80),
      name,
      safetyFlags: normalizeSupplementSafetyFlags(body.safetyFlags),
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
    console.error("Unable to create supplement", {
      error: errorDetails(error),
      supplementName: name
    });

    return NextResponse.json(
      { message: "Unable to create supplement" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
