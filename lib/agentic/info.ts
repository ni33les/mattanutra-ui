import { createHash } from "node:crypto";
import type { AgenticConfig } from "@/lib/agentic/config";
import {
  AGENTIC_CONTRACT_VERSION,
  AGENTIC_MIGRATION_VERSION,
  AGENTIC_POLL_AFTER_SECONDS,
  AGENTIC_SERVICE_NAME,
  AGENTIC_SERVICE_VERSION
} from "@/lib/agentic/config";
import { AGENTIC_TOOL_SCHEMAS } from "@/lib/agentic/contract";
import { listDeliverableMarkets } from "@/lib/agentic/catalogue/market";
import { negotiateLocale } from "@/lib/agentic/i18n";
import { mcpLatencySnapshot } from "@/lib/agentic/metrics";
import { ensureCatalogueSnapshot } from "@/lib/agentic/catalogue/snapshot";
import {
  RECOGNISED_CONDITION_CODES,
  RECOGNISED_MEDICATION_CODES
} from "@/lib/agentic/catalogue/names";
import { listCatalogueGaps } from "@/lib/agentic/plan/telemetry";
import { connectorCopy } from "@/lib/agentic/discovery/content";
import {
  RESEARCH_VERSION,
  RESPONSIBILITY_VERSION,
  VALUE_PROPOSITION_ID,
  WELLNESS_BOUNDARY_ID
} from "@/lib/agentic/discovery/versions";
import { recordFunnelEvent } from "@/lib/agentic/funnel/ledger";

export const AGENTIC_SCHEMA_CHECKSUM = createHash("sha256")
  .update(JSON.stringify(AGENTIC_TOOL_SCHEMAS))
  .digest("hex");

export const PUBLIC_INFO_ALLOW_LIST = [
  "ok",
  "serviceName",
  "contractVersion",
  "schemaChecksum",
  "buildId",
  "supportedCountries",
  "supportedLocales",
  "medicationCodes",
  "conditionCodes",
  "userAccountRequired",
  "continuation",
  "pollAfterSeconds",
  "supportAvailable",
  "description",
  "valuePropositionId",
  "wellnessBoundary",
  "researchVersion",
  "responsibilityVersion"
] as const;

export type PublicInfoCountry = Readonly<{
  countryCode: string;
  countryName: string;
  currency: string;
}>;

export type PublicInfo = Readonly<{
  buildId?: string;
  conditionCodes: readonly string[];
  continuation: "polling_only";
  contractVersion: string;
  description: string;
  medicationCodes: readonly string[];
  ok: true;
  pollAfterSeconds: number;
  researchVersion: string;
  responsibilityVersion: string;
  schemaChecksum?: string;
  serviceName: string;
  supportAvailable: true;
  supportedCountries: readonly PublicInfoCountry[];
  supportedLocales: readonly string[];
  userAccountRequired: false;
  valuePropositionId: string;
  wellnessBoundary: string;
}>;

let infoCache: {
  key: string;
  value: PublicInfo;
} | null = null;

export function resetInfoCache() {
  infoCache = null;
}

async function recognisedNamesForMarkets(input: Readonly<{
  config: AgenticConfig;
  supportedCountries: ReadonlyArray<{ countryCode: string }>;
}>) {
  const names = new Set<string>();
  const countries =
    input.supportedCountries.length > 0
      ? input.supportedCountries
      : [{ countryCode: "TH" }];

  for (const market of countries) {
    try {
      const snapshot = await ensureCatalogueSnapshot(
        input.config.environment,
        market.countryCode
      );

      for (const item of snapshot.supplements) {
        names.add(item.name);

        for (const alias of item.aliases) {
          names.add(alias);
        }
      }
    } catch {
      // Keep whatever names we already collected.
    }
  }

  return [...names].sort((left, right) => left.localeCompare(right));
}

function publicCapabilityInfo(input: Readonly<{
  buildId?: string;
  conditionCodes: readonly string[];
  locale?: string;
  medicationCodes: readonly string[];
  supportedCountries: readonly PublicInfoCountry[];
}>): PublicInfo {
  return {
    ok: true,
    serviceName: AGENTIC_SERVICE_NAME,
    contractVersion: AGENTIC_CONTRACT_VERSION,
    schemaChecksum: AGENTIC_SCHEMA_CHECKSUM,
    ...(input.buildId ? { buildId: input.buildId } : {}),
    supportedCountries: input.supportedCountries.map((item) => ({
      countryCode: item.countryCode,
      countryName: item.countryName,
      currency: item.currency
    })),
    supportedLocales: ["en", "th", "zh-CN"],
    medicationCodes: [...input.medicationCodes],
    conditionCodes: [...input.conditionCodes],
    userAccountRequired: false,
    continuation: "polling_only",
    pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS,
    supportAvailable: true,
    description: connectorCopy(input.locale),
    valuePropositionId: VALUE_PROPOSITION_ID,
    wellnessBoundary: WELLNESS_BOUNDARY_ID,
    researchVersion: RESEARCH_VERSION,
    responsibilityVersion: RESPONSIBILITY_VERSION
  };
}

