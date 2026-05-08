import { NextResponse } from "next/server";
import {
  createAssessmentSnapshot,
  isAssessmentPlan
} from "@/lib/assessment-jobs";
import {
  getStoredAssessmentSnapshot,
  isUuid,
  persistAssessmentSubmission
} from "@/lib/assessment-store";
import { computeHealthScore } from "@/lib/health-score";
import { analyzeHealthScoreAdvice } from "@/lib/health-score-analysis";
import {
  enqueueFormulationJob,
  kickCronWorker,
  kickJobsWorker,
  scheduleReassessmentAction
} from "@/lib/job-queue";
import { isLocale } from "@/lib/i18n";

export const runtime = "nodejs";

function reassessmentEmailFromAnswers(answers: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return "";
  }

  const value = (answers as Record<string, unknown>).reassessmentEmail;

  return typeof value === "string" ? value : "";
}

async function buildHealthScore(answers: unknown, locale: unknown) {
  const normalizedLocale = isLocale(locale) ? locale : "en";
  const healthScore = computeHealthScore(answers, normalizedLocale);

  try {
    return {
      ...healthScore,
      advice: await analyzeHealthScoreAdvice({
        answers,
        healthScore,
        locale: normalizedLocale
      })
    };
  } catch (error) {
    console.warn("Unable to analyze HealthScore advice", error);
    return healthScore;
  }
}

type AssessmentStatusRouteProps = Readonly<{
  params: Promise<{
    planId: string;
  }>;
}>;

export async function GET(
  _request: Request,
  { params }: AssessmentStatusRouteProps
) {
  const { planId } = await params;
  const snapshot = await getStoredAssessmentSnapshot(planId);

  if (!snapshot) {
    return NextResponse.json(
      { message: "Assessment plan not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  if (snapshot.status !== "ready") {
    void kickJobsWorker();
  }
  void kickCronWorker();

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function PATCH(
  request: Request,
  { params }: AssessmentStatusRouteProps
) {
  const { planId } = await params;
  let body: {
    answers?: unknown;
    intent?: "capture" | "process";
    locale?: unknown;
    plan?: unknown;
  } = {};

  try {
    body = (await request.json()) as {
      answers?: unknown;
      intent?: "capture" | "process";
      locale?: unknown;
      plan?: unknown;
    };
  } catch {
    body = {};
  }

  if (!isUuid(planId)) {
    return NextResponse.json(
      { message: "Assessment plan not found" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 404
      }
    );
  }

  const intent = body.intent === "capture" ? "capture" : "process";

  if (intent === "process" && !isAssessmentPlan(body.plan)) {
    return NextResponse.json(
      { message: "Unsupported assessment plan" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 400
      }
    );
  }

  try {
    const existingSnapshot = await getStoredAssessmentSnapshot(planId);
    const selectedPlan =
      intent === "process" && isAssessmentPlan(body.plan)
        ? body.plan
        : (existingSnapshot?.plan ?? null);
    const snapshot = createAssessmentSnapshot({
      healthScore: await buildHealthScore(body.answers, body.locale),
      plan: selectedPlan ?? existingSnapshot?.plan,
      planId,
      queuePosition: existingSnapshot?.queuePosition,
      status: "queued"
    });

    await persistAssessmentSubmission({
      answers: body.answers,
      locale: body.locale,
      selectedPlan,
      snapshot,
      status: intent === "capture" ? "captured" : "queued"
    });

    const reassessmentEmail = reassessmentEmailFromAnswers(body.answers);

    if (reassessmentEmail) {
      await scheduleReassessmentAction({
        email: reassessmentEmail,
        locale: body.locale,
        planId: snapshot.planId
      });
      void kickCronWorker();
    }

    if (intent === "capture") {
      const storedSnapshot = await getStoredAssessmentSnapshot(snapshot.planId);

      return NextResponse.json(storedSnapshot ?? snapshot, {
        headers: {
          "Cache-Control": "no-store"
        }
      });
    }

    if (!selectedPlan) {
      throw new Error("Assessment plan selection is missing");
    }

    const jobId = await enqueueFormulationJob({
      answers: body.answers,
      locale: body.locale,
      plan: selectedPlan,
      planId: snapshot.planId
    });

    if (!jobId) {
      throw new Error("Unable to queue assessment processing");
    }

    void kickJobsWorker();

    const storedSnapshot = await getStoredAssessmentSnapshot(snapshot.planId);

    return NextResponse.json(storedSnapshot ?? snapshot, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Unable to persist assessment plan selection", error);

    return NextResponse.json(
      { message: "Unable to start assessment processing" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }
}
