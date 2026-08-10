/**
 * Adapter: v14 HTML payload → existing assessment / BPM stack.
 * Does not rename answer keys or option values.
 */

import { createAssessmentSnapshot } from "@/lib/assessment-snapshot";
import {
  persistAssessmentSubmission,
  getStoredAssessmentSnapshot,
  getStoredHealthScoreAnalysisSnapshot
} from "@/lib/assessment-store";
import { writeBpmEvent } from "@/lib/bpm";
import { computeHealthScore } from "@/lib/health-score";
import { isLocale, type Locale } from "@/lib/i18n";
import { nutritionHealthScorePath } from "@/lib/nutrition-paths";
import { getEvaluatedIngredientCatalogueCount } from "@/lib/supplement-catalogue-count";
import {
  enqueueAssessmentPregenerationTasks,
  enqueueDueScheduledActions,
  scheduleReassessmentAction
} from "@/lib/task-worker";

export type V14SubmitPayload = Readonly<{
  answers?: Record<string, unknown>;
  completedAt?: number;
  e?: string;
  email?: string;
  events?: unknown[];
  lang?: string;
  precision?: number;
  sid?: string;
  startedAt?: number;
  version?: string;
}>;

function localeFromLang(lang: unknown): Locale {
  if (lang === "th" || lang === "th-TH") {
    return "th";
  }
  if (lang === "zh-CN" || lang === "zh") {
    return "zh-CN";
  }
  return "en";
}

function contactEmailFromAnswers(answers: Record<string, unknown> | undefined) {
  if (!answers) {
    return undefined;
  }
  for (const key of ["email", "reassessmentEmail", "contactEmail"]) {
    const value = answers[key];
    if (typeof value === "string" && value.includes("@")) {
      return value.trim();
    }
  }
  return undefined;
}

