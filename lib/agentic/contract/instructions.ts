import { AGENT_CARD } from "@/lib/agentic/contract/agent-card";
export { AGENTIC_PUBLIC_TOOLS, type AgenticPublicToolName } from "@/lib/agentic/contract/names";

export const AGENTIC_TOOL_DESCRIPTIONS = {
  info: "Service card and contract. Call first. view=overview | client_guide | plan_schema; set planOperation for one operation schema.",
  plan: "Create, get, revise, answer or select a plan. Default response is conversation. get supports status + knownResultVersion, or details + sections + expectedRevision + optional optionIds. requestPatch preserves context. Expanded search adds attempts, not looser rules.",
  evidence: "Read attached claim text for a plan’s returned evidenceHandle; mode=summary or sources. Does not change the plan.",
  execute: "After the person confirms the selected revision, create or recover its checkout using the same idempotency key; health advice does not block purchase.",
  order: "Read payment and fulfilment: conversation for recovery, status + knownResultVersion for polls, details + frozen_order/events for facts; honor the last pollAfterSeconds until terminal=true.",
  support: "Open or reply to a help case for an order; omit supportHandle to open, include it to reply.",
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
  return AGENTIC_TOOL_DESCRIPTIONS;
}
