import { NextResponse, type NextRequest } from "next/server";
import { getProductRecommendationCandidates } from "@/lib/admin-product-search";
import {
  runAdminCataloguePotentialOptimizationFromTraces,
  type AdminPlanCoverageSimulationData,
  type AdminPlanCoverageSimulationSampleTrace
} from "@/lib/admin-product-coverage";
import {
  noStoreHeaders,
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
  const sampleTraces = body.sampleTraces as
    | readonly AdminPlanCoverageSimulationSampleTrace[]
    | undefined;
  const expectedCandidateHash = text(body.candidateHash);

  if (!simulationData || typeof simulationData !== "object") {
    return NextResponse.json(
      { error: "Missing simulation data" },
      { headers: noStoreHeaders, status: 400 }
    );
  }

  if (!Array.isArray(sampleTraces)) {
    return NextResponse.json(
      { error: "Missing potential sample traces" },
      { headers: noStoreHeaders, status: 400 }
    );
  }

  if (!expectedCandidateHash) {
    return NextResponse.json(
      { error: "Missing candidate hash" },
      { headers: noStoreHeaders, status: 400 }
    );
  }

  const countryCode = text(body.countryCode) || simulationData.countryCode;

  try {
    const potentialCandidates = await getProductRecommendationCandidates({
      countryCode,
      includeIneligible: true
    });
    const candidateHash = potentialCandidateHash(potentialCandidates);

    if (candidateHash !== expectedCandidateHash) {
      return NextResponse.json(
        {
          candidateHash,
          error: "Potential catalogue changed; restart the optimum basket calculation"
        },
        { headers: noStoreHeaders, status: 409 }
      );
    }

    const scopedSimulationData = {
      ...simulationData,
      countryCode
    } satisfies AdminPlanCoverageSimulationData;
    const potential = runAdminCataloguePotentialOptimizationFromTraces({
      coverageLossTolerancePercent: 0,
      potentialCandidates,
      sampleTraces,
      simulationData: scopedSimulationData
    });

    return NextResponse.json(
      {
        candidateCount: potential.candidateCount,
        candidateHash,
        potential
      },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    console.error("Unable to finalize potential catalogue optimization", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to finalize optimum basket"
      },
      { headers: noStoreHeaders, status: 500 }
    );
  }
}

