import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import Ajv from "ajv";
import { runtime, rpc, installRealCatalogue, uninstallRealCatalogue, profile } from "../ax-refinement/helpers.ts";
import { CLIENT_GUIDE_URI, readContractResource } from "../../lib/agentic/contract/guide.ts";
import { toolList } from "../../lib/agentic/mcp/rpc.ts";
import { runAdmittedPlanOperation, resetPlanCreateInflightForTests } from "../../lib/agentic/plan/service.ts";
import { admitPlanOperation } from "../../lib/agentic/plan/operations.ts";

afterEach(() => { resetPlanCreateInflightForTests(); uninstallRealCatalogue(); });

test("PAY-SCHEMA-04 narrative identifies detail-only fields and publishes distinct review, poll and detail examples", async () => {
  const app = runtime("narrative-discovery");
  const info = await rpc(app, "info", { locale: "en", view: "client_guide" });
  assert.equal(info.ok, true);
  assert.equal(info.clientGuideText, readContractResource(CLIENT_GUIDE_URI)!.contents[0].text);
  const examples = info.clientExamples as { name: string; tool: string; arguments: Record<string, unknown> }[];
  const expected = { "get-current-decision": "conversation", "poll-plan-status": "status", "read-plan-score-and-sources": "details", "payment-recovery": "conversation", "poll-order-status": "status", "read-frozen-order": "details" };
  for (const [name, view] of Object.entries(expected)) {
    const row = examples.find(example => example.name === name); assert.ok(row, `Missing executable ${name}`);
    assert.equal(row.arguments.responseView, view);
  }
  assert.ok(!examples.some(row => row.name === "get-current-or-processing"));
  const text = String(info.clientGuideText);
  assert.match(text, /\| `doseFit` \| Not returned \| `sections=\["score"\]` \|/);
  assert.match(text, /\| `claimIds` \| Not returned \| `sections=\["advice"\]` \|/);
  assert.ok(!text.includes("remain visible in doseFit"));
  assert.ok(!text.includes("Supporting sources, evidence, claim IDs and uncertainty are returned in plan response fields."));
});

