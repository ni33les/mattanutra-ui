import { AGENT_CARD, SERVICE_SCOPE, READY_MEANING } from "@/lib/agentic/contract/agent-card";
export { AGENTIC_PUBLIC_TOOLS, type AgenticPublicToolName } from "@/lib/agentic/contract/names";

export const AGENTIC_TOOL_DESCRIPTIONS = {
  info: `${SERVICE_SCOPE} ${READY_MEANING} Call first: view=overview | client_guide | plan_schema (choose planOperation). Medication/condition codes are accepted inputs, not evidence of an assessed interaction.`,
  plan: `${SERVICE_SCOPE} ${READY_MEANING} Create/get/revise/answer/select; conversation default. get: status + knownResultVersion, or details + sections + expectedRevision (optionIds optional). requestPatch preserves context. Counts and health findings are advice; exclusions and physical quantities bind. Expanded adds attempts, not looser rules.`,
  evidence: "Read attached claim text for a plan’s returned evidenceHandle; mode=summary or sources. Does not change the plan.",
  execute: "After the person confirms the selected revision, create/recover checkout with the same idempotency key; health advice is advisory.",
  order: "Read payment/fulfilment: conversation for recovery; status + knownResultVersion to poll; details for frozen_order/events. Honor the last pollAfterSeconds until terminal=true.",
  support: "Open an order help case; include its returned supportHandle to reply.",
  feedback: "Submit optional feedback for one plan revision only with consentConfirmed=true; this never changes a plan or checkout."
} as const;

export const AGENTIC_UAT_TOOL_DESCRIPTIONS = AGENTIC_TOOL_DESCRIPTIONS;
export const AGENTIC_PRD_TOOL_DESCRIPTIONS = AGENTIC_TOOL_DESCRIPTIONS;
export const AGENTIC_SERVER_INSTRUCTIONS = AGENT_CARD;
export const AGENTIC_UAT_SERVER_INSTRUCTIONS = `${AGENT_CARD}\nUAT is for test payments only.`;
export const AGENTIC_PRD_SERVER_INSTRUCTIONS = `${AGENT_CARD}\nUse the merchant checkout; do not use test cards.`;
export function agenticServerInstructions(environment: "dev" | "prd" | "uat") {
  return environment === "uat" ? AGENTIC_UAT_SERVER_INSTRUCTIONS : environment === "prd" ? AGENTIC_PRD_SERVER_INSTRUCTIONS : AGENTIC_SERVER_INSTRUCTIONS;
}
export function agenticToolDescriptions(_environment: "dev" | "prd" | "uat", _locale?: string) {
  // Tool instructions are shared; info and plan supply localized customer copy.
  void _environment;
  void _locale;
  return AGENTIC_TOOL_DESCRIPTIONS;
}
