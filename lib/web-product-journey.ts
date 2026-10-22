/** Journey identity is assigned by the server, never by questionnaire answers. */
export const WEB_PRODUCT_JOURNEY_VERSION = "web-products-v1";

export function isWebProductJourney(value: unknown): boolean {
  return value === WEB_PRODUCT_JOURNEY_VERSION;
}

/** Stops new enrollment/offer retirement without revoking existing free access. */
export function webProductJourneyEnabled(): boolean {
  return process.env.WEB_PRODUCT_JOURNEY_ENABLED !== "0";
}

export function hasFullPlanAccess(input: { journeyVersion?: unknown; selectedPlan?: unknown }): boolean {
  return isWebProductJourney(input.journeyVersion) || Boolean(input.selectedPlan);
}

export function isPublicWebAssessment(answers: unknown): boolean {
  const value = answers && typeof answers === "object" ? answers as Record<string, unknown> : {};
  return !value.inStorePharmacy && value.channel !== "mcp" && value.source !== "mcp";
}
