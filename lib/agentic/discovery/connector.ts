import { agenticServerInstructions } from "@/lib/agentic/contract/instructions";
import { createHash } from "node:crypto";
import type { AgenticEnvironment } from "@/lib/agentic/config";
import { AGENTIC_CONTRACT_VERSION } from "@/lib/agentic/config";
import { AGENTIC_PUBLIC_TOOLS } from "@/lib/agentic/contract/names";
import { DISCOVERY_CONTENT_VERSION } from "@/lib/agentic/discovery/versions";
import { POSITIONING, positioning } from "@/lib/agentic/discovery/positioning";
import { computeSchemaChecksum } from "@/lib/agentic/release-manifest";

/** Generated provider files use the same metadata as native discovery. */
export function connectorProjection(environment: AgenticEnvironment = "dev") {
  const copy = positioning();
  return {
    name: copy.displayName,
    instructions: `${agenticServerInstructions(environment)}\nTools: ${AGENTIC_PUBLIC_TOOLS.join(", ")}. Use the exact names exposed by the host; hosts may wrap native names.`,
    description: [copy.shortDescription, copy.environmentWarnings[environment]].filter(Boolean).join("\n"),
    shortDescription: copy.shortDescription, longDescription: copy.longDescription,
    invocationGuidance: copy.invocationGuidance, unsupportedUseGuidance: copy.unsupportedUseGuidance,
    environment, environmentWarning: copy.environmentWarnings[environment],
    environments: Object.fromEntries((["dev", "uat", "prd"] as const).map(env => [env, {
      server_url: `https://${env === "prd" ? "" : `${env}.`}mattanutra.com/api/mcp`, warning: copy.environmentWarnings[env]
    }])),
    locales: POSITIONING,
    discoveryVersion: DISCOVERY_CONTENT_VERSION,
    positioningChecksum: createHash("sha256").update(JSON.stringify(POSITIONING)).digest("hex"),
    contractVersion: AGENTIC_CONTRACT_VERSION, schemaChecksum: computeSchemaChecksum(),
    server_url: "/api/mcp", tools: [...AGENTIC_PUBLIC_TOOLS]
  };
}
