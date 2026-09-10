import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGENTIC_CONTRACT_VERSION } from "../../lib/agentic/config.ts";

// Read the published snapshot, not the runtime checksum: runtime-only schema
// changes must still fail without republishing the supported contract.
const snapshot = JSON.parse(readFileSync(new URL(`../../contract/mcp/${AGENTIC_CONTRACT_VERSION}/tools.json`, import.meta.url), "utf8")) as {
  contractVersion: string;
  schemaChecksum: string;
};
assert.equal(snapshot.contractVersion, AGENTIC_CONTRACT_VERSION);
assert.match(snapshot.schemaChecksum, /^[0-9a-f]{64}$/);

export const CURRENT_CONTRACT_SCHEMA_CHECKSUM = snapshot.schemaChecksum;
