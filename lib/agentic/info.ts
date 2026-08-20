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
import {
  ACTIVE_MARKET_COUNTRY,
  ACTIVE_MARKET_CURRENCY,
  ACTIVE_MARKET_NAME
} from "@/lib/agentic/catalogue/market";
import { negotiateLocale } from "@/lib/agentic/i18n";

export const AGENTIC_SCHEMA_CHECKSUM = createHash("sha256")
  .update(JSON.stringify(AGENTIC_TOOL_SCHEMAS))
  .digest("hex");

let infoCache: {
  key: string;
  value: ReturnType<typeof buildInfo>;
} | null = null;

function buildInfo(input: Readonly<{
  config: AgenticConfig;
  locale?: string;
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
    pollAfterSeconds: AGENTIC_POLL_AFTER_SECONDS,
    schemaChecksum: AGENTIC_SCHEMA_CHECKSUM,
    serviceName: AGENTIC_SERVICE_NAME,
    serviceVersion: AGENTIC_SERVICE_VERSION,
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

export function infoTool(input: Readonly<{
  config: AgenticConfig;
  locale?: string;
}>) {
  const key = `${input.config.buildId}:${input.config.environment}`;

  if (infoCache?.key === key) {
    return infoCache.value;
  }

  const value = buildInfo(input);
  infoCache = { key, value };
  return value;
}
