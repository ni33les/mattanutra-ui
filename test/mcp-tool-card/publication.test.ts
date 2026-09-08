import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
register("./config-loader.mjs", import.meta.url);
const { default: nextConfig } = await import("../../next.config.ts");
import { toolList } from "../../lib/agentic/mcp/rpc.ts";
import { AGENTIC_CONTRACT_VERSION } from "../../lib/agentic/config.ts";
import Ajv from "ajv";

test("production build regenerates a stale publication while server startup does not write it", () => {
  const file = "public/.well-known/mcp.json", original = readFileSync(file, "utf8");
  try {
    writeFileSync(file, '{"tools":"stale"}');
    assert.equal(typeof nextConfig, "function", "The production build must publish the shared contract");
    const configure = nextConfig as unknown as (phase: string) => unknown;
    configure("phase-production-server"); assert.equal(readFileSync(file, "utf8"), '{"tools":"stale"}');
    configure("phase-production-build");
    const published = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(published.tools, toolList()); assert.equal(published.contractVersion, AGENTIC_CONTRACT_VERSION);
    assert.deepEqual(JSON.parse(readFileSync(`contract/mcp/${AGENTIC_CONTRACT_VERSION}/tools.json`, "utf8")).tools, published.tools);
  } finally { writeFileSync(file, original); }
});

test("visible operation fields preserve prior view and refinement validation", () => {
  const ajv = new Ajv({ strict: false, validateFormats: false });
  const old = JSON.parse(readFileSync("contract/mcp/7.2.3/tools.json", "utf8")).tools.find((row: { name: string }) => row.name === "plan");
  const current = toolList().find(row => row.name === "plan")!;
  const before = ajv.compile(old.inputSchema), after = ajv.compile(current.inputSchema);
  const handle = "cap_" + "x".repeat(40), cases: Record<string, unknown>[] = [];
  const fields = { knownResultVersion: "prior", expectedRevision: 1, sections: ["advice"], optionIds: ["opt_12345678"] };
  for (const view of [undefined, "conversation", "full", "status", "details", "invalid"]) {
    for (let mask = 0; mask < 16; mask++) cases.push({ operation: "get", planHandle: handle, ...(view ? { responseView: view } : {}), ...Object.fromEntries(Object.entries(fields).filter((_, i) => mask & (1 << i))) });
  }
  const request = { locale: "en", destinationCountry: "TH", optimization: "lowest_cost", profile: {}, requirements: {}, targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU" }] };
  for (const view of [undefined, "conversation", "full", "status"]) for (const input of [{}, { request }, { requestPatch: {} }, { request, requestPatch: {} }, { requestPatch: null }]) {
    cases.push({ operation: "revise", planHandle: handle, expectedRevision: 1, idempotencyKey: "preserve-refinement-schema", ...(view ? { responseView: view } : {}), ...input });
  }
  let accepted = 0, rejected = 0;
  assert.equal(cases.length, 116);
  for (const input of cases) { const expected = before(input); assert.equal(after(input), expected, JSON.stringify(input)); if (expected) accepted++; else rejected++; }
  assert.ok(accepted > 0 && rejected > 0);
});
