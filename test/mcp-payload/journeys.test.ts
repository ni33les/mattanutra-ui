import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, afterEach } from "node:test";
import { payloadJourney } from "../../scripts/mcp-payload/client.mjs";
import { profiles, runtime, installRealCatalogue, uninstallRealCatalogue } from "../ax-refinement/helpers.ts";
import { handleJsonRpc } from "../../lib/agentic/mcp/dispatcher.ts";
import { beginDeterministicIdsForTests, endDeterministicIdsForTests } from "../../lib/agentic/capabilities.ts";
import { runAdmittedPlanOperation, resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { simulatePayment } from "../../lib/agentic/qa/simulate.ts";
import { measureJourney } from "../../scripts/mcp-payload/measure.mjs";
import { baseline, baselineJourneys } from "./fixtures.ts";

afterEach(() => { uninstallRealCatalogue(); endDeterministicIdsForTests(); resetPlanCreateInflightForTests(); });
for (const locale of ["en", "th", "zh-CN"] as const) for (const fixture of profiles) test(`PAY-AX-01 ${fixture.id} ${locale} documented clients preserve decisions and payment recovery with smaller whole journeys`, { timeout: 120000 }, async () => {
  const outcomes = [baselineJourneys.find(row => row.caseId === `${fixture.id}-${locale}`)];
  assert.ok(outcomes[0]);
  for (const mode of ["conversation"] as const) {
    await installRealCatalogue("dev"); beginDeterministicIdsForTests(); resetPlanCreateInflightForTests();
    const app = { ...runtime(`payload-journey-${fixture.id}-${locale}`), deferProcessing: true, isolatedInfo: { conditionCodes: [], medicationCodes: [], supportedCountries: [{ countryCode: "TH", countryName: "Thailand", currency: "THB" }] } };
    const calls: { request: unknown; response: unknown }[] = [];
    let settled = false;
    let virtualElapsedMs = 0;
    const outcome = await payloadJourney({ request: { ...structuredClone(fixture.request), locale }, key: `payload-${fixture.id}-${locale}`,
      wait: async (milliseconds: number) => { assert.ok(Number.isFinite(milliseconds) && milliseconds >= 0); virtualElapsedMs += milliseconds; },
      view: mode, reader: ["A2", "A4", "A6"].includes(fixture.id) ? "text" : "structured", resources: ["A1", "A3", "A5"].includes(fixture.id),
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
    const orderCalls = calls.filter(call => call.request.params?.name === "order");
    assert.equal(orderCalls[0].request.params.arguments.responseView, "conversation");
    assert.equal(orderCalls[1].request.params.arguments.responseView, "status");
    assert.equal(orderCalls[1].request.params.arguments.knownResultVersion, orderCalls[0].response.result.structuredContent.resultVersion);
    assert.ok(virtualElapsedMs >= orderCalls[0].response.result.structuredContent.pollAfterSeconds * 1000);
    assert.ok(outcome.decisions.every(decision => decision.responseView === "conversation"));
    outcomes.push({ mode, outcome, calls, measurement: measureJourney(calls) });
  }
  const [full, concise] = outcomes;
  assert.deepEqual(concise.outcome.confirmation, full.outcome.confirmation);
  assert.deepEqual(JSON.parse(JSON.stringify(concise.outcome.trace)), full.outcome.trace, "Compare serialized protocol transitions; undefined is not a JSON field");
  assert.equal(concise.measurement.calls, full.measurement.calls, "Ordinary conversation requires no extra call");
  assert.equal(concise.outcome.decisions.length, full.outcome.decisions.length);
  for (const [i, value] of concise.outcome.decisions.entries()) {
    const original = full.outcome.decisions[i];
    assert.deepEqual(value.options.map(row => row.optionId), original.options.map(row => row.optionId));
    assert.deepEqual(value.options.map(row => row.stackSummary), original.options.map(row => row.stackSummary));
    assert.deepEqual(value.options.map(row => row.coverage.map(target => [target.name,target.requestedAmount,target.deliveredAmount,target.remainingGap,target.excess,target.intakeCertainty])), original.options.map(row => row.coverage.map(target => [target.name,target.requestedAmount,target.deliveredAmount,target.remainingGap,target.excess,target.intakeCertainty])));
  }
  const frozen = baseline.cases.find(row => row.caseId === `${fixture.id}-${locale}`)!;
  assert.deepEqual(full.outcome.decisions[0].options.map(row => [row.optionId, row.basket, row.coverage, row.advice, row.stackSummary]), frozen.plan.options!.map(row => [row.optionId,row.basket,row.coverage,row.advice,row.stackSummary]), "Initial full business facts match the immutable pre-change baseline");
  // The control is an actual unchanged-source execution at the release base,
  // including its own discovery, guide, detail and payment recovery calls.
  assert.ok(concise.measurement.responseBytes <= full.measurement.responseBytes * .4, `${fixture.id} ${locale}: ${concise.measurement.responseBytes}/${full.measurement.responseBytes}`);
  if (process.env.MCP_PAYLOAD_EVIDENCE_DIR) writeFileSync(join(process.env.MCP_PAYLOAD_EVIDENCE_DIR, `journey-${fixture.id}-${locale}.json`), JSON.stringify({ outcomes }), { flag: "wx" });
});
