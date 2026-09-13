import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChatQuestionnaire } from "@/components/chat-questionnaire/chat-questionnaire";
import { AssessmentFlow } from "@/components/assessment-flow";
import { getStoredAssessmentPrefill, isUuid } from "@/lib/assessment-store";
import { getAssessmentResumeDraft } from "@/lib/assessment-resume-store";
import { inStorePharmacyFromAnswers, type PharmacyOrganisation } from "@/lib/pharmacy-in-store";
import { pharmacyPath } from "@/lib/pharmacy-journey";
import { devShortcutsEnabledForHost } from "@/lib/dev-shortcuts";
import type { Locale } from "@/lib/i18n";
export async function PharmacyQuiz({ locale, pharmacy, query }: { locale: Locale; pharmacy: PharmacyOrganisation; query: Record<string, string | undefined> }) {
  const resume = query.resume ? await getAssessmentResumeDraft(query.resume) : null;
  if (query.resume && !resume) notFound();
  const planId = query.plan || resume?.planId;
  if (planId && !isUuid(planId)) notFound();
  const prefill = planId ? await getStoredAssessmentPrefill(planId) : null;
  if (prefill && inStorePharmacyFromAnswers(prefill.answers)?.id !== pharmacy.id) notFound();
  if (resume && query.plan && resume.planId !== query.plan) notFound();
  if (query.plan && !prefill && !resume) notFound();
  if (resume?.paymentId) notFound();
  if (!query.session && !planId) redirect(pharmacyPath(locale, pharmacy.slug, "quiz", { ...query, session: randomUUID() }));
  if (query.session && !isUuid(query.session)) notFound();
  const sessionId = query.session || resume?.draftId || planId;
  const requestHeaders = await headers();
  const showDevShortcut = devShortcutsEnabledForHost(requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"));
  const flag = process.env.NEXT_PUBLIC_CHAT_QUESTIONNAIRE_V6 ?? process.env.NEXT_PUBLIC_CHAT_QUESTIONNAIRE_V5;
  if (flag === "0" || flag === "false") return <AssessmentFlow locale={locale} initialStage="quiz" pharmacyId={pharmacy.slug} skipHealthScore
    sessionId={sessionId} assessmentRevision={prefill?.revision ?? 0} serverUpdatedAt={prefill?.updatedAt ?? resume?.updatedAt}
    prefillAnswers={prefill?.answers ?? resume?.answers ?? null} prefillContactEmail={prefill?.contactEmail ?? resume?.contactEmail ?? null}
    returningPlanId={planId} resumeToken={query.resume} showDevShortcut={showDevShortcut} />;
  return <ChatQuestionnaire locale={locale} pharmacyId={pharmacy.slug} skipHealthScore sessionId={sessionId} returningPlanId={planId}
    resumeToken={query.resume} reviewRequested={query.edit === "1" || query.reassessment === "1"} showDevShortcut={showDevShortcut}
    serverDraft={prefill ? { ...prefill, captured: true, paymentId: "" } : resume ? { ...resume, revision: 0, captured: false } : null} />;
}
