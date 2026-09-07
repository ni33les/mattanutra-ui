import { agenticMessage, negotiateLocale } from "@/lib/agentic/i18n";
import type { MatchingDiagnostics } from "@/lib/matcher/diagnostics";

export type MatchingExplanation = Readonly<{
  reasonCode: string;
  message: string;
  messageKey: string;
  recoveryActions: readonly ("review_options" | "refine_request" | "expand_search" | "no_purchase")[];
}>;

export function matchingExplanationFor(input: Readonly<{
  diagnostics?: MatchingDiagnostics;
  empty: boolean;
  hasPurchaseOptions: boolean;
  canExpand?: boolean;
  hasUnmetTargets: boolean;
  durationUnknown?: boolean;
  locale?: string;
}>): MatchingExplanation | undefined {
  if (!input.diagnostics && (!input.empty || !input.hasUnmetTargets)) return undefined;
  const reasonCode = input.diagnostics?.reasonCode ?? "explanation_unavailable";
  const messageKey = `plan.matching.${reasonCode}`;
  const recoveryActions: MatchingExplanation["recoveryActions"][number][] = [];
  if (input.hasPurchaseOptions) recoveryActions.push("review_options");
  if (input.canExpand) recoveryActions.push("expand_search");
  if (input.empty && input.hasUnmetTargets && !input.hasPurchaseOptions) recoveryActions.push("refine_request");
  if (!recoveryActions.length && input.empty) recoveryActions.push("no_purchase");
  const locale = negotiateLocale(input.locale);
  const message = [agenticMessage(locale, messageKey),
    ...(input.empty && input.durationUnknown ? [agenticMessage(locale, "plan.compact.why.duration_unknown")] : [])].join(" ");
  return { reasonCode, messageKey, message, recoveryActions };
}
