import { NextResponse, type NextRequest } from "next/server";
import {
  cancelAdminCatalogueOptimizationJob,
  getAdminCatalogueOptimizationJob,
  startAdminCatalogueOptimizationJob,
  type AdminCatalogueOptimizationJobView
} from "@/lib/admin-catalogue-optimization-jobs";
import type { AdminPlanCoverageSimulationData } from "@/lib/admin-product-coverage";
import {
  noStoreHeaders,
  rejectUnauthorizedPlanCoverageRequest,
  text
} from "@/app/api/admin/product-coverage/catalogue-optimization/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JobAction = "cancel" | "start" | "status";

function jobAction(value: unknown): JobAction {
  return value === "cancel" || value === "status" ? value : "start";
}

function jobResponse(job: AdminCatalogueOptimizationJobView | null) {
  return NextResponse.json({ job }, { headers: noStoreHeaders });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const rejection = await rejectUnauthorizedPlanCoverageRequest(request, body);

  if (rejection) {
    return rejection;
  }

  const action = jobAction(body.action);
  const cacheKey = text(body.cacheKey);

  if (!cacheKey) {
    return NextResponse.json(
      { error: "Missing job cache key" },
      { headers: noStoreHeaders, status: 400 }
    );
  }

  try {
    if (action === "status") {
      return jobResponse(await getAdminCatalogueOptimizationJob(cacheKey));
    }

    if (action === "cancel") {
      return jobResponse(await cancelAdminCatalogueOptimizationJob(cacheKey));
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

    return jobResponse(
      await startAdminCatalogueOptimizationJob({
        cacheKey,
        includePendingReviewProducts:
          body.includePendingReviewProducts !== false,
        simulationData
      })
    );
  } catch (error) {
    console.error("Unable to handle shared optimum basket job", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to handle shared optimum basket job"
      },
      { headers: noStoreHeaders, status: 500 }
    );
  }
}

