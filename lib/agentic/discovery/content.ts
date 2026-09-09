import { positioning } from "@/lib/agentic/discovery/positioning";
import type { Locale } from "@/lib/i18n";
import { negotiateLocale } from "@/lib/agentic/i18n";
import {
  DISCOVERY_CONTENT_VERSION,
  RESEARCH_VERSION,
  RESPONSIBILITY_VERSION,
  VALUE_PROPOSITION_ID,
  WELLNESS_BOUNDARY_ID
} from "@/lib/agentic/discovery/versions";
import { responsibilitySnapshot } from "@/lib/agentic/responsibility/matrix";

export const CONNECTOR_PROPOSITION_SEMANTIC_ID = "disc.proposition.match_optimize_boundary";
export const CONNECTOR_SAFETY_SEMANTIC_ID = "disc.safety.wellness_not_clinical";

export const CONNECTOR_COPY: Readonly<Record<Locale, string>> = {
  en: positioning("en").infoDescription, th: positioning("th").infoDescription, "zh-CN": positioning("zh-CN").infoDescription
};
export const CONNECTOR_INFO_BLURB: Readonly<Record<Locale, string>> = {
  en: positioning("en").purposes.info, th: positioning("th").purposes.info, "zh-CN": positioning("zh-CN").purposes.info
};

export function connectorCopy(locale?: string) {
  return CONNECTOR_COPY[negotiateLocale(locale)];
}

export function connectorInfoDescription(locale?: string) {
  return CONNECTOR_INFO_BLURB[negotiateLocale(locale)];
}

export function englishConnectorWordCount() {
  return CONNECTOR_COPY.en.trim().split(/\s+/).filter(Boolean).length;
}

export function discoverySnapshot(input: Readonly<{
  buildId?: string;
  locale?: string;
  supportedCountries: readonly Readonly<{
    countryCode: string;
    countryName: string;
    currency: string;
  }>[];
  supportedLocales?: readonly string[];
}>) {
  const locale = negotiateLocale(input.locale);
  return {
    buildId: input.buildId,
    contentVersion: DISCOVERY_CONTENT_VERSION,
    description: connectorCopy(locale),
    researchVersion: RESEARCH_VERSION,
    responsibility: responsibilitySnapshot(locale),
    responsibilityVersion: RESPONSIBILITY_VERSION,
    supportedCountries: input.supportedCountries,
    supportedLocales: input.supportedLocales ?? ["en", "th", "zh-CN"],
    valuePropositionId: VALUE_PROPOSITION_ID,
    wellnessBoundary: WELLNESS_BOUNDARY_ID
  };
}