function reassessmentEmailFromAnswers(answers: Record<string, unknown> | undefined) {
  if (!answers) {
    return "";
  }
  const value = answers.reassessmentEmail;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Full quiz completion → create plan + healthscore + ready URL.
 */
export async function submitV14Questionnaire(
  payload: V14SubmitPayload,
  input: Readonly<{
    origin: string;
    request?: Request | null;
  }>
) {
  const answers =
    payload.answers && typeof payload.answers === "object" && !Array.isArray(payload.answers)
      ? payload.answers
      : null;

  if (!answers || Object.keys(answers).length < 1) {
    return {
      ok: false as const,
      status: 400,
      body: { message: "answers are required" }
    };
  }

  const locale = localeFromLang(payload.lang);
  const contactEmail =
    (typeof payload.email === "string" && payload.email.includes("@")
      ? payload.email.trim()
      : undefined) || contactEmailFromAnswers(answers);

  const healthScore = computeHealthScore(answers, locale, {
    evaluatedIngredientCount: await getEvaluatedIngredientCatalogueCount()
  });

  const snapshot = createAssessmentSnapshot({
    healthScore,
    status: "ready"
  });

  try {
    await persistAssessmentSubmission({
      answers,
      contactEmail,
      locale,
      selectedPlan: null,
      snapshot,
      status: "captured"
    });

    await writeBpmEvent({
      actorType: "visitor",
      email: contactEmail ?? null,
      eventName: "assessment_captured",
      eventType: "funnel",
      healthScore: healthScore.score,
      locale,
      planId: snapshot.planId,
      properties: {
        channel: "web",
        questionnaireFrontend: "v14-html",
        questionnaireVersion: payload.version ?? "v6-conversational",
        precision: payload.precision,
        sid: payload.sid,
        source: "questionnaire_v14_html"
      },
      request: input.request ?? undefined,
      scoreBand: healthScore.band
    });

    await writeBpmEvent({
      actorType: "visitor",
      email: contactEmail ?? null,
      eventName: "healthscore_ready",
      eventType: "funnel",
      healthScore: healthScore.score,
      locale,
      planId: snapshot.planId,
      properties: {
        channel: "web",
        questionnaireFrontend: "v14-html",
        sid: payload.sid
      },
      request: input.request ?? undefined,
      scoreBand: healthScore.band
    });

    await enqueueAssessmentPregenerationTasks({
      answers,
      locale,
      planId: snapshot.planId
    });

    const reassessmentEmail = reassessmentEmailFromAnswers(answers);
    if (reassessmentEmail) {
      await scheduleReassessmentAction({
        email: reassessmentEmail,
        locale,
        planId: snapshot.planId
      });
      void enqueueDueScheduledActions();
    }
  } catch (error) {
    return {
      ok: false as const,
      status: 500,
      body: {
        message:
          error instanceof Error ? error.message : "Unable to save assessment"
      }
    };
  }

  const path = nutritionHealthScorePath(locale, snapshot.planId);
  const healthScoreUrl = `${input.origin.replace(/\/+$/, "")}${path}`;

  // Confirm stored snapshot when possible
  const stored =
    (await getStoredHealthScoreAnalysisSnapshot(snapshot.planId)) ??
    (await getStoredAssessmentSnapshot(snapshot.planId));

  return {
    ok: true as const,
    status: 200,
    body: {
      healthScoreUrl,
      healthscoreUrl: healthScoreUrl,
      resultUrl: healthScoreUrl,
      url: healthScoreUrl,
      planId: snapshot.planId,
      status: stored?.status ?? snapshot.status,
      healthScore: stored?.healthScore ?? snapshot.healthScore
    }
  };
}

/**
 * Delayed email capture from calc fallback / email field.
 */
export async function captureV14Email(
  payload: V14SubmitPayload,
  input: Readonly<{ request?: Request | null }>
) {
  const email =
    typeof payload.email === "string" ? payload.email.trim() : "";

  if (!email.includes("@")) {
    return {
      ok: false as const,
      status: 400,
      body: { message: "Valid email is required" }
    };
  }

  const locale = localeFromLang(payload.lang);

  await writeBpmEvent({
    actorType: "visitor",
    email,
    eventName: "email_capture",
    eventType: "funnel",
    locale,
    properties: {
      channel: "web",
      e: payload.e ?? "email_capture",
      questionnaireFrontend: "v14-html",
      sid: payload.sid,
      source: "v14_delayed_result_fallback"
    },
    request: input.request ?? undefined
  });

  return {
    ok: true as const,
    status: 200,
    body: { ok: true, email }
  };
}

/**
 * Per-event analytics beacon from MN_CONFIG.trackEndpoint.
 */
export async function trackV14Event(
  event: Record<string, unknown>,
  input: Readonly<{ request?: Request | null }>
) {
  const e = typeof event.e === "string" ? event.e : "track";
  const lang = event.lang;
  const locale = localeFromLang(lang);

  await writeBpmEvent({
    actorType: "visitor",
    eventName: `questionnaire_v14_${e}`,
    eventType: "funnel",
    locale,
    properties: {
      channel: "web",
      questionnaireFrontend: "v14-html",
      k: event.k ?? null,
      v: event.v ?? null,
      t: event.t ?? null,
      sid: event.sid ?? null,
      rawEvent: e
    },
    request: input.request ?? undefined
  });

  // Mirror key funnel names used by Meta mapping when applicable
  if (e === "complete") {
    await writeBpmEvent({
      actorType: "visitor",
      eventName: "assessment_submitted",
      eventType: "funnel",
      locale,
      properties: {
        channel: "web",
        questionnaireFrontend: "v14-html",
        sid: event.sid ?? null
      },
      request: input.request ?? undefined
    });
  }

  if (e === "start" || e === "view") {
    await writeBpmEvent({
      actorType: "visitor",
      eventName: e === "start" ? "assessment_started" : "chat_view",
      eventType: "funnel",
      locale,
      properties: {
        channel: "web",
        questionnaireFrontend: "v14-html",
        sid: event.sid ?? null
      },
      request: input.request ?? undefined
    });
  }

  return { ok: true as const };
}

export function isLocaleSupportedForV14(locale: string): locale is Locale {
  return locale === "en" || locale === "th" || isLocale(locale);
}
