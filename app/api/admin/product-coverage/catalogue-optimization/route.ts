import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  startAdminCatalogueOptimizationJob
} from "@/lib/admin-catalogue-optimization-jobs";
import type { AdminPlanCoverageSimulationData } from "@/lib/admin-product-coverage";
import {
  noStoreHeaders,
  rejectUnauthorizedPlanCoverageRequest,
  text
} from "@/app/api/admin/product-coverage/catalogue-optimization/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function optimizationCacheKey(body: Record<string, unknown>) {
  const explicitKey = text(body.cacheKey);

  if (explicitKey) {
    return explicitKey.slice(0, 500);
  }

  return createHash("sha256")
    .update(JSON.stringify({
      includePendingReviewProducts:
        body.includePendingReviewProducts === true ||
        body.includeReviewPriorityProducts === true,
      simulationData: body.simulationData ?? null
    }))
    .digest("hex");
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
    const job = await startAdminCatalogueOptimizationJob({
      cacheKey: optimizationCacheKey(body),
      includePendingReviewProducts:
        body.includePendingReviewProducts === true ||
        body.includeReviewPriorityProducts === true,
      simulationData
    });

    if (job.status === "completed" && job.optimization) {
      return NextResponse.json(
        {
          cached: true,
          job,
          optimization: job.optimization
        },
        { headers: noStoreHeaders }
      );
    }

    return NextResponse.json(
      {
        error: "Optimum basket calculation has been queued",
        job,
        queued: true
      },
      { headers: noStoreHeaders, status: 202 }
    );
  } catch (error) {
    console.error("Unable to queue catalogue optimization", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to queue optimum basket"
      },
      { headers: noStoreHeaders, status: 500 }
    );
  }
}
