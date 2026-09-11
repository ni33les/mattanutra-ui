import { positioning } from "@/lib/agentic/discovery/positioning";
import { agentCard, OVERVIEW_CARD, SERVICE_SCOPE, READY_MEANING } from "@/lib/agentic/contract/agent-card";
export { AGENTIC_PUBLIC_TOOLS, type AgenticPublicToolName } from "@/lib/agentic/contract/names";

const OPERATIONAL_DESCRIPTIONS = {
  info: `${SERVICE_SCOPE} ${READY_MEANING} Optional discovery: overview, client_guide or the unified plan_schema. Medication/condition codes are accepted inputs, not evidence of an assessed interaction.`,
  plan: OVERVIEW_CARD,
  execute: "After the person confirms the selected revision, create/recover checkout with the same idempotency key; health advice is advisory.",
  order: "Read one concise payment/fulfilment and recovery response. Honor pollAfterSeconds while nextAction=poll; follow the returned action.",
  support: "Open an order help case; include its returned supportHandle to reply.",
  feedback: "Submit optional feedback for one plan revision only with consentConfirmed=true; this never changes a plan or checkout."
} as const;

export const AGENTIC_TOOL_DESCRIPTIONS = agenticToolDescriptions("dev");
export const AGENTIC_UAT_TOOL_DESCRIPTIONS = AGENTIC_TOOL_DESCRIPTIONS;
export const AGENTIC_PRD_TOOL_DESCRIPTIONS = AGENTIC_TOOL_DESCRIPTIONS;
export const AGENTIC_SERVER_INSTRUCTIONS = agentCard("dev");
export const AGENTIC_UAT_SERVER_INSTRUCTIONS = agentCard("uat");
export const AGENTIC_PRD_SERVER_INSTRUCTIONS = agentCard("prd");
export function agenticServerInstructions(environment: "dev" | "prd" | "uat", locale?: string) { return agentCard(environment, locale); }
export function agenticToolDescriptions(_environment: "dev" | "prd" | "uat", locale?: string) {
  const purposes = positioning(locale).purposes;
  return Object.fromEntries(Object.entries(OPERATIONAL_DESCRIPTIONS).map(([name, details]) =>
    [name, `${purposes[name as keyof typeof purposes]} ${details}`])) as Record<keyof typeof OPERATIONAL_DESCRIPTIONS, string>;
}
