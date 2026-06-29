import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import {
  runAdminCatalogueOptimizationFast,
  type AdminCatalogueOptimizationData,
  type AdminPlanCoverageSimulationData
} from "@/lib/admin-product-coverage";
import {
  noStoreHeaders,
  rejectUnauthorizedPlanCoverageRequest,
  text
} from "@/app/api/admin/product-coverage/catalogue-optimization/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cacheTtlMs = 60 * 60 * 1000;
const maxCacheEntries = 50;
const optimizationCache = new Map<string, {
  optimization: AdminCatalogueOptimizationData;
  storedAt: number;
}>();

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

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const rejection = await rejectUnauthorizedPlanCoverageRequest(request, body);

  if (rejection) {
    return rejection;
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

    const optimization = runAdminCatalogueOptimizationFast({
      includeReviewPriorityProducts: false,
      simulationData
    });
    const optimizationWithPotential = {
      ...optimization,
      potential: null
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
            : "Unable to calculate optimum basket"
      },
      { headers: noStoreHeaders, status: 500 }
    );
  }
}
