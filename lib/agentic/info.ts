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

export const AGENTIC_SCHEMA_CHECKSUM = createHash("sha256")
  .update(JSON.stringify(AGENTIC_TOOL_SCHEMAS))
  .digest("hex");

let infoCache: {
  key: string;
  value: ReturnType<typeof buildInfo>;
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

function buildInfo(input: Readonly<{
  config: AgenticConfig;
  locale?: string;
  recognisedNames: readonly string[];
  supportedCountries: ReadonlyArray<{
    countryCode: string;
    countryName: string;
    currency: string;
  }>;
}>) {
  void negotiateLocale(input.locale);

  return {
    authenticationMode: "anonymous_capability_handles",
    buildId: input.config.buildId,
    checkoutBuild: input.config.buildId,
    checkoutMode: "external_merchant_hosted",
    continuation: "polling_only",
    contractVersion: AGENTIC_CONTRACT_VERSION,
    coreFlow: "plan -> execute -> external checkout -> order polling",
    environment: input.config.environment,
    migrationVersion: AGENTIC_MIGRATION_VERSION,
    ok: true as const,
    conditionCodes: [...RECOGNISED_CONDITION_CODES],
    medicationCodes: [...RECOGNISED_MEDICATION_CODES],
    pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS,
    recognisedNames: [...input.recognisedNames],
    schemaChecksum: AGENTIC_SCHEMA_CHECKSUM,
    serviceName: AGENTIC_SERVICE_NAME,
    serviceVersion: AGENTIC_SERVICE_VERSION,
    supportAvailable: true,
    supportedCountries: [...input.supportedCountries],
    supportedLocales: ["en", "th", "zh-CN"],
    userAccountRequired: false
  };
}

function compactInfo(input: Readonly<{
  conditionCodes: readonly string[];
  continuation: string;
  medicationCodes: readonly string[];
  pollAfterSeconds: number;
  supportedCountries: ReadonlyArray<{
    countryCode: string;
    countryName: string;
    currency: string;
  }>;
  userAccountRequired: boolean;
}>) {
  const currencies = [
    ...new Set(input.supportedCountries.map((item) => item.currency).filter(Boolean))
  ];
  return {
    conditionCodes: [...input.conditionCodes],
    continuation: input.continuation,
    currencies,
    medicationCodes: [...input.medicationCodes],
    ok: true as const,
    pollAfterSeconds: input.pollAfterSeconds,
    supportedCountries: [...input.supportedCountries],
    supportedLocales: ["en", "th", "zh-CN"],
    userAccountRequired: input.userAccountRequired
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
}>) {
  if (input.isolatedInfo) {
    return compactInfo({
      conditionCodes: input.isolatedInfo.conditionCodes,
      continuation: "polling_only",
      medicationCodes: input.isolatedInfo.medicationCodes,
      pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS,
      supportedCountries: input.isolatedInfo.supportedCountries,
      userAccountRequired: false
    });
  }
  const markets = await listDeliverableMarkets();
  const supportedCountries = markets.map((market) => ({
    countryCode: market.countryCode,
    countryName: market.countryName,
    currency: market.currency
  }));
  const key = `${input.config.buildId}:${input.config.environment}:${supportedCountries
    .map((item) => item.countryCode)
    .join(",")}`;
  const value =
    infoCache?.key === key
      ? infoCache.value
      : buildInfo({
          ...input,
          recognisedNames: await recognisedNamesForMarkets({
            config: input.config,
            supportedCountries
          }),
          supportedCountries
        });

  if (infoCache?.key !== key) {
    infoCache = { key, value };
  }

  const catalogueGaps = await listCatalogueGaps();
  const withGaps = {
    ...value,
    ...(catalogueGaps.length > 0 ? { catalogueGaps } : {})
  };

  if (input.config.environment !== "dev") {
    return withGaps;
  }

  return {
    ...withGaps,
    latency: mcpLatencySnapshot(input.config.buildId)
  };
}
