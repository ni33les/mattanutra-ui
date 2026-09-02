import { recognisedNamesForPlanCopy } from "@/lib/agentic/catalogue/fixtures";
import { connectorCopy } from "@/lib/agentic/discovery/content";

function planRecognisedNamesSentence() {
  const names = recognisedNamesForPlanCopy();

  if (names.length < 2) {
    return `Recognised names include ${names[0] ?? "Vitamin D3"}.`;
  }

  return `Recognised names include ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}.`;
}

export const AGENTIC_SERVER_INSTRUCTIONS =
  "The purchasing flow is plan, then execute, then external MattaNutra checkout, then order polling. Polling is the only continuation method. Never represent payment as confirmed until order returns completed. After execute, the customer opens checkoutUrl on MattaNutra, enters delivery details for the planned destination country, ticks AI-agent authorization, and pays in Stripe Test Mode. Call tools only by the short names info, plan, execute, order, support, feedback, evidence. Never prefix mattanutra_dev. Use evidence with the plan evidenceHandle and claimIds to read approved sources; evidence never changes a plan. An algae-named omega-3 target is algae-source; fish DHA/EPA is wrong_source. Vitamin K2, MK-7 and Menaquinone-7 map to one recognised supplement and do not become leftover not_in_catalogue. expectedRevision plus answers and safetyAcknowledgement patches the current option without rematching; send a full request only when targets or requirements change. optionId stays sticky until the host selects another option or changes targets. After execute, or after 3 plan calls on the same planHandle, call feedback with rating 1-5 and points for stuck points (consentConfirmed=true). Feedback is stored in plan_feedback. Send plan request.profile.sex as female or male; omit the field if unknown. In ordinary conversation, use execute only after the person explicitly approves that specific ready plan revision. MattaNutra supplies product and safety facts; it does not diagnose or replace qualified clinical advice. Responsibility version is responsibility-3.0.0.";

export const AGENTIC_TOOL_DESCRIPTIONS = {
  evidence:
    "Read approved, plan-linked research claims for one evidence handle. Send only that handle, optional attached claim IDs, locale, and summary or sources. This never changes a plan.",
  execute:
    "After the person confirms one ready plan, create a single MattaNutra checkout for that revision. Send the plan handle, expected revision, and a stable idempotency key. Do not call this for a plan that still needs answers.",
  feedback:
    "Submit optional consented improvement notes for one plan revision. This never changes a plan or checkout. Require consentConfirmed=true.",
  info: connectorCopy("en"),
  order:
    "Read payment and fulfilment for an existing checkout using only the order handle. Poll no faster than pollAfterSeconds until the order is completed, cancelled, or expired.",
  plan: "Create or refine a supplement stack from agreed nutrient targets, profile, current intake, and constraints. Send profile.ageYears (not profile.age), profile.sex (female or male; omit the field if unknown), and profile.lifeStage. Send medications as request.medicationCodes and conditions as request.conditionCodes — not profile.medications, profile.conditions, medications, or conditions. Exclusions are request.requirements.excludeSupplementIds. request.optimization is one of balanced, best_coverage, lowest_cost, fewest_pills (a string, not an object). Target objects are name, amount, unit, and optional importance (core, optional, conditional, required; omitted importance stays required), acceptableRange, and prerequisite. algae_only remains its own flag. An algae-named omega-3 target is algae-source even without that flag; fish DHA/EPA is wrong_source. Set operation to create, revise, answer, select, or get. This tool never starts a purchase.",
  support:
    "Create or reply to a help case for an existing order. Omit supportHandle to open a case; include it to reply."
} as const;

export const AGENTIC_UAT_SERVER_INSTRUCTIONS =
  "The purchasing flow is plan, then execute, then external MattaNutra checkout, then order polling. Polling is the only continuation method. Never represent payment as confirmed until order returns completed. After execute, the customer opens checkoutUrl on MattaNutra, enters delivery details for the planned destination country, ticks AI-agent authorization, and pays in Stripe Test Mode. Use Stripe test card 4000000000009995 once for insufficient_funds, poll order until unpaid/declined/insufficient_funds/stateVersion=1, then pay the same checkout with 4242424242424242 and poll until paid/stateVersion=2. For 3DS use a separate unpaid checkout and card 4000000000003220. Do not use live cards. Do not use DEV mock payment scenarios or the DEV internal evidence harness. Do not use any callback, webhook-to-agent, or return-to-agent path. The calling agent learns payment and fulfilment ONLY by polling order(orderHandle). Call tools only by the short names info, plan, execute, order, support, feedback, evidence. Never prefix mattanutra_uat. Use evidence with the plan evidenceHandle and claimIds to read approved sources; evidence never changes a plan. When the user asks to run the UAT pack, open with Official MattaNutra UAT QA Pack and PASS or FAIL for U1 through U10 plus a /10 score. HARD RULE 6 — HOST FEEDBACK: After execute, or after 3 plan calls on the same planHandle, you MUST call feedback with rating 1-5 and points for stuck points (consentConfirmed=true). Feedback is stored in plan_feedback. This is required in ordinary conversation, not only the official pack. expectedRevision plus answers and safetyAcknowledgement patches the current option without rematching; send a full request only when targets or requirements change. optionId stays sticky until the host selects another option or changes targets. The Official MattaNutra Agentic QA Pack is a script, not an MCP tool; never add it to tools/list. Official MattaNutra Agentic QA Pack scores A1–A13 = 13/13 plus A15/A16; first line Official MattaNutra Agentic QA Pack, NN/13. When the user says run the full agentic test pack, follow A1–A13 and A15–A16 and print T1–T3. Send plan request.profile.sex as female or male; omit the field if unknown. Do not open with the D1–D10 /100 pack. A9 is GET-only; do not POST pay; do not ChatGPT. MattaNutra supplies product and safety facts; it does not diagnose or replace qualified clinical advice.";

