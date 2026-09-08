import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { payloadJourney } from "./client.mjs";
import { measureJourney } from "./measure.mjs";
const [root, output] = process.argv.slice(2);
assert.ok(isAbsolute(root) && isAbsolute(output));
assert.ok(!process.env.DB_URL && !process.env.TEST_DB_URL);
const source = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(source, "23b4e4cd7c2838af09a6aa8555d36f9402e08158");
assert.equal(execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" }).trim(), "");
const from = file => import(pathToFileURL(resolve(root, file)).href);
const { profiles, runtime, installRealCatalogue, uninstallRealCatalogue } = await from("test/ax-refinement/helpers.ts");
const { beginDeterministicIdsForTests, endDeterministicIdsForTests } = await from("lib/agentic/capabilities.ts");
const { handleJsonRpc } = await from("lib/agentic/mcp/dispatcher.ts");
const { runAdmittedPlanOperation, resetPlanCreateInflightForTests } = await from("lib/agentic/plan/service.ts");
const { simulatePayment } = await from("lib/agentic/qa/simulate.ts");
mkdirSync(output, { recursive: false, mode: 0o700 });
for (const locale of ["en", "th", "zh-CN"]) for (const fixture of profiles) {
  await installRealCatalogue("dev"); beginDeterministicIdsForTests(); resetPlanCreateInflightForTests();
  const app = { ...runtime(`payload-journey-${fixture.id}-${locale}`), deferProcessing: true, isolatedInfo: { conditionCodes: [], medicationCodes: [], supportedCountries: [{ countryCode: "TH", countryName: "Thailand", currency: "THB" }] } };
  const calls = []; let settled = false;
  try {
    const outcome = await payloadJourney({ request: { ...structuredClone(fixture.request), locale }, key: `payload-${fixture.id}-${locale}`, view: "full",
      reader: ["A2", "A4", "A6"].includes(fixture.id) ? "text" : "structured", resources: ["A1", "A3", "A5"].includes(fixture.id),
      rpc: async (method, params) => {
        const request = { id: calls.length + 1, jsonrpc: "2.0", method, params };
        const response = await handleJsonRpc(app, request); assert.ok(response?.result, JSON.stringify(response)); calls.push({ request, response });
        const args = params.arguments, value = response.result.structuredContent;
        if (params.name === "plan" && value?.status === "processing" && args?.idempotencyKey) {
          const operation = await app.store.getPlanOperationByKey(`dev:mattanutra:${app.scope.principalScope}`, args.idempotencyKey); assert.ok(operation);
          const completed = await runAdmittedPlanOperation({ store: app.store, config: app.config, operationId: operation.id }); assert.equal(completed.ok, true);
        }
        if (params.name === "order" && value?.paymentStatus === "unpaid" && !settled) {
          settled = true; await simulatePayment({ config: app.config, now: app.now, orderHandle: args.orderHandle, scenario: "success", scope: app.scope, store: app.store });
        }
        return response.result;
      } });
    assert.equal(settled, true);
    const row = { source, caseId: `${fixture.id}-${locale}`, mode: "full", outcome, calls, measurement: measureJourney(calls) };
    writeFileSync(resolve(output, `${row.caseId}.json`), JSON.stringify(row), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ case: row.caseId, bytes: row.measurement.responseBytes, calls: calls.length }));
  } finally { uninstallRealCatalogue(); endDeterministicIdsForTests(); resetPlanCreateInflightForTests(); }
}
