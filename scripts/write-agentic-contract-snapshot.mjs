import { toolList } from "../lib/agentic/mcp/rpc.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { AGENTIC_CONTRACT_VERSION } from "../lib/agentic/config.ts";
import { clientGuideMarkdown, publicContractBundle, CONTRACT_RESOURCES } from "../lib/agentic/contract/guide.ts";
import { computeSchemaChecksum } from "../lib/agentic/release-manifest.ts";
import { connectorProjection } from "../lib/agentic/discovery/connector.ts";
import { agenticServerInstructions } from "../lib/agentic/contract/instructions.ts";

const environment = process.env.MATTANUTRA_ENV ?? "dev";
if (!["dev", "uat", "prd"].includes(environment)) throw new Error("Invalid discovery publication environment");
const adapter = connectorProjection(environment);

const schemaChecksum = computeSchemaChecksum();
const snapshot = {
  schemaChecksum,
  contractVersion: AGENTIC_CONTRACT_VERSION,
  instructions: agenticServerInstructions(environment),
  tools: toolList(environment)
};

const versionDirectory = new URL(`../contract/mcp/${AGENTIC_CONTRACT_VERSION}/`, import.meta.url);
mkdirSync(versionDirectory, { recursive: true });
writeFileSync(new URL("README.md", versionDirectory), clientGuideMarkdown("en", environment));
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
      ...adapter,
      name: `mattanutra_${environment}`,
      title: adapter.name,
      schemaChecksum,
      tools: snapshot.tools,
      resources: CONTRACT_RESOURCES,
      transport: "streamable-http",
      url: adapter.environments[environment].server_url
    },
    null,
    2
  )}\n`
);

for (const file of ["xai.json", "openai.json", "anthropic.json"]) {
  writeFileSync(
    new URL(`../lib/agentic/adapters/${file}`, import.meta.url),
    `${JSON.stringify(adapter, null, 2)}\n`
  );
}
