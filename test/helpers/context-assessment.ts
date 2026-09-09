/** Accepted vocabulary is not a clinical assessment. The maintained cases
 * require either an evidenced assessment or an explicit unassessed marker. */
export function hasContextAssessment(plan: Record<string, unknown>, kind: "medication" | "condition", code: string) {
  const list = (value: unknown) => Array.isArray(value) ? value : [];
  const suffix = kind === "medication" ? "MedicationCodes" : "ConditionCodes";
  const assessed = list(plan[`assessed${suffix}`]).includes(code);
  const unassessed = list(plan[`unassessed${suffix}`]).includes(code);
  const findings = list(plan.safetyGuidance) as Record<string, unknown>[];
  const evidenced = findings.some(row => kind === "medication" ? row.code === "medication_interaction" : row.code === "condition_review_required");
  const unknown = findings.some(row => list(row.uncertaintyCodes).includes(`${kind}_unassessed:${code}`));
  return list(plan[`${kind}Codes`]).includes(code) && (assessed !== unassessed) && (assessed ? evidenced : unknown);
}
