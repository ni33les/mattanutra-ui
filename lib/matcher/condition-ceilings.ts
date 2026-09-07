const CKD_CODES = new Set(["ckd", "chronic_kidney_disease"]);
const MAGNESIUM = /magnesium|\bmag\b|^sup_mag$/i;

export function kidneyAnswerToConditionCode(kidney: string | null | undefined) {
  const value = kidney?.trim().toLowerCase();
  return value === "disease" || value === "reduced" ? "ckd" : null;
}

export function conditionImpliesCkd(conditionCodes: readonly string[] | null | undefined) {
  return (conditionCodes ?? []).some((code) =>
    CKD_CODES.has(code.trim().toLowerCase())
  );
}

export function subjectIsMagnesium(input: Readonly<{ name?: string; subjectId: string }>) {
  return (
    MAGNESIUM.test(input.subjectId) ||
    MAGNESIUM.test(input.name ?? "")
  );
}
