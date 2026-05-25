import { NextResponse } from "next/server";
import {
  createAssessmentSnapshot,
  DEFAULT_ASSESSMENT_PLAN
} from "@/lib/assessment-snapshot";
import {
  getStoredAssessmentSnapshot,
  getStoredHealthScoreAnalysisSnapshot,
  persistAssessmentSubmission
} from "@/lib/assessment-store";
import { computeHealthScore } from "@/lib/health-score";
import {
  enqueueAssessmentPregenerationTasks,
  enqueueDueScheduledActions,
  scheduleReassessmentAction
} from "@/lib/task-worker";
import { bpmContextFromBody, writeBpmEvent } from "@/lib/bpm";
import { isLocale } from "@/lib/i18n";
import { bindPaidReservationToAssessment } from "@/lib/stripe-payments";

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

export async function POST(request: Request) {
  let body: {
    answers?: unknown;
    intent?: "capture" | "process";
    locale?: unknown;
    paymentId?: unknown;
    plan?: unknown;
  } = {};

  try {
    body = (await request.json()) as {
      answers?: unknown;
      intent?: "capture" | "process";
      locale?: unknown;
      paymentId?: unknown;
      plan?: unknown;
    };
  } catch {
    body = {};
  }

  const intent = body.intent === "process" ? "process" : "capture";
  const bpm = bpmContextFromBody(body);

  if (intent === "process") {
    return NextResponse.json(
      { message: "Payment is required before plan processing" },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 402
      }
    );
  }

  const snapshot = createAssessmentSnapshot({
    healthScore: buildHealthScore(body.answers, body.locale),
    plan: DEFAULT_ASSESSMENT_PLAN,
    status: "ready"
  });

  try {
    await persistAssessmentSubmission({
      answers: body.answers,
      locale: body.locale,
      selectedPlan: null,
      snapshot,
      status: "captured"
    });

    await writeBpmEvent({
      actorType: "visitor",
      attribution: bpm.attribution,
      eventName: intent === "capture" ? "assessment_captured" : "assessment_process_requested",
      eventType: "funnel",
      locale: body.locale,
      planId: snapshot.planId,
      ray: typeof bpm.ray === "string" ? bpm.ray : null,
      ...healthScoreBpmFields(snapshot)
    });

    await enqueueAssessmentPregenerationTasks({
      answers: body.answers,
      locale: body.locale,
      planId: snapshot.planId
    });

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

    if (intent === "capture" && typeof body.paymentId === "string") {
      const boundPayment = await bindPaidReservationToAssessment({
        locale: isLocale(body.locale) ? body.locale : "en",
        paymentId: body.paymentId,
        planId: snapshot.planId
      });

      if (!boundPayment) {
        return NextResponse.json(
          { message: "Paid reservation could not be applied" },
          {
            headers: {
              "Cache-Control": "no-store"
            },
            status: 402
          }
        );
      }
    }

  } catch (error) {
    console.error("Unable to persist assessment submission", error);
    await writeBpmEvent({
      actorType: "system",
      attribution: bpm.attribution,
      errorCode: "assessment_persist_failed",
      errorMessage:
        error instanceof Error ? error.message : "Unable to persist assessment",
      eventName: "assessment_api_error",
      eventType: "error",
      locale: body.locale,
      ray: typeof bpm.ray === "string" ? bpm.ray : null,
      severity: "high"
    });

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

  const storedSnapshot =
    await getStoredHealthScoreAnalysisSnapshot(snapshot.planId) ??
    await getStoredAssessmentSnapshot(snapshot.planId);

  return NextResponse.json(storedSnapshot ?? snapshot, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