for (const locale of ["en", "th", "zh-CN"]) test(`PAY-SCHEMA-05 ${locale} published view examples continue admitted work and retrieve only the promised fields`, { timeout: 60000 }, async () => {
  await installRealCatalogue("dev");
  const app = { ...runtime(`narrative-${locale}`), isolatedInfo: { conditionCodes: [], medicationCodes: [], supportedCountries: [{ countryCode: "TH", countryName: "Thailand", currency: "THB" }] } };
  const ajv = new Ajv({ strict: false, validateFormats: false });
  const validators = new Map(toolList().map(row => [row.name, { input: ajv.compile(row.inputSchema), output: ajv.compile(row.outputSchema) }]));
  const call = async (name: string, args: Record<string, unknown>) => {
    const check = validators.get(name)!; assert.ok(check.input(args), JSON.stringify(check.input.errors));
    const value = await rpc(app, name, args); assert.equal(value.ok, true, JSON.stringify(value));
    assert.ok(check.output(value), JSON.stringify(check.output.errors)); return value;
  };
  const help = await call("info", { locale, view: "client_guide" });
  const examples = help.clientExamples as { name: string; tool: string; arguments: Record<string, unknown> }[];
  const example = (name: string) => { const row = examples.find(row => row.name === name); assert.ok(row, `Missing ${name}`); return structuredClone(row.arguments); };
  const getHelp = await call("info", { locale, view: "plan_schema", planOperation: "get" });
  assert.deepEqual((getHelp.clientExamples as typeof examples).map(row => row.arguments.responseView), ["conversation", "status", "details"]);
  const key = `narrative-create-${locale}`;
  const created = await call("plan", { ...example("create"), idempotencyKey: key, request: { ...profile("A6"), locale } });
  assert.equal(created.status, "ready");
  const ownerScope = `dev:mattanutra:${app.scope.principalScope}`;
  const initial = await app.store.getPlanOperationByKey(ownerScope, key); assert.ok(initial);
  // External harness admits a queued revision so polling never depends on
  // whether matching happens to finish before the handoff timer.
  const operation = await admitPlanOperation(app.store, { planId: initial.planId, ownerScope, key: `narrative-refine-${locale}`,
    payload: { operation: "revise", planHandle: created.planHandle, expectedRevision: 1, idempotencyKey: `narrative-refine-${locale}`, requestPatch: {} }, expectedRevision: 1, revision: 2,
    prepared: { ...initial.command.prepared, revision: 2, existingPlan: await app.store.getPlan(initial.planId), previous: (await app.store.getPlanRevision(initial.planId, 1))!.result }, scope: app.scope, now: app.now! });
  const firstPoll = await call("plan", { ...example("poll-plan-status"), planHandle: created.planHandle, knownResultVersion: created.resultVersion });
  assert.equal(firstPoll.status, "processing"); assert.equal(firstPoll.unchanged, false);
  const statusArgs = { ...example("poll-plan-status"), planHandle: created.planHandle, knownResultVersion: firstPoll.resultVersion };
  const status = await call("plan", statusArgs);
  assert.equal(status.status, "processing"); assert.equal(status.unchanged, true); assert.ok(!Object.hasOwn(status, "options"));
  const completion = await runAdmittedPlanOperation({ store: app.store, config: app.config, operationId: operation.id });
  assert.equal(completion.ok, true, JSON.stringify(completion));
  const completed = await call("plan", statusArgs); assert.equal(completed.unchanged, false); assert.notEqual(completed.status, "processing");
  const plan = await call("plan", { ...example("get-current-decision"), planHandle: created.planHandle });
  const options = plan.options as Record<string, unknown>[]; assert.ok(options.length > 1);
  assert.ok(options.every(row => !Object.hasOwn(row, "doseFit"))); assert.ok(!Object.hasOwn(plan, "claimIds"));
  const option = options.find(row => row.purchaseEligible); assert.ok(option);
  const details = await call("plan", { ...example("read-plan-score-and-sources"), planHandle: plan.planHandle, expectedRevision: plan.revision, optionIds: [option.optionId] });
  const detailedOptions = details.options as Record<string, unknown>[];
  assert.equal(detailedOptions.length, 1); assert.equal(detailedOptions[0].optionId, option.optionId);
  assert.ok(detailedOptions[0].doseFit); assert.ok(Array.isArray(detailedOptions[0].advice)); assert.ok(!Object.hasOwn(detailedOptions[0], "basket"));
  const full = await call("plan", { operation: "get", planHandle: plan.planHandle, responseView: "full" });
  assert.deepEqual(details.claimIds, full.claimIds);
  const selected = await call("plan", { ...example("select"), planHandle: plan.planHandle, expectedRevision: plan.revision, optionId: option.optionId, idempotencyKey: `narrative-select-${locale}` });
  // The isolated test persona confirms the exact selected revision.
  const checkout = await call("execute", { ...example("confirm-then-checkout"), planHandle: selected.planHandle, expectedRevision: selected.revision, idempotencyKey: `narrative-checkout-${locale}` });
  const order = await call("order", { ...example("payment-recovery"), orderHandle: checkout.orderHandle });
  const orderStatus = await call("order", { ...example("poll-order-status"), orderHandle: checkout.orderHandle, knownResultVersion: order.resultVersion });
  assert.equal(orderStatus.unchanged, true); assert.ok(!Object.hasOwn(orderStatus, "frozenOrder"));
  const frozen = await call("order", { ...example("read-frozen-order"), orderHandle: checkout.orderHandle });
  const fullOrder = await call("order", { orderHandle: checkout.orderHandle });
  assert.deepEqual(frozen.frozenOrder, fullOrder.frozenOrder); assert.ok(!Object.hasOwn(frozen, "events"));
});