async function supportedCountriesFor(config: AgenticConfig) {
  const markets = await listDeliverableMarkets();
  const countries = markets.map((market) => ({
    countryCode: market.countryCode,
    countryName: market.countryName,
    currency: market.currency
  }));
  void config;
  return countries;
}

export async function engineeringInfo(input: Readonly<{
  config: AgenticConfig;
  locale?: string;
}>) {
  void negotiateLocale(input.locale);
  const supportedCountries = await supportedCountriesFor(input.config);
  const recognisedNames = await recognisedNamesForMarkets({
    config: input.config,
    supportedCountries
  });
  const catalogueGaps = await listCatalogueGaps();
  return {
    authenticationMode: "anonymous_capability_handles",
    buildId: input.config.buildId,
    checkoutBuild: input.config.buildId,
    checkoutMode: "external_merchant_hosted",
    continuation: "polling_only" as const,
    contractVersion: AGENTIC_CONTRACT_VERSION,
    coreFlow: "plan -> execute -> external checkout -> order polling",
    environment: input.config.environment,
    migrationVersion: AGENTIC_MIGRATION_VERSION,
    ok: true as const,
    conditionCodes: [...RECOGNISED_CONDITION_CODES],
    medicationCodes: [...RECOGNISED_MEDICATION_CODES],
    pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS,
    recognisedNames,
    schemaChecksum: AGENTIC_SCHEMA_CHECKSUM,
    serviceName: AGENTIC_SERVICE_NAME,
    serviceVersion: AGENTIC_SERVICE_VERSION,
    supportAvailable: true as const,
    supportedCountries,
    supportedLocales: ["en", "th", "zh-CN"],
    userAccountRequired: false as const,
    ...(catalogueGaps.length > 0 ? { catalogueGaps } : {}),
    ...(input.config.environment === "dev"
      ? {
          latency: mcpLatencySnapshot(input.config.buildId),
          qaHarness: {
            audience: "mattanutra-dev-qa",
            audienceHeader: "x-mattanutra-qa-audience",
            authorization: "Bearer MCP_QA_TOKEN",
            path: "/api/mcp/qa",
            tools: [
              "simulate",
              "simulateFulfilment",
              "observe",
              "evidence",
              "isolationProof",
              "checkoutContinuityProof",
              "latencyProof",
              "packProof"
            ]
          }
        }
      : {})
  };
}

export async function infoTool(input: Readonly<{
  config: AgenticConfig;
  isolatedInfo?: {
    conditionCodes: readonly string[];
    medicationCodes: readonly string[];
    supportedCountries: ReadonlyArray<{
      countryCode: string;
      countryName: string;
      currency: string;
    }>;
  };
  locale?: string;
}>): Promise<PublicInfo> {
  const locale = negotiateLocale(input.locale);

  if (input.isolatedInfo) {
    return publicCapabilityInfo({
      buildId: input.config.buildId,
      conditionCodes: input.isolatedInfo.conditionCodes,
      locale,
      medicationCodes: input.isolatedInfo.medicationCodes,
      supportedCountries: input.isolatedInfo.supportedCountries
    });
  }

  const supportedCountries = await supportedCountriesFor(input.config);
  const key = [
    input.config.buildId,
    locale,
    supportedCountries.map((item) => item.countryCode).join(",")
  ].join(":");
  if (infoCache?.key === key) {
    return infoCache.value;
  }

  const value = publicCapabilityInfo({
    buildId: input.config.buildId,
    conditionCodes: RECOGNISED_CONDITION_CODES,
    locale,
    medicationCodes: RECOGNISED_MEDICATION_CODES,
    supportedCountries
  });
  infoCache = { key, value };
  recordFunnelEvent({
    attribution: "agent_connector",
    correlationId: `info:${input.config.buildId}:${locale}`,
    createdAt: new Date(0).toISOString(),
    eventId: `info:${key}`,
    eventType: "info_shown"
  });
  return value;
}
