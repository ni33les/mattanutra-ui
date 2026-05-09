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
import { bpmContextFromBody, writeBpmEvent } from "@/lib/bpm";
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

function healthScoreBpmFields(snapshot: { healthScore?: ReturnType<typeof computeHealthScore> }) {
  const lowestDomain = snapshot.healthScore?.domains
    .slice()
    .sort((a, b) => a.score - b.score)[0];

  return {
    healthScore: snapshot.healthScore?.score,
    lowestDomain: lowestDomain?.id,
    metrics: {
      domainScores: snapshot.healthScore?.domains.reduce<Record<string, number>>(
        (scores, domain) => {
          scores[domain.id] = domain.score;
          return scores;
        },
        {}
      )
    },
    scoreBand: snapshot.healthScore?.band
  };
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
  const bpm = bpmContextFromBody(body);

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
    const healthScore =
      intent === "process" && existingSnapshot?.healthScore
        ? existingSnapshot.healthScore
        : await buildHealthScore(body.answers, body.locale);
    const snapshot = createAssessmentSnapshot({
      healthScore,
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

    await writeBpmEvent({
      actorType: "visitor",
      attribution: bpm.attribution,
      eventName:
        intent === "capture"
          ? "assessment_recaptured"
          : "assessment_process_requested",
      eventType: "funnel",
      locale: body.locale,
      planId: snapshot.planId,
      ray: typeof bpm.ray === "string" ? bpm.ray : null,
      selectedPlan,
      ...healthScoreBpmFields(snapshot)
    });

    const reassessmentEmail = reassessmentEmailFromAnswers(body.answers);

    if (reassessmentEmail) {
      await scheduleReassessmentAction({
        email: reassessmentEmail,
        locale: body.locale,
        planId: snapshot.planId
      });
      void kickCronWorker();
      await writeBpmEvent({
        actorType: "visitor",
        attribution: bpm.attribution,
        email: reassessmentEmail,
        eventName: "reassessment_opted_in",
        eventType: "reassessment",
        locale: body.locale,
        planId: snapshot.planId,
        ray: typeof bpm.ray === "string" ? bpm.ray : null
      });
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

    await writeBpmEvent({
      actorType: "visitor",
      attribution: bpm.attribution,
      eventName: "plan_selected",
      eventType: "plan",
      locale: body.locale,
      planId: snapshot.planId,
      ray: typeof bpm.ray === "string" ? bpm.ray : null,
      selectedPlan,
      ...healthScoreBpmFields(snapshot)
    });

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
    await writeBpmEvent({
      actorType: "system",
      attribution: bpm.attribution,
      eventName: "formulation_requested",
      eventType: "formulation",
      jobId,
      locale: body.locale,
      planId: snapshot.planId,
      ray: typeof bpm.ray === "string" ? bpm.ray : null,
      selectedPlan,
      ...healthScoreBpmFields(snapshot)
    });

    const storedSnapshot = await getStoredAssessmentSnapshot(snapshot.planId);

    return NextResponse.json(storedSnapshot ?? snapshot, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Unable to persist assessment plan selection", error);
    await writeBpmEvent({
      actorType: "system",
      attribution: bpm.attribution,
      errorCode: "assessment_plan_selection_failed",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Unable to persist assessment plan selection",
      eventName: "assessment_api_error",
      eventType: "error",
      locale: body.locale,
      planId,
      ray: typeof bpm.ray === "string" ? bpm.ray : null,
      severity: "high"
    });

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
