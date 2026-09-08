import { canonicalHash } from "@/lib/agentic/value/canonical";
import { agenticMessage } from "@/lib/agentic/i18n";
import type { PlanSuccessWire } from "@/lib/agentic/contract/outputs";
import type { Locale } from "@/lib/i18n";

type Advice = NonNullable<PlanSuccessWire["safetyGuidance"]>[number];
export function isMissingReference(row: Advice) {
  return row.threshold === null && row.ruleId.startsWith("ul:missing:");
}

/** A presentation notice only. Every original exposure/reference remains in
 * full/details; measurements from different nutrients are never added. */
export function missingReferenceNotice(rows: readonly Advice[], locale: string): Advice | null {
  if (!rows.length) return null;
  const unique = [...new Map(rows.map(row => [canonicalHash(row), row])).values()];
  const names = [...new Set(unique.map(row => row.nutrientName ?? row.supplementIds?.join(", ") ?? ""))].filter(Boolean).sort();
  const supplementIds = [...new Set(unique.flatMap(row => row.supplementIds ?? []))].sort();
  const productIds = [...new Set(unique.flatMap(row => row.productIds ?? []))].sort();
  const identity = canonicalHash(unique.map(canonicalHash).sort());
  return { guidanceId: `gdn:missing_references:${identity.slice(0, 16)}`, ruleId: "incomplete_reference_information",
    rulesVersion: unique[0].rulesVersion, code: "incomplete_information", kind: "incomplete_information",
    action: "review", severity: unique.some(row => row.severity === "high") ? "high" : "info",
    messageKey: "guidance.references_unknown", message: agenticMessage(locale as Locale, "guidance.references_unknown", { nutrients: names.join(", ") }),
    nutrientName: names.join(", "), supplementIds, productIds, contributors: [], exposure: null, threshold: null,
    unit: null, sourceScope: null, comparator: null };
}
