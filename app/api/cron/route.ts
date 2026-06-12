import { NextResponse } from "next/server";
import { requireOpenClawAccess } from "@/lib/openclaw-api";
import {
  enqueueDigitalOceanBillingSyncTask,
  enqueueDueScheduledActions
} from "@/lib/task-worker";
import { expireOverdueGenericHumanReviewTasks } from "@/lib/human-review-task-expiry";

export const runtime = "nodejs";

async function runDueWork(request: Request) {
  const { unauthorized } = await requireOpenClawAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const [result, digitalOcean, humanReviewTasks] = await Promise.all([
      enqueueDueScheduledActions(),
      enqueueDigitalOceanBillingSyncTask(),
      expireOverdueGenericHumanReviewTasks()
    ]);

    return NextResponse.json(
      {
        ...(result ?? { queued: 0 }),
        digitalOcean,
        humanReviewTasks
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("Unable to queue scheduled actions", error);

    return NextResponse.json(
      { message: "Unable to run scheduled actions" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}

export async function GET(request: Request) {
  return runDueWork(request);
}

export async function POST(request: Request) {
  return runDueWork(request);
}
