import type postgres from "postgres";
import { inStorePharmacyFromAnswers, productCountryCodeFromAnswers } from "@/lib/pharmacy-in-store";
import { normalizeProductCountryCode, type ProductCountryCode } from "@/lib/product-countries";
import { isWebProductJourney, WEB_PRODUCT_JOURNEY_VERSION } from "@/lib/web-product-journey";

/** The public web shop currently sources in Thailand. Residence is health context;
 * the delivery address is collected and independently validated at checkout.
 * journeyVersion must come from the saved assessment, never questionnaire answers.
 */
export const WEB_PRODUCT_SOURCING_COUNTRY = "TH";

export function usesWebProductMarket(answers: unknown, journeyVersion: unknown): boolean {
  return isWebProductJourney(journeyVersion) && !inStorePharmacyFromAnswers(answers);
}

export function assessmentProductMarket(answers: unknown, journeyVersion: unknown): ProductCountryCode {
  return usesWebProductMarket(answers, journeyVersion)
    ? WEB_PRODUCT_SOURCING_COUNTRY
    : productCountryCodeFromAnswers(answers);
}

/** Existing matcher tasks already freeze the market in their freshness snapshot. */
export function productTaskMarket(payload: unknown): ProductCountryCode | null {
  const row = payload && typeof payload === "object" ? (payload as { row?: unknown }).row : null;
  return normalizeProductCountryCode(row && typeof row === "object" ? (row as { countryCode?: unknown }).countryCode : null);
}

/** Old residence-market runs cannot satisfy the public shop's current selection. */
export function currentWebProductMarketSql(
  sql: postgres.Sql | postgres.TransactionSql,
  assessmentAlias: "a" | "assessments",
  runAlias: "r" | "product_recommendation_runs"
) {
  const assessment = sql(assessmentAlias), run = sql(runAlias);
  return sql`(${assessment}.journey_version is distinct from ${WEB_PRODUCT_JOURNEY_VERSION}
    or (jsonb_typeof(${assessment}.answers->'inStorePharmacy') = 'object'
      and (${assessment}.answers #>> '{inStorePharmacy,organisationId}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and jsonb_typeof(${assessment}.answers #> '{inStorePharmacy,slug}') = 'string'
      and length(btrim(${assessment}.answers #>> '{inStorePharmacy,slug}')) > 0)
    or ${run}.market_region = ${WEB_PRODUCT_SOURCING_COUNTRY})`;
}
