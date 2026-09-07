import assert from "node:assert/strict";
import { test } from "node:test";
import { mcpTestTarget } from "../scripts/mcp-test-target.mjs";

test("MCP acceptance target retains DEV topology by default", () => {
  assert.deepEqual(mcpTestTarget({}), { publicUrl: "https://dev.mattanutra.com/api/mcp", originUrl: "http://127.0.0.1:3000/api/mcp", qaUrl: "https://dev.mattanutra.com/api/mcp/qa", isolatedCandidate: false });
});
test("local MCP candidate requires explicit intent and identical isolated databases", () => {
  const env = { MATTANUTRA_ENV: "dev", MCP_ISOLATED_CANDIDATE: "1", MCP_URL: "http://127.0.0.1:3401/api/mcp", DB_URL: "postgresql://fixture:fixture@127.0.0.1:55436/mattanutra_lock_review_contract", TEST_DB_URL: "postgresql://fixture:fixture@127.0.0.1:55436/mattanutra_lock_review_contract" };
  const target = mcpTestTarget(env); assert.equal(target.publicUrl, target.originUrl); assert.equal(target.isolatedCandidate, true);
  for (const override of [{ MCP_ISOLATED_CANDIDATE: "0" }, { DB_URL: "postgresql://fixture:fixture@127.0.0.1:55436/mattanutra_dev" }, { MCP_URL: "https://uat.mattanutra.com/api/mcp" }, { MCP_URL: "http://127.0.0.1.evil.test:3401/api/mcp" }, { TEST_DB_URL: "postgresql://fixture:fixture@127.0.0.1:55436/mattanutra_dev" }]) assert.throws(() => mcpTestTarget({ ...env, ...override }));
});
