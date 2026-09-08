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

/** The same eight-line overview appears in info and on the public plan tool. */
export const OVERVIEW_CARD = `Thailand (TH) only; a finite catalogue with incidental nutrients, so gaps are real.
Agree name/amount/unit/basis before create: total_daily includes diet and supplements; supplemental excludes diet. Unknown intake is never zero.
Health findings and numeric preferences are advice; diet, exclusions and physical quantities bind. Ready/purchaseEligible means checkout-ready, not targets met or medical approval.
Medication/condition codes are accepted inputs; they do not guarantee an interaction row. Codes without a fired rule are explicitly unassessed, never cleared. Report interactions only when returned advice.kind=interaction.
Review closest_dose, highlightedAlternativeOptionId and advice; refine with requestPatch to preserve context, then confirm before execute.
Plan defaults to conversation. Poll status + knownResultVersion using pollAfterSeconds from the last response (overview 3 is a hint). During processing use the same handle; retry mutations with the same key and payload.
Tools: info, plan, execute, order, support, feedback, evidence. Native MCP names are unprefixed; hosts may wrap them (mattanutra_dev___plan). Call the name the host lists.
Examples are templates: use returned values. Get the guide through info(view=client_guide), or one schema through info(view=plan_schema,planOperation=...).`;
