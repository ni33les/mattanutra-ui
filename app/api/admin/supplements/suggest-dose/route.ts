import { NextResponse } from "next/server";
import { adminDashboardOrClawRequestAllowed } from "@/lib/admin-auth";
import type { SupplementConfidence } from "@/lib/admin-supplements";
import { suggestSupplementDose } from "@/lib/supplement-dose-suggestion";
import { normalizeSupplementSafetyFlags } from "@/lib/supplement-safety-flags";

export const runtime = "nodejs";

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, 2000) : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceOrNull(value: unknown): SupplementConfidence | null {
  return value === "high" || value === "moderate" || value === "low"
    ? value
    : null;
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

  const supplementName = textOrNull(body.supplementName);

  if (!supplementName) {
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
    const suggestion = await suggestSupplementDose({
      category: textOrNull(body.category),
      confidence: confidenceOrNull(body.confidence),
      currentMaxAmount: numberOrNull(body.currentMaxAmount),
      currentMaxUnit: textOrNull(body.currentMaxUnit),
      listStatus: textOrNull(body.listStatus),
      primaryUseCase: textOrNull(body.primaryUseCase),
      safetyFlags: normalizeSupplementSafetyFlags(body.safetyFlags),
      safetyNotes: textOrNull(body.safetyNotes),
      supplementName
    });

    return NextResponse.json(
      { suggestion },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Unable to suggest supplement dose", {
      error,
      supplementName
    });

    return NextResponse.json(
      { message: "Unable to suggest dose" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
