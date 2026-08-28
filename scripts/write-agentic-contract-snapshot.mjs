import { writeFileSync } from "node:fs";
import {
  AGENTIC_PUBLIC_TOOLS,
  AGENTIC_SERVER_INSTRUCTIONS,
  AGENTIC_TOOL_DESCRIPTIONS,
  AGENTIC_TOOL_SCHEMAS,
  PLAN_ADVERTISED_SCHEMA
} from "../lib/agentic/contract/index.ts";

const snapshot = {
  contractVersion: "3.0.0",
  instructions: AGENTIC_SERVER_INSTRUCTIONS,
  tools: AGENTIC_PUBLIC_TOOLS.map((name) => ({
    description: AGENTIC_TOOL_DESCRIPTIONS[name],
    inputSchema: name === "plan" ? PLAN_ADVERTISED_SCHEMA : AGENTIC_TOOL_SCHEMAS[name],
    name
  }))
};

writeFileSync(
  new URL("../contract/mcp/3.0.0/tools.json", import.meta.url),
  `${JSON.stringify(snapshot, null, 2)}\n`
);
