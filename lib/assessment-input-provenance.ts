export const ASSESSMENT_INPUT_PROVENANCE = "inputProvenance";

export type AssessmentInputProvenance = Readonly<{
  version: 1;
  knownFields: readonly string[];
  rawAnswers: Readonly<Record<string, unknown>>;
}>;

export function captureInputProvenance(raw: Record<string, unknown>): AssessmentInputProvenance {
  const rawAnswers = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== ASSESSMENT_INPUT_PROVENANCE));
  return {
    version: 1,
    knownFields: Object.keys(rawAnswers).filter(key => {
      const value = rawAnswers[key];
      return value !== null && value !== undefined && value !== "" &&
        !(typeof value === "string" && ["unknown", "not_sure", "unsure", "skip"].includes(value.toLowerCase()));
    }).sort(),
    rawAnswers
  };
}

export function inputProvenance(value: unknown): AssessmentInputProvenance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return row.version === 1 && Array.isArray(row.knownFields) && row.knownFields.every(v => typeof v === "string") &&
    row.rawAnswers && typeof row.rawAnswers === "object" && !Array.isArray(row.rawAnswers)
    ? row as AssessmentInputProvenance : null;
}

/** Legacy numeric defaults are not evidence that a demographic answer was supplied. */
export function assessmentFieldKnown(answers: unknown, field: string): boolean {
  if (!answers || typeof answers !== "object") return false;
  const row = answers as Record<string, unknown>;
  const provenance = inputProvenance(row[ASSESSMENT_INPUT_PROVENANCE]);
  return provenance?.knownFields.includes(field) ?? false;
}
