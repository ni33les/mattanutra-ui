import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { payloadJourney } from "../../scripts/mcp-payload/client.mjs";
import { profiles, runtime, installRealCatalogue, uninstallRealCatalogue } from "../ax-refinement/helpers.ts";
import { handleJsonRpc } from "../../lib/agentic/mcp/dispatcher.ts";
import { beginDeterministicIdsForTests, endDeterministicIdsForTests } from "../../lib/agentic/capabilities.ts";
import { runAdmittedPlanOperation, resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { simulatePayment } from "../../lib/agentic/qa/simulate.ts";
import { measureJourney } from "../../scripts/mcp-payload/measure.mjs";
import { baseline, baselineJourneys } from "./fixtures.ts";

export function cleanupPayloadJourney() { uninstallRealCatalogue(); endDeterministicIdsForTests(); resetPlanCreateInflightForTests(); }
export async function runPayloadJourney(locale: "en" | "th" | "zh-CN", fixture: (typeof profiles)[number]) {
  const historical = baselineJourneys.find(row => row.caseId === `${fixture.id}-${locale}`);
  assert.ok(historical); // Historical bytes and prices remain immutable evidence.
  const outcomes = [];
  for (const mode of ["full", "conversation"] as const) {
    const catalogue = await installRealCatalogue("dev"); beginDeterministicIdsForTests(); resetPlanCreateInflightForTests();
    const app = { ...runtime(`payload-journey-${fixture.id}-${locale}`), deferProcessing: true, isolatedInfo: { conditionCodes: [], medicationCodes: [], supportedCountries: [{ countryCode: "TH", countryName: "Thailand", currency: "THB" }] } };
    const calls: { request: unknown; response: unknown }[] = [];
    let settled = false;
    let virtualElapsedMs = 0;
    const outcome = await payloadJourney({ request: { ...structuredClone(fixture.request), locale }, key: `payload-${fixture.id}-${locale}`,
      wait: async (milliseconds: number) => { assert.ok(Number.isFinite(milliseconds) && milliseconds >= 0); virtualElapsedMs += milliseconds; },
      view: mode, reader: mode === "full" && ["A2", "A4", "A6"].includes(fixture.id) ? "text" : "structured", resources: ["A1", "A3", "A5"].includes(fixture.id),
      rpc: async (method: string, params: Record<string, unknown>) => {
        const request = { id: calls.length + 1, jsonrpc: "2.0", method, params };
        const response = await handleJsonRpc(app, request); assert.ok(response?.result, JSON.stringify(response));
        calls.push({ request, response });
        const args = params.arguments as Record<string, unknown> | undefined;
        const value = response.result.structuredContent as Record<string, unknown> | undefined;
        // External isolated harness controls completion/settlement. The client
        // only sees the published protocol and never calls fixture endpoints.
        if (params.name === "plan" && value?.status === "processing" && args?.idempotencyKey) {
          const operation = await app.store.getPlanOperationByKey(`dev:mattanutra:${app.scope.principalScope}`, String(args.idempotencyKey)); assert.ok(operation);
          const completed = await runAdmittedPlanOperation({ store: app.store, config: app.config, operationId: operation.id }); assert.equal(completed.ok, true);
        }
        if (params.name === "order" && value?.paymentStatus === "unpaid" && !settled) {
          settled = true;
          await simulatePayment({ config: app.config, now: app.now!, orderHandle: String(args!.orderHandle), scenario: "success", scope: app.scope, store: app.store });
        }
        return response.result;
      } });
    assert.equal(settled, true);
    if (mode === "full") for (const decision of outcome.decisions) for (const option of decision.options) for (const item of option.basket) {
      const listings = catalogue.snapshot.products.filter(row => row.productId === item.productId);
      assert.ok(listings.length, "All returned products belong to the frozen catalogue");
      assert.ok(listings.some(row => row.unitPriceMinor === item.unitPriceMinor && row.candidate.currency === item.currency), "The returned price and currency must exist on a frozen listing");
      assert.equal(item.lineTotalMinor, item.quantity * item.unitPriceMinor);
    }
    const orderCalls = calls.filter(call => call.request.params?.name === "order");
    assert.equal(orderCalls[0].request.params.arguments.responseView, mode);
    assert.equal(orderCalls[1].request.params.arguments.responseView, mode === "conversation" ? "status" : "full");
    if (mode === "conversation") assert.equal(orderCalls[1].request.params.arguments.knownResultVersion, orderCalls[0].response.result.structuredContent.resultVersion);
    assert.ok(virtualElapsedMs >= orderCalls[0].response.result.structuredContent.pollAfterSeconds * 1000);
    assert.ok(outcome.decisions.every(decision => mode === "conversation" ? decision.responseView === "conversation" : !decision.responseView));
    outcomes.push({ mode, outcome, calls, measurement: measureJourney(calls) });
  }
  const [full, concise] = outcomes;
  assert.deepEqual(concise.outcome.confirmation, full.outcome.confirmation);
  assert.deepEqual(JSON.parse(JSON.stringify(concise.outcome.trace)), JSON.parse(JSON.stringify(full.outcome.trace)), "Compare serialized protocol transitions; undefined is not a JSON field");
  assert.equal(concise.measurement.calls, full.measurement.calls, "Both clients request the same quantity, exclusion and confirmation details");
  assert.equal(concise.outcome.decisions.length, full.outcome.decisions.length);
  for (const [i, value] of concise.outcome.decisions.entries()) {
    const original = full.outcome.decisions[i];
    assert.deepEqual(value.options.map(row => row.candidateKey), original.options.map(row => row.candidateKey));
    assert.deepEqual(value.options.map(row => row.stackSummary), original.options.map(row => row.stackSummary));
    assert.deepEqual(value.options.map(row => row.coveragePercent), original.options.map(row => row.coveragePercent));
    assert.ok(value.options.every(row => !("basket" in row) && !("coverage" in row)));

  }
  const frozen = baseline.cases.find(row => row.caseId === `${fixture.id}-${locale}`)!;
  assert.ok(frozen.plan.options!.length, "Original baseline evidence remains available");
  // Ranking and compact cards intentionally changed after the historical capture.
  // Compare both current clients on identical frozen catalogue inputs, while
  // retaining the original transcript for separate historical investigation.
  assert.ok(concise.measurement.responseBytes <= full.measurement.responseBytes * .4, `${fixture.id} ${locale}: ${concise.measurement.responseBytes}/${full.measurement.responseBytes}`);
  if (process.env.MCP_PAYLOAD_EVIDENCE_DIR) writeFileSync(join(process.env.MCP_PAYLOAD_EVIDENCE_DIR, `journey-${fixture.id}-${locale}.json`), JSON.stringify({ historical, outcomes }), { flag: "wx" });
}
