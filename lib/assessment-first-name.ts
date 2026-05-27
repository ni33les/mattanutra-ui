export const ASSESSMENT_FIRST_NAME_MAX_LENGTH = 40;

const FIRST_NAME_BLOCKLIST = new Set([
  "anonymous",
  "asdf",
  "butt",
  "monkeyface",
  "na",
  "nil",
  "nobody",
  "none",
  "noone",
  "null",
  "poop",
  "qwerty",
  "test",
  "undefined",
  "xxx"
]);

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

  const compact = normalized.replace(/[\s'’-]/gu, "").toLowerCase();
  const firstToken = normalized.split(" ")[0]?.toLowerCase() ?? "";

  if (FIRST_NAME_BLOCKLIST.has(compact) || FIRST_NAME_BLOCKLIST.has(firstToken)) {
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
