import { NextResponse } from "next/server";
import {
  createAssessmentSnapshot,
  DEFAULT_ASSESSMENT_PLAN
} from "@/lib/assessment-snapshot";
import {
  getStoredAssessmentPrefill,
  getStoredAssessmentSnapshot,
  getStoredHealthScoreAnalysisSnapshot,
  isUuid,
  persistAssessmentSubmission
} from "@/lib/assessment-store";
import { firstNameFromAssessmentAnswers } from "@/lib/assessment-first-name";
import { computeHealthScore } from "@/lib/health-score";
import {
  enqueueAssessmentPregenerationTasks,
  enqueueDueScheduledActions,
  scheduleReassessmentAction
} from "@/lib/task-worker";
import { bpmContextFromBody, writeBpmEvent } from "@/lib/bpm";
import { isLocale } from "@/lib/i18n";
import { bindPaidReservationToAssessment } from "@/lib/stripe-payments";
import {
  finalizeAssessmentResumeDraft,
  finalizeAssessmentResumeDraftForContact
} from "@/lib/assessment-resume-store";
import { createLogger } from "@/lib/logger";
import {
  enforceRateLimit,
  publicRateLimits
} from "@/lib/rate-limit";
import { cachedEvaluatedIngredientCatalogueCount } from "@/lib/supplement-catalogue-count";
import {
  mergeInStorePharmacyAnswers,
  resolveCapturePharmacy
} from "@/lib/pharmacy-in-store";

export const runtime = "nodejs";

const log = createLogger("api.assessment.plan");

function reassessmentEmailFromAnswers(answers: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return "";
  }

  const value = (answers as Record<string, unknown>).reassessmentEmail;

  return typeof value === "string" ? value : "";
}

async function buildHealthScore(answers: unknown, locale: unknown) {
  const normalizedLocale = isLocale(locale) ? locale : "en";

  return computeHealthScore(answers, normalizedLocale, {
    evaluatedIngredientCount: cachedEvaluatedIngredientCatalogueCount()
  });
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

  if (!healthScoreView) {
    void enqueueDueScheduledActions();
  }

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
  const limited = enforceRateLimit(
    request,
    publicRateLimits.assessmentPlanMutation
  );

  if (limited) {
    return limited;
  }

  const { planId } = await params;
  let body: {
    answers?: unknown;
    contactEmail?: unknown;
    intent?: "capture" | "process";
    locale?: unknown;
    paymentId?: unknown;
    pharmacyId?: unknown;
    plan?: unknown;
    resumeToken?: unknown;
  } = {};

  try {
    body = (await request.json()) as {
      answers?: unknown;
      contactEmail?: unknown;
      intent?: "capture" | "process";
      locale?: unknown;
      paymentId?: unknown;
      pharmacyId?: unknown;
      plan?: unknown;
      resumeToken?: unknown;
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

  try {
    const existingSnapshot = await getStoredAssessmentSnapshot(planId);
    const existingPrefill = await getStoredAssessmentPrefill(planId);
    const { invalidRequested, pharmacy } = await resolveCapturePharmacy(
      body.pharmacyId,
      existingPrefill?.answers
    );

    if (invalidRequested) {
      return NextResponse.json(
        { message: "Pharmacy not found" },
        {
          headers: {
            "Cache-Control": "no-store"
          },
          status: 404
        }
      );
    }

    const skipHealthScore = Boolean(pharmacy);
    const effectiveAnswers = pharmacy
      ? mergeInStorePharmacyAnswers(
          body.answers === undefined ? existingPrefill?.answers : body.answers,
          pharmacy
        )
      : body.answers === undefined
        ? existingPrefill?.answers
        : body.answers;
    const selectedPlan =
      existingPrefill?.plan ??
      (skipHealthScore ? DEFAULT_ASSESSMENT_PLAN : null);
    const healthScore = skipHealthScore
      ? existingPrefill?.healthScore ?? undefined
      : await buildHealthScore(effectiveAnswers, body.locale);
    const snapshot = createAssessmentSnapshot({
      healthScore,
      plan: selectedPlan ?? existingSnapshot?.plan,
      planId,
      queuePosition: existingSnapshot?.queuePosition,
      status: "ready"
    });

    await persistAssessmentSubmission({
      answers: effectiveAnswers,
      contactEmail: body.contactEmail,
      locale: body.locale,
      selectedPlan,
      skipHealthScore,
      snapshot,
      status: "captured"
    });

    if (typeof body.paymentId === "string") {
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

    void (async () => {
      try {
        const finalizedResumeEmail =
          (await finalizeAssessmentResumeDraft({
            planId: snapshot.planId,
            token: body.resumeToken
          })) ??
          (await finalizeAssessmentResumeDraftForContact({
            contactEmail: body.contactEmail,
            planId: snapshot.planId
          }));

        if (finalizedResumeEmail) {
          await writeBpmEvent({
            actorType: "visitor",
            attribution: bpm.attribution,
            email: finalizedResumeEmail,
            eventName: "assessment_resume_finalized",
            eventType: "funnel",
            locale: body.locale,
            planId: snapshot.planId,
            ray: typeof bpm.ray === "string" ? bpm.ray : null
          });
        }

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

        await enqueueAssessmentPregenerationTasks({
          answers: effectiveAnswers,
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
      } catch (error) {
        log.error("Unable to finish assessment capture side effects", {
          error,
          planId: snapshot.planId
        });
      }
    })();

    return NextResponse.json(
      {
        ...snapshot,
        firstName: firstNameFromAssessmentAnswers(effectiveAnswers)
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    log.error("Unable to persist assessment plan selection", { error, planId });
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
