import type { AgenticConfig } from "@/lib/agentic/config";
import { AGENTIC_CONTRACT_VERSION, AGENTIC_POLL_AFTER_SECONDS, AGENTIC_SERVICE_NAME, AGENTIC_SERVICE_VERSION, GUIDANCE_RULES_VERSION } from "@/lib/agentic/config";
import { getCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import { ACTIVE_MARKET_COUNTRY, ACTIVE_MARKET_CURRENCY, ACTIVE_MARKET_NAME } from "@/lib/agentic/catalogue/market";
import { negotiateLocale } from "@/lib/agentic/i18n";

export function infoTool(input: Readonly<{
  config: AgenticConfig;
  locale?: string;
}>) {
  const snapshot = getCatalogueSnapshot();
  void negotiateLocale(input.locale);

  return {
    authenticationMode: "anonymous_capability_handles",
    availabilityAsOf: snapshot.availabilityAsOf,
    buildId: input.config.buildId,
    catalogueVersion: snapshot.catalogueVersion,
    checkoutBuild: input.config.buildId,
    checkoutMode: "external_merchant_hosted",
    continuation: "polling_only",
    contractVersion: AGENTIC_CONTRACT_VERSION,
    coreFlow: "plan -> execute -> external checkout -> order polling",
    environment: input.config.environment,
    guidanceRulesVersion: GUIDANCE_RULES_VERSION,
    ok: true as const,
    pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS,
    serviceName: AGENTIC_SERVICE_NAME,
    serviceVersion: AGENTIC_SERVICE_VERSION,
    supplements: snapshot.supplements.map((item) => ({
      acceptedUnits: item.acceptedUnits,
      aliases: item.aliases,
      name: item.name,
      supplementId: item.supplementId
    })),
    supportAvailable: true,
    supportedCountries: [
      {
        countryCode: ACTIVE_MARKET_COUNTRY,
        countryName: ACTIVE_MARKET_NAME,
        currency: ACTIVE_MARKET_CURRENCY
      }
    ],
    supportedLocales: ["en", "th", "zh-CN"],
    userAccountRequired: false
  };
}
