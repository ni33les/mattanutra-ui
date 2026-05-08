import { NextResponse } from "next/server";
import {
  createAssessmentSnapshot,
  DEFAULT_ASSESSMENT_PLAN,
  isAssessmentPlan,
  type AssessmentPlan
} from "@/lib/assessment-jobs";
import {
  getStoredAssessmentSnapshot,
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

export async function POST(request: Request) {
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

  const intent = body.intent === "process" ? "process" : "capture";
  let selectedPlan: AssessmentPlan | null = null;

  if (intent === "process") {
    if (!isAssessmentPlan(body.plan)) {
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

    selectedPlan = body.plan;
  }
  const snapshot = createAssessmentSnapshot({
    healthScore: await buildHealthScore(body.answers, body.locale),
    plan: selectedPlan ?? DEFAULT_ASSESSMENT_PLAN
  });
  let responseSnapshot = snapshot;

  try {
    await persistAssessmentSubmission({
      answers: body.answers,
      locale: body.locale,
      selectedPlan,
      snapshot,
      status: intent === "capture" ? "captured" : snapshot.status
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

    if (intent === "process" && selectedPlan) {
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
      responseSnapshot =
        (await getStoredAssessmentSnapshot(snapshot.planId)) ?? snapshot;
    }
  } catch (error) {
    console.error("Unable to persist assessment submission", error);

    return NextResponse.json(
      { message: "Unable to save assessment" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 500
      }
    );
  }

  return NextResponse.json(responseSnapshot, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
