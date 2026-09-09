import assert from "node:assert/strict";
import { test } from "node:test";
import { MCP_PACKAGES, packageStages } from "../../scripts/mcp-721-proof.mjs";
import { readFileSync } from "node:fs";
test("DISC-REL-01 discovery uses the existing runner with a complete MCP release stage", () => {
  assert.ok(MCP_PACKAGES.discovery);
  assert.ok(packageStages("discovery").includes("complete-mcp-regression"));
  assert.equal(MCP_PACKAGES.discovery.version, "7.2.4");
});
test("DISC-REL-02 DEV and UAT publish only through a discovery attestation", () => {
  for (const path of ["scripts/deploy-dev.mjs", "scripts/deploy-uat.mjs"]) {
    const source=readFileSync(path,"utf8"); assert.match(source,/--mcp-discovery-attestation/);
  }
});
