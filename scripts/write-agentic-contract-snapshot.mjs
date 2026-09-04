import { writeFileSync } from "node:fs";
import {
  AGENTIC_PUBLIC_TOOLS,
  AGENTIC_SERVER_INSTRUCTIONS,
  AGENTIC_TOOL_DESCRIPTIONS,
  AGENTIC_TOOL_SCHEMAS
} from "../lib/agentic/contract/index.ts";
import { AGENTIC_CONTRACT_VERSION } from "../lib/agentic/config.ts";
import { computeSchemaChecksum } from "../lib/agentic/release-manifest.ts";

const snapshot = {
  contractVersion: AGENTIC_CONTRACT_VERSION,
  instructions: AGENTIC_SERVER_INSTRUCTIONS,
  tools: AGENTIC_PUBLIC_TOOLS.map((name) => ({
    description: AGENTIC_TOOL_DESCRIPTIONS[name],
    inputSchema: AGENTIC_TOOL_SCHEMAS[name],
    name
  }))
};

const schemaChecksum = computeSchemaChecksum();

writeFileSync(
  new URL("../contract/mcp/3.0.0/tools.json", import.meta.url),
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
    "Deterministic supplement stacks with external checkout and order polling. Call tools only as info, plan, execute, order, support, feedback, evidence. Never prefix mattanutra_dev. Never call mattanutra_dev.* or mattanutra_dev.mattanutra_dev.*.",
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
