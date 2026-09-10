import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Historical pack manifests remain immutable. Active regressions exercise the
// reviewed 8.0.0 contract snapshot; a runtime-only schema edit must still fail.
const snapshot = JSON.parse(readFileSync(new URL("../../contract/mcp/8.0.0/tools.json", import.meta.url), "utf8")) as {
  contractVersion: string;
  schemaChecksum: string;
};
assert.equal(snapshot.contractVersion, "8.0.0");
assert.match(snapshot.schemaChecksum, /^[0-9a-f]{64}$/);

export const CURRENT_CONTRACT_SCHEMA_CHECKSUM = snapshot.schemaChecksum;
