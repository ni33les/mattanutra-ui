export const AGENTIC_SERVER_INSTRUCTIONS =
  "HARD RULE: Call tools only by the short names info, plan, execute, order, support, feedback. Never prefix mattanutra_dev. Never call mattanutra_dev.info, mattanutra_dev.plan, mattanutra_dev.execute, mattanutra_dev.order, mattanutra_dev.support, mattanutra_dev.feedback, or mattanutra_dev.mattanutra_dev.*. The catalog lists those six short names only. MattaNutra creates purchasable supplement stacks from a person’s agreed nutrient targets, constraints and safety context. Use plan to create or refine a deterministic product match with coverage, gaps, trade-offs and safety-review facts. In ordinary conversation, use execute only after the person explicitly approves that specific ready plan revision. When the host is running the official MattaNutra DEV QA pack and that pack already created a ready plan, calling execute with that planHandle and expectedRevision is allowed: the pack instruction is the person’s approval of that test checkout. DEV CHECKOUT IS A NATIVE HTML FORM, not a React SPA. Do not wait for hydration and do not click JavaScript handlers. GET execute.checkoutUrl, then POST application/x-www-form-urlencoded to the form action /api/mcp/checkout/{checkoutAccess}/pay with named fields customerName, phone, customerEmail, addressLine1, city, province, postalCode, country=TH, agentAuthorized=true, and scenario=decline_insufficient_funds (addressLine2 optional). Follow the 303 and poll order: paymentStatus=unpaid, latestPaymentAttempt=declined, latestPaymentReason=insufficient_funds, stateVersion=1. POST the same fields again with scenario=success, then poll order: paymentStatus=paid, stateVersion=2. The browser is not payment truth. Execute creates one external MattaNutra checkout. After checkout, use order polling—never browser navigation or callbacks—as the source of payment and fulfilment truth. Use support only for an existing order. MattaNutra supplies product and safety facts; it does not diagnose or replace qualified clinical advice.";

export const AGENTIC_TOOL_DESCRIPTIONS = {
  execute:
    "Freeze exactly one ready plan revision and create one external MattaNutra checkout. Send only planHandle, expectedRevision and a stable idempotencyKey. In ordinary conversation, call this only after the person explicitly approved that specific revision. When the host is running the official MattaNutra DEV QA pack and the pack itself created this ready plan, the pack instruction is that approval — call execute on that planHandle+revision to continue checkout. DEV checkout is a native HTML form POST to /api/mcp/checkout/{checkoutAccess}/pay (not a React SPA): named fields customerName, phone, customerEmail, addressLine1, city, province, postalCode, country=TH, agentAuthorized=true, scenario. For the pack, POST scenario=decline_insufficient_funds first, poll order, then POST scenario=success. Do not call for needs_input or blocked plans, and do not rebuild or send product IDs.",
  feedback:
    "Submit optional consented improvement feedback for one exact plan revision and selected stack. This never changes a plan, checkout or order. Require consentConfirmed=true. Do not include capability values, contact details, payment secrets or a conversation transcript.",
  info: "Check MattaNutra availability, supported destinations, currencies, locales and the purchasing flow before planning. This tool does not list supplement IDs or a catalogue dump, and it does not create or change a plan, checkout, order or support case.",
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
