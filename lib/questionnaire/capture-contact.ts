import { assessmentContactEmailError, normalizeAssessmentContactEmail } from "@/lib/assessment-contact";
import type { Locale } from "@/lib/i18n";
import type { ChatDraft } from "@/lib/questionnaire/browser-draft";

/** Contact edits reuse the saved plan; they never submit questionnaire answers again. */
export async function syncCapturedQuestionnaireContact(draft: ChatDraft, locale: Locale, fetchImpl: typeof fetch): Promise<ChatDraft> {
  if (!draft.captured) return draft;
  if (assessmentContactEmailError(draft.contactEmail)) throw new Error("Enter a valid email address");
  const email = normalizeAssessmentContactEmail(draft.contactEmail);
  // Leaving this optional field blank does not erase an existing saved contact.
  if (!email || email === normalizeAssessmentContactEmail(draft.captured.contactEmail)) return draft;
  const response = await fetchImpl(`/api/assessment/${encodeURIComponent(draft.captured.planId)}/contact`, {
    method: "PATCH", headers: { "content-type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ contactEmail: email, locale })
  });
  const result = await response.json();
  if (!response.ok || result.planId !== draft.captured.planId || normalizeAssessmentContactEmail(result.contactEmail) !== email) {
    throw new Error("Could not save the email address");
  }
  return { ...draft, contactEmail: email, captured: { ...draft.captured, contactEmail: email }, updatedAt: Date.now() };
}
