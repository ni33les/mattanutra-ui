import { AGENTIC_CONTRACT_REGISTRY } from "../lib/agentic/contract/registry.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  AGENTIC_PUBLIC_TOOLS,
  AGENTIC_SERVER_INSTRUCTIONS,
  AGENTIC_TOOL_DESCRIPTIONS,
} from "../lib/agentic/contract/index.ts";
import { AGENTIC_CONTRACT_VERSION } from "../lib/agentic/config.ts";
import { clientGuideMarkdown, publicContractBundle, CONTRACT_RESOURCES } from "../lib/agentic/contract/guide.ts";
import { computeSchemaChecksum } from "../lib/agentic/release-manifest.ts";

const schemaChecksum = computeSchemaChecksum();
const snapshot = {
  schemaChecksum,
  contractVersion: AGENTIC_CONTRACT_VERSION,
  instructions: AGENTIC_SERVER_INSTRUCTIONS,
  tools: AGENTIC_PUBLIC_TOOLS.map((name) => ({
    description: AGENTIC_TOOL_DESCRIPTIONS[name],
    inputSchema: AGENTIC_CONTRACT_REGISTRY[name].inputSchema,
    outputSchema: AGENTIC_CONTRACT_REGISTRY[name].outputSchema,
    name
  }))
};

const versionDirectory = new URL(`../contract/mcp/${AGENTIC_CONTRACT_VERSION}/`, import.meta.url);
mkdirSync(versionDirectory, { recursive: true });
writeFileSync(new URL("README.md", versionDirectory), clientGuideMarkdown());
writeFileSync(new URL("schema.json", versionDirectory), `${JSON.stringify(publicContractBundle(), null, 2)}\n`);

writeFileSync(
  new URL("tools.json", versionDirectory),
  `${JSON.stringify(snapshot, null, 2)}\n`
);

writeFileSync(
  new URL("../public/.well-known/mcp.json", import.meta.url),
  `${JSON.stringify(
    {
      contractVersion: snapshot.contractVersion,
      name: "mattanutra_dev",
      schemaChecksum,
      tools: snapshot.tools,
      resources: CONTRACT_RESOURCES,
      transport: "streamable-http",
      url: "https://dev.mattanutra.com/api/mcp"
    },
    null,
    2
  )}\n`
);

const adapter = {
  contractVersion: AGENTIC_CONTRACT_VERSION,
  description:
    "Deterministic supplement stacks with external checkout and order polling. Call tools only as info, plan, execute, order, support, feedback. Never prefix mattanutra_dev. Never call mattanutra_dev.* or mattanutra_dev.mattanutra_dev.*.",
  name: "MattaNutra",
  schemaChecksum,
  server_url: "/api/mcp",
  tools: [...AGENTIC_PUBLIC_TOOLS]
};

for (const file of ["xai.json", "openai.json", "anthropic.json"]) {
  writeFileSync(
    new URL(`../lib/agentic/adapters/${file}`, import.meta.url),
    `${JSON.stringify(adapter, null, 2)}\n`
  );
}
