import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MCP_PACKAGES, packageStages, mcp721Identity, checkMcp721Proof } from "../../scripts/mcp-721-proof.mjs";
import { verifiedRestore, verifyOriginalPayments } from "../../scripts/payment-replay/release.mjs";
test("PAY-RELEASE-01 scoped payment release uses existing runner and leaves full gates intact", () => {
  assert.equal(MCP_PACKAGES["payment-replay"]?.version, "11.0.0");
  assert.equal(MCP_PACKAGES["payment-replay"]?.base, "3161c4592a050d303efd374266324a7547d2139c");
  assert.ok(packageStages("payment-replay").includes("restored-payment-preservation"));
  assert.ok(packageStages("payment-replay").includes("no-new-locks"));
  assert.ok(!packageStages("payment-replay").includes("complete-mcp-regression"));
  const deploy = readFileSync("scripts/deploy-dev.mjs", "utf8");
  assert.match(deploy, /--payment-replay-attestation/); assert.match(deploy, /npmRun\("verify:dev"\)/);
});
test("PAY-RELEASE-02 wrong environment, changed source and incomplete proofs are rejected", () => {
  const expected = mcp721Identity("source", "commit", "payment-replay");
  const dir = mkdtempSync(join(tmpdir(), "payment-proof-")), file = join(dir, "attestation.json");
  try {
    for (const bad of [{ environment: "prd" }, { sourceCommit: "wrong" }, { passed: false }]) {
      writeFileSync(file, JSON.stringify({ ...expected, version: "dev-mcp-payment-replay-1", environment: "dev", scope: "payment_replay_compatibility", contractVersion: "11.0.0", passed: true, ...bad }));
      assert.throws(() => checkMcp721Proof(file, expected, "payment-replay"));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("PAY-RELEASE-03 original ledger upsert remains available to unrelated finance callers", () => {
  assert.match(readFileSync("lib/finance-ledger.ts", "utf8"), /on conflict \(source, source_ref\)[\s\S]*do update set/);
  assert.match(readFileSync("lib/payment-accounting.ts", "utf8"), /on conflict \(source,source_ref\)[\s\S]*do nothing returning id/);
});
test("PAY-RELEASE-04 changed original values fail preservation even when row counts match", () => {
  const columns = Object.fromEntries(Array.from({ length: 128 }, (_, n) => [`fixture_${n}`, ["id", "amount"]]));
  const tables = Object.fromEntries(Object.keys(columns).map(name => [name, ["exact-original-row-hash"]]));
  const before = { columns, tables };
  assert.equal(verifyOriginalPayments(before, before).passed, true);
  const changed = structuredClone(before); changed.tables.fixture_0 = ["same-count-different-amount"];
  assert.throws(() => verifyOriginalPayments(before, changed), /row changed or disappeared/);
  assert.throws(() => verifiedRestore(undefined, "postgres://127.0.0.1/anything", "hash"), /Private restore proof/);
});
