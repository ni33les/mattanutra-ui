import { NextResponse, type NextRequest } from "next/server";
import {
  noStoreHeaders,
  rejectUnauthorizedPlanCoverageRequest
} from "@/app/api/admin/product-coverage/catalogue-optimization/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const rejection = await rejectUnauthorizedPlanCoverageRequest(request, body);

  if (rejection) {
    return rejection;
  }

  return NextResponse.json(
    {
      error:
        "Potential catalogue trace calculation now runs through the Analytics worker job."
    },
    { headers: noStoreHeaders, status: 410 }
  );
}
