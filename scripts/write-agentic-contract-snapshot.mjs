import { toolList } from "../lib/agentic/mcp/rpc.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  AGENTIC_PUBLIC_TOOLS,
  AGENTIC_SERVER_INSTRUCTIONS,
} from "../lib/agentic/contract/index.ts";
import { AGENTIC_CONTRACT_VERSION } from "../lib/agentic/config.ts";
import { clientGuideMarkdown, publicContractBundle, CONTRACT_RESOURCES } from "../lib/agentic/contract/guide.ts";
import { computeSchemaChecksum } from "../lib/agentic/release-manifest.ts";

const schemaChecksum = computeSchemaChecksum();
const snapshot = {
  schemaChecksum,
  contractVersion: AGENTIC_CONTRACT_VERSION,
  instructions: AGENTIC_SERVER_INSTRUCTIONS,
  tools: toolList("dev")
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
  description: `${AGENTIC_SERVER_INSTRUCTIONS}\nTools: ${AGENTIC_PUBLIC_TOOLS.join(", ")}. Use the exact tool names exposed by your host; it may wrap the native names.`,
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
