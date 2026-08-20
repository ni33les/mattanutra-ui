export const AGENTIC_SERVER_INSTRUCTIONS =
  "MattaNutra creates purchasable supplement stacks from a person’s agreed nutrient targets, constraints and safety context. Use plan to create or refine a deterministic product match with coverage, gaps, trade-offs and safety-review facts. Use execute only after the person explicitly approves a ready plan revision. Execute creates one external MattaNutra checkout. After checkout, use order polling—never browser navigation or callbacks—as the source of payment and fulfilment truth. Use support only for an existing order. MattaNutra supplies product and safety facts; it does not diagnose or replace qualified clinical advice.";

export const AGENTIC_TOOL_DESCRIPTIONS = {
  execute:
    "Freeze exactly one explicitly approved ready plan revision and create one external MattaNutra checkout. Send only planHandle, expectedRevision and a stable idempotencyKey. Do not call for needs_input or blocked plans, and do not rebuild or send product IDs.",
  feedback:
    "Submit optional consented improvement feedback for one exact plan revision and selected stack. This never changes a plan, checkout or order. Require consentConfirmed=true. Do not include capability values, contact details, payment secrets or a conversation transcript.",
  info: "Check MattaNutra availability, supported destinations, currencies, locales, catalogue concepts and the purchasing flow before planning. This tool does not create or change a plan, checkout, order or support case.",
  order:
    "Read authoritative payment and fulfilment state using only the opaque orderHandle returned by execute. Poll no faster than pollAfterSeconds, keep one call in flight, and stop at a terminal state. Browser state and human order references are not payment proof.",
  plan: "Create or refine a purchasable supplement stack from the person’s agreed targets, profile, current supplements, medication/condition context, dietary requirements, budget, pill/form limits and optimization priority. Omit planHandle to create; include planHandle and expectedRevision to submit the complete desired state for a revision. Use selectOptionId with planHandle and expectedRevision to choose one returned complete-stack option without rematching. This tool never purchases.",
  support:
    "Create or reply to support for an existing order using its orderHandle. Omit supportHandle to create a case; include it to reply to that case. Do not use this tool for planning, payment polling or general health advice."
} as const;

export const AGENTIC_PUBLIC_TOOLS = [
  "info",
  "plan",
  "execute",
  "order",
  "support",
  "feedback"
] as const;

export type AgenticPublicToolName = (typeof AGENTIC_PUBLIC_TOOLS)[number];
