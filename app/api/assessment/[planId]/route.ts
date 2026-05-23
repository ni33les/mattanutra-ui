import { NextResponse } from "next/server";
import {
  createAssessmentSnapshot,
  isAssessmentPlan
} from "@/lib/assessment-snapshot";
import {
  getStoredAssessmentPrefill,
  getStoredAssessmentSnapshot,
  getStoredHealthScoreAnalysisSnapshot,
  isUuid,
  persistAssessmentSubmission
} from "@/lib/assessment-store";
import { computeHealthScore } from "@/lib/health-score";
import {
  enqueueDueScheduledActions,
  enqueueHealthScoreAnalysisTask,
  enqueueNutritionPlanTasks,
  scheduleReassessmentAction
} from "@/lib/task-worker";
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

function buildHealthScore(answers: unknown, locale: unknown) {
  const normalizedLocale = isLocale(locale) ? locale : "en";

  return computeHealthScore(answers, normalizedLocale);
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
  request: Request,
  { params }: AssessmentStatusRouteProps
) {
  const { planId } = await params;
  const url = new URL(request.url);
  const healthScoreView = url.searchParams.get("view") === "healthscore";

  if (healthScoreView) {
    await enqueueHealthScoreAnalysisTask({ planId });
  }

  const snapshot = healthScoreView
    ? await getStoredHealthScoreAnalysisSnapshot(planId)
    : await getStoredAssessmentSnapshot(planId);

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

  void enqueueDueScheduledActions();

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
    const existingPrefill = await getStoredAssessmentPrefill(planId);
    const effectiveAnswers =
      body.answers === undefined ? existingPrefill?.answers : body.answers;
    const selectedPlan =
      intent === "process" && isAssessmentPlan(body.plan)
        ? body.plan
        : (existingSnapshot?.plan ?? null);
    const healthScore =
      intent === "process" && existingSnapshot?.healthScore
        ? existingSnapshot.healthScore
        : buildHealthScore(effectiveAnswers, body.locale);
    const snapshot = createAssessmentSnapshot({
      healthScore,
      plan: selectedPlan ?? existingSnapshot?.plan,
      planId,
      queuePosition: existingSnapshot?.queuePosition,
      status: "ready"
    });

    await persistAssessmentSubmission({
      answers: effectiveAnswers,
      locale: body.locale,
      selectedPlan,
      snapshot,
      status: "captured"
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

    await enqueueHealthScoreAnalysisTask({ planId: snapshot.planId });

    const reassessmentEmail = reassessmentEmailFromAnswers(body.answers);

    if (reassessmentEmail) {
      await scheduleReassessmentAction({
        email: reassessmentEmail,
        locale: body.locale,
        planId: snapshot.planId
      });
      void enqueueDueScheduledActions();
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
      const healthScoreSnapshot =
        await getStoredHealthScoreAnalysisSnapshot(snapshot.planId) ??
        snapshot;

      return NextResponse.json(healthScoreSnapshot, {
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

    await enqueueNutritionPlanTasks({
      answers: effectiveAnswers,
      locale: body.locale,
      plan: selectedPlan,
      planId: snapshot.planId
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
