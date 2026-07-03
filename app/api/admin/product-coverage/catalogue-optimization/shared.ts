import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession
} from "@/lib/admin-access";
import { adminViewAllowed } from "@/lib/admin-rbac";
import {
  adminCataloguePotentialCandidates
} from "@/lib/admin-product-coverage";
import type { ProductCandidate } from "@/lib/product-recommendations";

export const noStoreHeaders = {
  "Cache-Control": "no-store"
};
export const defaultPotentialTraceChunkSize = 4;
export const maxPotentialTraceChunkSize = 8;

export function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function adminContext(
  request: NextRequest,
  _body: Record<string, unknown>
) {
  void _body;

  return resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });
}

export async function rejectUnauthorizedPlanCoverageRequest(
  request: NextRequest,
  body: Record<string, unknown>
) {
  const context = await adminContext(request, body);

  if (!context) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { headers: noStoreHeaders, status: 401 }
    );
  }

  if (
    !adminViewAllowed(
      context,
      "plan-coverage-simulator",
      context.effectiveOrganisation.type
    ) &&
    !adminViewAllowed(
      context,
      "product-optimisation",
      context.effectiveOrganisation.type
    )
  ) {
    return NextResponse.json(
      { error: "Forbidden" },
      { headers: noStoreHeaders, status: 403 }
    );
  }

  return null;
}

export function normalizedPotentialTraceChunkSize(value: unknown) {
  const parsed = Math.floor(Number(value));

  if (!Number.isFinite(parsed)) {
    return defaultPotentialTraceChunkSize;
  }

  return Math.max(1, Math.min(maxPotentialTraceChunkSize, parsed));
}

export function potentialCandidateHash(candidates: readonly ProductCandidate[]) {
  const rawById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const hashableCandidates = adminCataloguePotentialCandidates(candidates)
    .map((candidate) => {
      const raw = rawById.get(candidate.id) ?? candidate;

      return {
        audience: candidate.productAudience ?? null,
        availabilityStatus: candidate.availabilityStatus,
        brandName: candidate.brandName ?? null,
        brandStatus: raw.brandStatus ?? null,
        currency: candidate.currency,
        facts: [...candidate.facts]
          .map((fact) => ({
            aliasKeys: fact.aliasKeys ?? [],
            amount: fact.amount,
            comparableAmount: fact.comparableAmount,
            confidence: fact.confidence,
            itemType: fact.itemType,
            maxAmount: fact.maxAmount ?? null,
            maxUnit: fact.maxUnit ?? null,
            name: fact.name,
            normalizedName: fact.normalizedName,
            safetyFlags: fact.safetyFlags ?? [],
            supplementAudience: fact.supplementAudience ?? null,
            supplementId: fact.supplementId ?? null,
            unit: fact.unit
          }))
          .sort((first, second) =>
            (first.supplementId ?? first.normalizedName).localeCompare(
              second.supplementId ?? second.normalizedName
            ) ||
            (first.amount ?? -1) - (second.amount ?? -1) ||
            (first.unit ?? "").localeCompare(second.unit ?? "")
          ),
        id: candidate.id,
        platform: candidate.platform,
        priceAmount: candidate.priceAmount ?? null,
        productKind: candidate.productKind ?? null,
        productStatus: raw.status,
        title: candidate.title,
        unitPriceAmount: candidate.unitPriceAmount ?? null
      };
    })
    .sort((first, second) => first.id.localeCompare(second.id));

  return createHash("sha256")
    .update(JSON.stringify(hashableCandidates))
    .digest("hex");
}
