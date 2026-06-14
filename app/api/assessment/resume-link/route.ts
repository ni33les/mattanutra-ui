import { NextResponse } from "next/server";
import {
  buildAssessmentResumeEmailHtml,
  buildAssessmentResumeEmailSubject,
  buildAssessmentResumeUrl
} from "@/lib/assessment-resume-email";
import {
  createAssessmentResumeDraft,
  isAssessmentResumeSchemaError
} from "@/lib/assessment-resume-store";
import { bpmContextFromBody, writeBpmEvent } from "@/lib/bpm";
import { isLocale } from "@/lib/i18n";
import { sendTransactionalEmail } from "@/lib/smtp-email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: {
    answers?: unknown;
    contactEmail?: unknown;
    locale?: unknown;
    paymentId?: unknown;
    planId?: unknown;
    sectionIndex?: unknown;
  } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const bpm = bpmContextFromBody(body);
  const locale = isLocale(body.locale) ? body.locale : "en";

  try {
    const draft = await createAssessmentResumeDraft({
      answers: body.answers,
      contactEmail: body.contactEmail,
      locale,
      paymentId: body.paymentId,
      planId: body.planId,
      sectionIndex: body.sectionIndex
    });
    const resumeUrl = buildAssessmentResumeUrl(locale, draft.token);

    await writeBpmEvent({
      actorType: "visitor",
      attribution: bpm.attribution,
      email: draft.contactEmail,
      eventName: "assessment_resume_requested",
      eventType: "funnel",
      locale,
      planId: draft.planId,
      ray: typeof bpm.ray === "string" ? bpm.ray : null,
      properties: {
        draftId: draft.draftId,
        sectionIndex: draft.sectionIndex
      }
    });

    const emailResult = await sendTransactionalEmail({
      html: buildAssessmentResumeEmailHtml({ locale, resumeUrl }),
      subject: buildAssessmentResumeEmailSubject(locale),
      to: draft.contactEmail
    });

    await writeBpmEvent({
      actorType: emailResult.sent ? "system" : "visitor",
      attribution: bpm.attribution,
      email: draft.contactEmail,
      errorCode: emailResult.sent ? null : "assessment_resume_email_failed",
      errorMessage: emailResult.reason ?? null,
      eventName: emailResult.sent
        ? "assessment_resume_email_sent"
        : "assessment_resume_email_failed",
      eventStatus: emailResult.sent ? "sent" : "failed",
      eventType: emailResult.sent ? "email" : "error",
      locale,
      planId: draft.planId,
      ray: typeof bpm.ray === "string" ? bpm.ray : null
    });

    if (!emailResult.sent) {
      return NextResponse.json(
        { message: "We could not send the private link at this time." },
        {
          headers: { "Cache-Control": "no-store" },
          status: 502
        }
      );
    }

    return NextResponse.json(
      {
        planId: draft.planId,
        sent: true
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const schemaMissing = isAssessmentResumeSchemaError(error);

    if (schemaMissing) {
      console.error("[assessment-resume] schema missing", error);
    }

    await writeBpmEvent({
      actorType: "system",
      attribution: bpm.attribution,
      errorCode: schemaMissing
        ? "assessment_resume_schema_missing"
        : "assessment_resume_link_failed",
      errorMessage:
        error instanceof Error ? error.message : "Assessment resume link failed",
      eventName: schemaMissing
        ? "assessment_resume_schema_missing"
        : "assessment_resume_link_failed",
      eventType: "error",
      locale,
      ray: typeof bpm.ray === "string" ? bpm.ray : null,
      severity: "medium"
    });

    return NextResponse.json(
      {
        message: "We could not send the private link at this time."
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: schemaMissing ? 503 : 400
      }
    );
  }
}
