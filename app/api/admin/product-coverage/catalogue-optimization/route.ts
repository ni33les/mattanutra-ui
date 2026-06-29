import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import {
  adminCsrfCookieName,
  adminSessionCookieName,
  legacyAdminContext,
  resolveAdminSession
} from "@/lib/admin-access";
import {
  getProductRecommendationCandidates
} from "@/lib/admin-product-search";
import {
  runAdminCatalogueOptimizationFast,
  runAdminCataloguePotentialOptimizationFast,
  type AdminCatalogueOptimizationData,
  type AdminPlanCoverageSimulationData
} from "@/lib/admin-product-coverage";
import { adminViewAllowed } from "@/lib/admin-rbac";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store"
};
const cacheTtlMs = 60 * 60 * 1000;
const maxCacheEntries = 50;
const optimizationCache = new Map<string, {
  optimization: AdminCatalogueOptimizationData;
  storedAt: number;
}>();

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optimizationCacheKey(body: Record<string, unknown>) {
  const explicitKey = text(body.cacheKey);

  if (explicitKey) {
    return explicitKey.slice(0, 500);
  }

  return createHash("sha256")
    .update(JSON.stringify({
      includeReviewPriorityProducts: body.includeReviewPriorityProducts !== false,
      reviewPriorityProducts: body.reviewPriorityProducts ?? null,
      simulationData: body.simulationData ?? null
    }))
    .digest("hex");
}

function getCachedOptimization(cacheKey: string) {
  const cached = optimizationCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.storedAt > cacheTtlMs) {
    optimizationCache.delete(cacheKey);
    return null;
  }

  optimizationCache.delete(cacheKey);
  optimizationCache.set(cacheKey, cached);

  return cached.optimization;
}

function setCachedOptimization(
  cacheKey: string,
  optimization: AdminCatalogueOptimizationData
) {
  optimizationCache.set(cacheKey, {
    optimization,
    storedAt: Date.now()
  });

  while (optimizationCache.size > maxCacheEntries) {
    const oldestKey = optimizationCache.keys().next().value;

    if (!oldestKey) {
      break;
    }

    optimizationCache.delete(oldestKey);
  }
}

function accessTokenFromRequest(request: NextRequest, body: Record<string, unknown>) {
  const url = new URL(request.url);

  return (
    text(request.headers.get("x-admin-dashboard-token")) ||
    text(body.accessToken) ||
    text(url.searchParams.get("access_token")) ||
    null
  );
}

async function adminContext(
  request: NextRequest,
  body: Record<string, unknown>
) {
  const session = await resolveAdminSession({
    csrfToken: request.cookies.get(adminCsrfCookieName)?.value,
    sessionCookie: request.cookies.get(adminSessionCookieName)?.value
  });

  return session ?? legacyAdminContext(accessTokenFromRequest(request, body));
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
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
    )
  ) {
    return NextResponse.json(
      { error: "Forbidden" },
      { headers: noStoreHeaders, status: 403 }
    );
  }

  const simulationData = body.simulationData as
    | AdminPlanCoverageSimulationData
    | undefined;

  if (!simulationData || typeof simulationData !== "object") {
    return NextResponse.json(
      { error: "Missing simulation data" },
      { headers: noStoreHeaders, status: 400 }
    );
  }

  try {
    const cacheKey = optimizationCacheKey(body);
    const cachedOptimization = getCachedOptimization(cacheKey);

    if (cachedOptimization) {
      return NextResponse.json(
        {
          cached: true,
          optimization: cachedOptimization
        },
        { headers: noStoreHeaders }
      );
    }

    const includeReviewPriorityProducts =
      body.includeReviewPriorityProducts !== false;
    const optimization = runAdminCatalogueOptimizationFast({
      includeReviewPriorityProducts,
      reviewPriorityProducts: Array.isArray(body.reviewPriorityProducts)
        ? body.reviewPriorityProducts
        : null,
      simulationData
    });
    const potential = includeReviewPriorityProducts
      ? runAdminCataloguePotentialOptimizationFast({
          coverageLossTolerancePercent: 0,
          potentialCandidates: await getProductRecommendationCandidates({
            countryCode: simulationData.countryCode,
            includeIneligible: true
          }),
          simulationData
        })
      : null;
    const optimizationWithPotential = {
      ...optimization,
      potential
    } satisfies AdminCatalogueOptimizationData;

    setCachedOptimization(cacheKey, optimizationWithPotential);

    return NextResponse.json(
      {
        cached: false,
        optimization: optimizationWithPotential
      },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    console.error("Unable to calculate catalogue optimization", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to calculate minimum catalogue"
      },
      { headers: noStoreHeaders, status: 500 }
    );
  }
}
