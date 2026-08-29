import { writeFileSync } from "node:fs";
import {
  AGENTIC_PUBLIC_TOOLS,
  AGENTIC_SERVER_INSTRUCTIONS,
  AGENTIC_TOOL_DESCRIPTIONS,
  AGENTIC_TOOL_SCHEMAS
} from "../lib/agentic/contract/index.ts";

const snapshot = {
  contractVersion: "3.0.0",
  instructions: AGENTIC_SERVER_INSTRUCTIONS,
  tools: AGENTIC_PUBLIC_TOOLS.map((name) => ({
    description: AGENTIC_TOOL_DESCRIPTIONS[name],
    inputSchema: AGENTIC_TOOL_SCHEMAS[name],
    name
  }))
};

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
      tools: snapshot.tools,
      transport: "streamable-http",
      url: "https://dev.mattanutra.com/api/mcp"
    },
    null,
    2
  )}\n`
);
