import { NextResponse, type NextRequest } from "next/server";
import { getProductRecommendationCandidates } from "@/lib/admin-product-search";
import {
  buildAdminCataloguePotentialTraceChunk,
  type AdminPlanCoverageSimulationData
} from "@/lib/admin-product-coverage";
import {
  noStoreHeaders,
  normalizedPotentialTraceChunkSize,
  potentialCandidateHash,
  rejectUnauthorizedPlanCoverageRequest,
  text
} from "@/app/api/admin/product-coverage/catalogue-optimization/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const startIndex = Math.max(0, Math.floor(Number(body.startIndex ?? 0)));
  const chunkSize = normalizedPotentialTraceChunkSize(body.chunkSize);
  const countryCode = text(body.countryCode) || simulationData.countryCode;

  try {
    const potentialCandidates = await getProductRecommendationCandidates({
      countryCode,
      includeIneligible: true
    });
    const scopedSimulationData = {
      ...simulationData,
      countryCode
    } satisfies AdminPlanCoverageSimulationData;
    const chunk = buildAdminCataloguePotentialTraceChunk({
      chunkSize,
      potentialCandidates,
      simulationData: scopedSimulationData,
      startIndex
    });

    return NextResponse.json(
      {
        ...chunk,
        candidateHash: potentialCandidateHash(potentialCandidates)
      },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    console.error("Unable to calculate potential catalogue trace chunk", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to calculate optimum basket trace chunk"
      },
      { headers: noStoreHeaders, status: 500 }
    );
  }
}

