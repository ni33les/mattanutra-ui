import { NextResponse } from "next/server";
import { kickCronWorker } from "@/lib/task-worker";

export const runtime = "nodejs";

async function runDueCron() {
  try {
    const result = await kickCronWorker();

    return NextResponse.json(result ?? { queued: 0 }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Unable to run cron worker", error);

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

export async function GET() {
  return runDueCron();
}

export async function POST() {
  return runDueCron();
}
