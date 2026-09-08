/** One agent-facing service card shared by initialize and the long-form guide. */
export const SERVICE_SCOPE = "MattaNutra matches agreed nutrient targets to a finite product catalogue in Thailand (THB); incidental nutrients may leave gaps. Wellness guidance, not diagnosis or pharmacy services.";
export const READY_MEANING = "Ready means checkout-ready, not complete coverage or medical approval.";
export const AGENT_CARD = `${SERVICE_SCOPE}
Flow: info → agree name/amount/unit/basis → plan(create) → explain closest_dose, highlightedAlternativeOptionId and advice → revise/answer/select → confirm with the person → execute → poll order.
Plan conversation is the default decision view. Poll with status; request details for doseFit, labels or economics.
Numeric pill, price and product counts are preferences; diet, exclusions and physical quantities bind.
Unknown diet stays unknown, never zero. ${READY_MEANING}
While processing, poll the existing handle; retry mutations with the same key and payload.
Call info first for the service card, templates and operation schemas.`;
