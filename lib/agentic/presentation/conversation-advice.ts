import { canonicalHash } from "@/lib/agentic/value/canonical";
import { agenticMessage } from "@/lib/agentic/i18n";
import type { PlanSuccessWire, PlanConversationWire } from "@/lib/agentic/contract/outputs";
import { CONVERSATION_FINDING_KEYS } from "@/lib/agentic/contract/outputs";
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

/** Bound speaking turns, not the findings themselves. Distinct measurements
 * keep separate identities and units; full/details are never projected here. */
export function groupConversationAdvice(rows: PlanConversationWire["advice"], locale: string) {
  const ids = new Map(rows.map(row => [row.adviceId, row.adviceId]));
  if (rows.length <= 5) return { rows, ids };
  const buckets = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = ["incomplete_information", "dose_review", "interaction", "overlap"].includes(row.kind ?? "") ? row.kind! : "other";
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  const grouped = [...buckets.entries()].map(([kind, findings]) => {
    if (findings.length === 1) return findings[0];
    const adviceId = `advice_group_${canonicalHash(findings.map(row => row.adviceId)).slice(0, 12)}`;
    for (const row of findings) ids.set(row.adviceId, adviceId);
    const message = findings.map(row => row.kind === "dose_review" && row.exposure != null && row.threshold != null
      ? agenticMessage(locale as Locale, "guidance.measured_finding", { nutrient: row.nutrientName ?? row.ruleId, exposure: row.exposure, reference: row.threshold, unit: row.unit ?? "" })
      : row.message).map(speakableMessage).filter((message, index, all) => all.indexOf(message) === index).join(" ");
    const severity = findings.some(row => row.severity === "blocking") ? "blocking" : findings.some(row => row.severity === "high") ? "high" : "info";
    return { adviceId, guidanceId: adviceId, ruleId: `conversation_group:${kind}`, rulesVersion: findings[0].rulesVersion,
      kind: kind === "dose_review" ? "other" as const : kind as Advice["kind"], severity: severity as Advice["severity"], action: "review" as const,
      message, threshold: null, exposure: null, unit: null,
      findings: findings.map(row => Object.fromEntries(CONVERSATION_FINDING_KEYS.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]])) as NonNullable<PlanConversationWire["advice"][number]["findings"]>[number]) };
  });
  return { rows: grouped, ids };
}
