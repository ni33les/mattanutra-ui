import { canonicalHash } from "@/lib/agentic/value/canonical";
import type { PlanSuccessWire, PlanConversationWire } from "@/lib/agentic/contract/outputs";

type Advice = NonNullable<PlanSuccessWire["safetyGuidance"]>[number];
export function isMissingReference(row: Advice) {
  return row.threshold === null && (row.ruleId.startsWith("ul:missing:") || row.messageKey === "guidance.references_unknown" || row.messageKey === "guidance.reference_unknown");
}
export function isIncompleteInformation(row: Advice) {
  return isMissingReference(row) || row.kind === "incomplete_information" || row.code === "incomplete_information";
}
/** Display artifacts only; original amounts and evidence remain unchanged. */
export function speakableMessage(message: string) {
  return message.replace(/\b\d+\.\d{7,}\b/g, amount => String(Number(Number(amount).toPrecision(12))));
}

/** Conversation carries references, never label prose or exposure ledgers.
 * Group compatible flags while retaining every original guidance identity.
 * Details returns the complete findings for the referenced option IDs. */
export function conversationAdvice(plan: PlanSuccessWire, foreground: readonly (string | null)[]) {
  const unique = new Map<string, { row: Advice; optionIds: Set<string>; planWide: boolean }>();
  const add = (row: Advice, optionId?: string) => {
    const key = canonicalHash(row), item = unique.get(key) ?? { row, optionIds: new Set<string>(), planWide: false };
    if (optionId) item.optionIds.add(optionId); else item.planWide = true;
    unique.set(key, item);
  };
  for (const option of plan.options ?? []) if (foreground.includes(option.optionId)) for (const row of option.advice ?? []) add(row, option.optionId);
  for (const row of plan.safetyGuidance ?? []) add(row);
  const groups = new Map<string, { kind: PlanConversationWire["advice"][number]["kind"]; severity: Advice["severity"]; guidanceIds: Set<string>; optionIds: Set<string>; planWide: boolean }>();
  for (const { row, optionIds, planWide } of unique.values()) {
    const incomplete = isIncompleteInformation(row), kind = incomplete ? "incomplete_information" : row.kind ?? "other";
    const severity = incomplete ? "info" : row.severity;
    // Unknown-reference reminders form one plan-level flag. Other findings
    // retain their option attribution and severity, even for the same rule ID.
    const key = incomplete ? kind : canonicalHash({ kind, severity, optionIds: [...optionIds].sort(), planWide });
    const group = groups.get(key) ?? { kind, severity, guidanceIds: new Set<string>(), optionIds: new Set<string>(), planWide: incomplete || planWide };
    group.guidanceIds.add(row.guidanceId);
    for (const id of optionIds) group.optionIds.add(id);
    groups.set(key, group);
  }
  const advice: PlanConversationWire["advice"] = [], planAdviceIds: string[] = [];
  for (const group of groups.values()) {
    const flag = { kind: group.kind, severity: group.severity, guidanceIds: [...group.guidanceIds].sort(), optionIds: [...group.optionIds].sort() };
    const adviceId = `advice_${canonicalHash(flag).slice(0, 16)}`;
    advice.push({ adviceId, ...flag });
    if (group.planWide) planAdviceIds.push(adviceId);
  }
  return { advice, planAdviceIds };
}
