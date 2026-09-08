import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { profiles, runtime, installRealCatalogue, uninstallRealCatalogue } from "../../test/ax-refinement/helpers.ts";
import { beginDeterministicIdsForTests, endDeterministicIdsForTests } from "../../lib/agentic/capabilities.ts";
import { handleJsonRpc } from "../../lib/agentic/mcp/dispatcher.ts";
import { measureJourney, bytes } from "./measure.mjs";

const args = process.argv.slice(2);
assert.equal(args[0], "--output");
const output = resolve(args[1]);
assert.ok(isAbsolute(args[1]) && relative(process.cwd(), output).startsWith(".."));
assert.ok(!process.env.DB_URL && !process.env.TEST_DB_URL, "Baseline must use isolated frozen memory inputs");
mkdirSync(output, { recursive: false, mode: 0o700 });
const save = (file: string, value: unknown) => writeFileSync(resolve(output, file), JSON.stringify(value) + "\n", { flag: "wx", mode: 0o600 });
const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const rows = [];
for (const locale of ["en", "th", "zh-CN"]) for (const profile of profiles) {
  await installRealCatalogue("dev"); beginDeterministicIdsForTests();
  try {
    const instance = { ...runtime(`payload-${profile.id}-${locale}`), isolatedInfo: { conditionCodes: [], medicationCodes: [], supportedCountries: [{ countryCode: "TH", countryName: "Thailand", currency: "THB" }] } };
    const calls: Array<{ request: Record<string, unknown>; response: unknown }> = [];
    async function call(method: string, params: Record<string, unknown>) {
      const request = { jsonrpc: "2.0", id: calls.length + 1, method, params };
      const response = await handleJsonRpc(instance, request);
      assert.ok(response?.result && !response.error);
      calls.push({ request, response });
      return response.result;
    }
    await call("initialize", { protocolVersion: "2025-06-18" });
    await call("tools/list", {});
    await call("tools/call", { name: "info", arguments: { locale } });
    const result = await call("tools/call", { name: "plan", arguments: { operation: "create", idempotencyKey: `payload-${profile.id}-${locale}-create`, request: { ...profile.request, locale } } });
    let plan = result.structuredContent as Record<string, unknown>;
    for (let polls = 0; plan.status === "processing" && polls < 90; polls++) {
      await new Promise(done => setTimeout(done, Number(plan.pollAfterSeconds) * 1000));
      plan = (await call("tools/call", { name: "plan", arguments: { operation: "get", planHandle: plan.planHandle } })).structuredContent as Record<string, unknown>;
    }
    assert.equal(plan.ok, true, JSON.stringify(plan)); assert.notEqual(plan.status, "processing");
    const filename = `${profile.id}-${locale}.json`;
    save(filename, { profile: profile.id, locale, request: { ...profile.request, locale }, plan, calls });
    rows.push({ filename, source, planBytes: bytes(plan), ...measureJourney(calls) });
    console.log(JSON.stringify({ case: filename, planBytes: bytes(plan), calls: calls.length }));
  } finally { uninstallRealCatalogue(); endDeterministicIdsForTests(); }
}
save("manifest.json", { source, catalogue: "reconstructed_corrected_dev_baseline", rows,
  inputs: ["test/fixtures/ax-refinement/six-profiles.json", "test/fixtures/ax-refinement/dev-corrections.json", "test/fixtures/matcher-experiments/anna-dev.json"].map(file => ({ file, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") })) });
