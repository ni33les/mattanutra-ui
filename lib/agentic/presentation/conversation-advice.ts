import { canonicalHash } from "@/lib/agentic/value/canonical";
import { agenticMessage } from "@/lib/agentic/i18n";
import type { PlanSuccessWire } from "@/lib/agentic/contract/outputs";
import type { Locale } from "@/lib/i18n";

type Advice = NonNullable<PlanSuccessWire["safetyGuidance"]>[number];
export function isMissingReference(row: Advice) {
  return row.threshold === null && (row.ruleId.startsWith("ul:missing:") || row.messageKey === "guidance.references_unknown" || row.messageKey === "guidance.reference_unknown");
}
export function isIncompleteInformation(row: Advice) {
  return isMissingReference(row) || row.kind === "incomplete_information" || row.code === "incomplete_information";
}
/** Round display artifacts only. Quantities used by scoring and evidence are unchanged. */
export function speakableMessage(message: string) {
  return message.replace(/\b\d+\.\d{7,}\b/g, amount => String(Number(Number(amount).toPrecision(12))));
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
    action: "review", severity: "info",
    messageKey: "guidance.references_unknown", message: agenticMessage(locale as Locale, "guidance.references_unknown", { nutrients: names.join(", ") }),
    nutrientName: names.join(", "), supplementIds, productIds, contributors: [], exposure: null, threshold: null,
    unit: null, sourceScope: null, comparator: null };
}

export function incompleteInformationNotice(rows: readonly Advice[], locale: string): Advice | null {
  if (!rows.length) return null;
  const missing = missingReferenceNotice(rows.filter(isMissingReference), locale);
  const messages = [...new Set([...(missing ? [missing.message] : []), ...rows.filter(row => !isMissingReference(row)).map(row => row.message)])];
  const codes = [...new Set(rows.flatMap(row => row.uncertaintyCodes ?? []))].sort();
  return { ...(missing ?? rows[0]), guidanceId: `gdn:incomplete:${canonicalHash(rows).slice(0, 16)}`,
    ruleId: "incomplete_information", kind: "incomplete_information", code: "incomplete_information", severity: "info", action: "review",
    message: messages.map(speakableMessage).join(" "), uncertaintyCodes: codes,
    productIds: [...new Set(rows.flatMap(row => row.productIds ?? []))].sort(),
    supplementIds: [...new Set(rows.flatMap(row => row.supplementIds ?? []))].sort(),
    evidence: [...new Set(rows.flatMap(row => row.evidence ?? []))].sort(),
    uncertainty: [...new Set(rows.flatMap(row => row.uncertainty ? [row.uncertainty] : []))].join(" "),
    threshold: null, exposure: null, unit: null, contributors: [], comparator: null };
}
