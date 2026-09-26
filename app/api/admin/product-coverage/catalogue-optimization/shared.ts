export { adminCataloguePotentialCandidateHash as potentialCandidateHash } from "@/lib/admin-catalogue-candidate-hash";
import { NextResponse, type NextRequest } from "next/server";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  resolveAdminSession
} from "@/lib/admin-access";
import { adminViewAllowed } from "@/lib/admin-rbac";

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
