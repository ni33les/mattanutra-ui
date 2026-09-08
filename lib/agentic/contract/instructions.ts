import { GUIDE_ESSENTIALS, CLIENT_GUIDE_URI, CONTRACT_SCHEMA_URI } from "@/lib/agentic/contract/guide";
import { connectorCopy } from "@/lib/agentic/discovery/content";

export const AGENTIC_SERVER_INSTRUCTIONS = `${GUIDE_ESSENTIALS} Guide: ${CLIENT_GUIDE_URI}. Schema: ${CONTRACT_SCHEMA_URI}. DEV uses Stripe Test Mode; explicit customer confirmation of the exact current option/revision is required before execute. Feedback remains optional and requires explicit consent.`;

export const AGENTIC_TOOL_DESCRIPTIONS = {
  evidence:
    "Read approved, plan-linked research claims for one evidence handle. Send only that handle, optional attached claim IDs, locale, and summary or sources. This never changes a plan.",
  execute: "After explicit customer confirmation of this technically ready option/revision, create or recover its external checkout. Use the same idempotency key and payload for retries. Health advice does not block checkout. Existing checkout/payment identity takes priority over plan refresh.",
  feedback:
    "Submit optional consented improvement notes for one plan revision. This never changes a plan or checkout. Require consentConfirmed=true.",
  info: connectorCopy("en"),
  order:
    "Read payment and fulfilment using the existing order handle. Use responseView=conversation for recovery, status with knownResultVersion for small polls, or details with sections frozen_order/events. Omission remains full. Poll no faster than pollAfterSeconds while terminal is false, including after payment; stop when terminal is true.",
  plan: "Create, get, revise, answer or select agreed nutrient targets. Read each operation schema. revise.request replaces the request; revise.requestPatch merges objects and replaces arrays, [] clears, null clears only maxProductCount, maxDailyPills and maxPriceMinor; other nulls are invalid. No default product-count cap. Numeric maxProductCount, maxDailyPills and maxPriceMinor are advisory preferences, including zero; report deviations, never veto matching or purchase. More than 20% above a positive preference, or any amount above zero, is prominent advice. Targets default to basis=total_daily; use supplemental for supplement-only targets. Unknown dietary intake is never zero. requirements.productDoses evaluates returned products at supported labelled servingsPerDay; select a returned optionId after review. searchEffort=expanded requests more search, not relaxed constraints. requirements.excludeProductIds rejects one product; excludeSupplementIds excludes a nutrient. Health concerns are serious advice and never require acknowledgement. Unknown profile/intake is allowed. Use responseView=conversation for concise self-contained decisions; omission remains full. get supports status with knownResultVersion, or details with expectedRevision, sections and optional optionIds. Ordinary info gives one create example; info(view=plan_schema,planOperation=...) gives operation help. Retry with the same key and business payload; views do not change idempotency. Preserve constraints and confirm the selected revision before execute.",
  support:
    "Create or reply to a help case for an existing order. Omit supportHandle to open a case; include it to reply."
} as const;

export const AGENTIC_UAT_SERVER_INSTRUCTIONS = `${GUIDE_ESSENTIALS} UAT uses Stripe Test Mode. Do not use live cards or DEV mock scenarios. After execute or after 3 plan calls, optionally invite feedback, only when the person consents.`;

export const AGENTIC_UAT_TOOL_DESCRIPTIONS = {
  evidence: AGENTIC_TOOL_DESCRIPTIONS.evidence,
  execute:
    "Freeze exactly one ready plan revision and create one external MattaNutra checkout. Send only planHandle, expectedRevision and a stable idempotencyKey. After checkoutUrl returns, the customer pays in Stripe Test Mode on the merchant checkout. Unpaid after execute is not a UAT pass. Do not call for needs_input or blocked plans.",
  feedback: AGENTIC_TOOL_DESCRIPTIONS.feedback,
  info: "Check MattaNutra availability, supported destinations, currencies, locales and the purchasing flow before planning. continuation is polling_only. supportedCountries is the live deliverable set from active retailers. If the customer is outside those countries, tell them politely that MattaNutra cannot deliver there yet. This tool does not list a catalogue dump.",
  order: AGENTIC_TOOL_DESCRIPTIONS.order,
  plan: "Create or refine a purchasable supplement stack from the person’s agreed targets, profile, medications, conditions and constraints. Send profile.ageYears (not profile.age), profile.sex (female or male; omit the field if unknown), and profile.lifeStage. Send medications as request.medicationCodes and conditions as request.conditionCodes — not profile.medications or profile.conditions. Exclusions are request.requirements.excludeSupplementIds. request.optimization is one of balanced, best_coverage, lowest_cost, fewest_pills. requirements.dietaryPreference=vegan excludes animal SKUs independently of source preferences. Exact Algae Omega-3 resolves to Omega-3 only with explicit omega3SourcePreference=algae_only. Preserve omitted or conflicting source choices and explain the ambiguity without blocking other targets. destinationCountry must be a country from info.supportedCountries; otherwise plan returns unsupported_country and a polite cannot-deliver message instead of substituting another country. Omit planHandle to create; include planHandle and expectedRevision to revise. This tool never purchases.",
  support: AGENTIC_TOOL_DESCRIPTIONS.support
} as const;

export const AGENTIC_PRD_SERVER_INSTRUCTIONS = `${GUIDE_ESSENTIALS} The customer pays the merchant checkout; do not use test cards. Feedback requires explicit consent.`;

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
    plan: AGENTIC_TOOL_DESCRIPTIONS.plan,
    execute: AGENTIC_TOOL_DESCRIPTIONS.execute,
    info: connectorCopy(locale)
  };
}

export const AGENTIC_PUBLIC_TOOLS = [
  "info",
  "plan",
  "execute",
  "order",
  "support",
  "feedback"
] as const;

export type AgenticPublicToolName = (typeof AGENTIC_PUBLIC_TOOLS)[number];
