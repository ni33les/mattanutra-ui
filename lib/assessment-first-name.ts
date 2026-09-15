export const ASSESSMENT_FIRST_NAME_MAX_LENGTH = 40;

/** Only supplied name fields identify a customer; demographic summary text never does. */
export function firstNameFromFormulation(result: {
  firstName?: string | null;
  assessmentSummary: { firstName?: string | null; profile?: string };
}) {
  return [result.firstName, result.assessmentSummary.firstName]
    .find(value => typeof value === "string" && value.trim())?.trim() ?? "";
}

function clampGraphemes(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("");
}

export function normalizeAssessmentFirstName(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = clampGraphemes(
    value.normalize("NFKC").replace(/\s+/gu, " ").trim(),
    ASSESSMENT_FIRST_NAME_MAX_LENGTH
  ).trim();

  if (normalized.length < 2) {
    return null;
  }

  if (/[0-9]/u.test(normalized)) {
    return null;
  }

  if (/[^\p{L}\p{M}\s'’-]/u.test(normalized)) {
    return null;
  }

  return normalized;
}

export function firstNameFromAssessmentAnswers(answers: unknown) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return null;
  }

  const record = answers as Record<string, unknown>;

  return normalizeAssessmentFirstName(record.firstName ?? record.first_name);
}