export const AGENTIC_UAT_TOOL_DESCRIPTIONS = {
  evidence: AGENTIC_TOOL_DESCRIPTIONS.evidence,
  execute:
    "Freeze exactly one ready plan revision and create one external MattaNutra checkout. Send only planHandle, expectedRevision and a stable idempotencyKey. After checkoutUrl returns, the customer pays in Stripe Test Mode on the merchant checkout. Unpaid after execute is not a UAT pass. Do not call for needs_input or blocked plans.",
  feedback:
    "Submit optional consented improvement feedback for one exact plan revision and selected stack. This never changes a plan, checkout or order. Require consentConfirmed=true.",
  info: "Check MattaNutra availability, supported destinations, currencies, locales and the purchasing flow before planning. continuation is polling_only. supportedCountries is the live deliverable set from active retailers. If the customer is outside those countries, tell them politely that MattaNutra cannot deliver there yet. This tool does not list a catalogue dump.",
  order:
    "Read authoritative payment and fulfilment state using only the opaque orderHandle returned by execute. Poll no faster than pollAfterSeconds until the order is completed, cancelled, or expired. Do not infer payment success from the browser, and do not use callbacks or any other continuation method.",
  plan: "Create or refine a purchasable supplement stack from the person’s agreed targets, profile, medications, conditions and constraints. Send profile.ageYears (not profile.age), profile.sex (female or male; omit the field if unknown), and profile.lifeStage. Send medications as request.medicationCodes and conditions as request.conditionCodes — not profile.medications or profile.conditions. Exclusions are request.requirements.excludeSupplementIds. request.optimization is one of balanced, best_coverage, lowest_cost, fewest_pills. requirements.dietaryPreference=vegan implies algae omega-3 and excludes animal SKUs; algae_only remains its own flag. An algae-named omega-3 target is algae-source even without that flag; fish DHA/EPA is wrong_source. destinationCountry must be a country from info.supportedCountries; otherwise plan returns unsupported_country and a polite cannot-deliver message instead of substituting another country. Omit planHandle to create; include planHandle and expectedRevision to revise. This tool never purchases.",
  support:
    "Create or reply to support for an existing order using its orderHandle. Omit supportHandle to create a case; include it to reply."
} as const;

export const AGENTIC_PRD_SERVER_INSTRUCTIONS =
  "The purchasing flow is plan, then execute, then external MattaNutra checkout, then order polling. Polling is the only continuation method. Never represent payment as confirmed until order returns completed. After execute, the customer opens checkoutUrl on MattaNutra, enters delivery details for the planned destination country, ticks AI-agent authorization, and pays. Do not use Stripe test cards. Do not use DEV mock payment scenarios or the DEV internal evidence harness. Do not use any callback, webhook-to-agent, or return-to-agent path. The calling agent learns payment and fulfilment ONLY by polling order(orderHandle). Call tools only by the short names info, plan, execute, order, support, feedback, evidence. Never prefix a server name onto those tool names. Use evidence with the plan evidenceHandle and claimIds to read approved sources; evidence never changes a plan. HARD RULE 6 — HOST FEEDBACK: After execute, or after 3 plan calls on the same planHandle, you MUST call feedback with rating 1-5 and points for stuck points (consentConfirmed=true). Feedback is stored in plan_feedback. This is required in ordinary conversation. expectedRevision plus answers and safetyAcknowledgement patches the current option without rematching; send a full request only when targets or requirements change. optionId stays sticky until the host selects another option or changes targets. Send plan request.profile.sex as female or male; omit the field if unknown. MattaNutra supplies product and safety facts; it does not diagnose or replace qualified clinical advice.";

export const AGENTIC_PRD_TOOL_DESCRIPTIONS = {
  evidence: AGENTIC_TOOL_DESCRIPTIONS.evidence,
  execute:
    "After the person confirms one ready plan, create a single MattaNutra checkout for that revision. Send only planHandle, expectedRevision and a stable idempotencyKey. After checkoutUrl returns, the customer pays on the merchant checkout. Do not call for needs_input or blocked plans.",
  feedback: AGENTIC_UAT_TOOL_DESCRIPTIONS.feedback,
  info: AGENTIC_UAT_TOOL_DESCRIPTIONS.info,
  order: AGENTIC_UAT_TOOL_DESCRIPTIONS.order,
  plan: AGENTIC_UAT_TOOL_DESCRIPTIONS.plan,
  support: AGENTIC_UAT_TOOL_DESCRIPTIONS.support
} as const;

export function agenticServerInstructions(environment: "dev" | "prd" | "uat") {
  if (environment === "dev") {
    return AGENTIC_SERVER_INSTRUCTIONS;
  }

  if (environment === "prd") {
    return AGENTIC_PRD_SERVER_INSTRUCTIONS;
  }

  return AGENTIC_UAT_SERVER_INSTRUCTIONS;
}

export function agenticToolDescriptions(
  environment: "dev" | "prd" | "uat",
  locale?: string
) {
  const base =
    environment === "dev"
      ? AGENTIC_TOOL_DESCRIPTIONS
      : environment === "prd"
        ? AGENTIC_PRD_TOOL_DESCRIPTIONS
        : AGENTIC_UAT_TOOL_DESCRIPTIONS;
  return {
    ...base,
    info: connectorCopy(locale)
  };
}

export const AGENTIC_PUBLIC_TOOLS = [
  "info",
  "plan",
  "execute",
  "order",
  "support",
  "feedback",
  "evidence"
] as const;

export type AgenticPublicToolName = (typeof AGENTIC_PUBLIC_TOOLS)[number];
