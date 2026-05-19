import { NextResponse } from "next/server";
import { writeBpmEvent } from "@/lib/bpm";
import { isUuid } from "@/lib/assessment-store";

export const runtime = "nodejs";

function numberOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 500)
    : null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const planId = textOrNull(body.planId);
  const productId = textOrNull(body.productId);
  const recommendationRunId = textOrNull(body.recommendationRunId);

  if (!productId || !isUuid(productId)) {
    return NextResponse.json(
      { message: "Invalid product click" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  await writeBpmEvent({
    actorType: "visitor",
    eventName: "product_clicked",
    eventType: "affiliate",
    planId: planId && isUuid(planId) ? planId : null,
    properties: {
      affiliate: Boolean(body.affiliate),
      marketplace: textOrNull(body.marketplace),
      productCoveragePercent: numberOrNull(body.productCoveragePercent),
      productId,
      rank: numberOrNull(body.rank),
      recommendationRunId,
      stackCoveragePercent: numberOrNull(body.stackCoveragePercent),
      stackContributionPercent: numberOrNull(body.stackContributionPercent)
    },
    ray: textOrNull(body.ray),
    request,
    severity: "low"
  });

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
