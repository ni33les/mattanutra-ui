import { NextResponse } from "next/server";
import {
  createAssessmentSnapshot,
  DEFAULT_ASSESSMENT_PLAN
} from "@/lib/assessment-snapshot";
import { persistAssessmentSubmission } from "@/lib/assessment-store";
import { firstNameFromAssessmentAnswers } from "@/lib/assessment-first-name";
import { computeHealthScore } from "@/lib/health-score";
import {
  mergeInStorePharmacyAnswers,
  resolveCapturePharmacy
} from "@/lib/pharmacy-in-store";
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
import { getEvaluatedIngredientCatalogueCount } from "@/lib/supplement-catalogue-count";

export const runtime = "nodejs";

const log = createLogger("api.assessment");

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
    evaluatedIngredientCount: await getEvaluatedIngredientCatalogueCount()
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

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, publicRateLimits.assessmentPost);

  if (limited) {
    return limited;
  }

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

  const { invalidRequested, pharmacy } = await resolveCapturePharmacy(
    body.pharmacyId
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
  const answers = pharmacy
    ? mergeInStorePharmacyAnswers(body.answers, pharmacy)
    : body.answers;
  const snapshot = createAssessmentSnapshot({
    healthScore: skipHealthScore
      ? undefined
      : await buildHealthScore(answers, body.locale),
    plan: DEFAULT_ASSESSMENT_PLAN,
    status: "ready"
  });

  try {
    await persistAssessmentSubmission({
      answers,
      contactEmail: body.contactEmail,
      locale: body.locale,
      selectedPlan: skipHealthScore ? DEFAULT_ASSESSMENT_PLAN : null,
      skipHealthScore,
      snapshot,
      status: "captured"
    });

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
    log.error("Unable to persist assessment submission", { error });
    void writeBpmEvent({
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
            ? "assessment_captured"
            : "assessment_process_requested",
        eventType: "funnel",
        locale: body.locale,
        planId: snapshot.planId,
        ray: typeof bpm.ray === "string" ? bpm.ray : null,
        ...healthScoreBpmFields(snapshot)
      });

      await enqueueAssessmentPregenerationTasks({
        answers,
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
      log.error("Unable to finish assessment capture side effects", { error });
    }
  })();

  return NextResponse.json(
    {
      ...snapshot,
      firstName: firstNameFromAssessmentAnswers(body.answers)
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
