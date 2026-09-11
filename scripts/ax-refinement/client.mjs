/** Tools/resources and returned identifiers are this client's only API contract.
 * The host owns fixtures and settlement; this module has no application imports. */
import assert from "node:assert/strict";
import Ajv from "ajv";
import { contractFromToolDiscovery, publishedExample, selectPublishedResources } from "../published-client-journey.mjs";

export async function refinementJourney({ rpc, request, discovery = "tools_only", key, settle, wait = ms => new Promise(done => setTimeout(done, ms)) }) {
  const transcript = [];
  const tools = (await rpc("tools/list", {})).tools;
  const first = (await rpc("tools/call", { name: "info", arguments: { locale: request.locale } })).structuredContent;
  assert.equal(first.contractVersion, "8.0.0");
  let contract;
  if (discovery === "resources") {
    const resources = (await rpc("resources/list", {})).resources;
    const chosen = selectPublishedResources(first, resources);
    contract = JSON.parse((await rpc("resources/read", { uri: chosen.schema.uri })).contents[0].text);
  } else {
    const guide = (await rpc("tools/call", { name: "info", arguments: { locale: request.locale, view: "client_guide" } })).structuredContent;
    contract = contractFromToolDiscovery(first, tools, guide.clientGuideText);
  }
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const schemas = new Map(tools.map(tool => [tool.name, { input: ajv.compile(tool.inputSchema), output: ajv.compile(tool.outputSchema) }]));
  async function call(tool, args) {
    // This regression verifies detailed coverage and quantities. The published
    // schema explicitly permits full; ordinary clients still default to conversation.
    if (tool === "plan") args = { ...args, responseView: "full" };
    const schema = schemas.get(tool); assert.ok(schema, `${tool} must be discoverable`);
    assert.ok(schema.input(args), JSON.stringify(schema.input.errors));
    const result = (await rpc("tools/call", { name: tool, arguments: args })).structuredContent;
    assert.ok(schema.output(result), JSON.stringify(schema.output.errors));
    transcript.push({ tool, arguments: args, result }); return result;
  }
  async function complete(result) {
    for (let polls=0; result.status === "processing" && polls < 90; polls++) {
      await wait(result.pollAfterSeconds * 1000);
      result = await call("plan", { ...publishedExample(contract, "get-current-decision"), planHandle: result.planHandle });
    }
    assert.equal(result.ok, true, JSON.stringify(result)); assert.notEqual(result.status, "processing"); return result;
  }
  const template = contract.examples.find(row => row.tool === "plan" && row.arguments.operation === "create");
  assert.ok(template, "Create must be documented");
  let plan = await complete(await call("plan", { ...template.arguments, request, idempotencyKey: `${key}-create` }));
  const original = plan;
  assert.equal(plan.acknowledgementStatus, "not_required");
  assert.equal(plan.coverage.length, request.targets.length, "No requested target disappears");
  if (request.currentSupplements?.some(row => row.daysRemaining === 90)) {
    plan = await complete(await call("plan", { operation: "revise", planHandle: plan.planHandle, expectedRevision: plan.revision,
      idempotencyKey: `${key}-continued`, requestPatch: { targets: request.targets.filter(row => row.name === "Vitamin D3") } }));
    assert.equal(plan.status, "no_purchase"); assert.equal(plan.purchaseRequiredNow, false);
    assert.equal(plan.operationalDecision.nextAction, "replenish_later");
    assert.equal(plan.compactDecision.highlightedAlternativeCandidateKey, null);
  } else {
    const pointer = plan.compactDecision?.highlightedAlternativeCandidateKey;
    if (pointer) {
      const alternative = plan.options.find(row => row.candidateKey === pointer);
      assert.ok(alternative?.purchaseEligible && alternative.basket.length && alternative.coveragePercent > 0);
      plan = await complete(await call("plan", { operation: "select", planHandle: plan.planHandle, expectedRevision: plan.revision,
        idempotencyKey: `${key}-select`, candidateKey: pointer }));
      assert.equal(plan.candidateKey, pointer);
    }
    const product = plan.basket[0] ?? plan.options.flatMap(row => row.basket)[0];
    assert.ok(product, "Real exploratory profile must expose an eligible product");
    plan = await complete(await call("plan", { operation: "revise", planHandle: plan.planHandle, expectedRevision: plan.revision,
      idempotencyKey: `${key}-quantity`, requestPatch: { requirements: { productDoses: [{ productId: product.productId, servingsPerDay: product.servingsPerDay }] } } }));
    assert.ok(plan.options.some(option => option.basket.some(item => item.productId === product.productId && item.servingsPerDay === product.servingsPerDay)), "Proposed physical quantity is evaluated before selection");
    const baseRevision = plan.revision;
    plan = await complete(await call("plan", { operation: "revise", planHandle: plan.planHandle, expectedRevision: baseRevision,
      idempotencyKey: `${key}-exclude`, requestPatch: { requirements: { productDoses: [], excludeProductIds: [product.productId], maxDailyPills: null, maxPriceMinor: null, maxProductCount: null } } }));
    for (const option of plan.options) assert.equal(option.basket.some(row => row.productId === product.productId), false);
    const stale = await call("plan", { operation: "select", planHandle: plan.planHandle, expectedRevision: baseRevision,
      idempotencyKey: `${key}-stale`, candidateKey: original.candidateKey ?? original.options[0].candidateKey });
    assert.equal(stale.ok, false); assert.equal(stale.error.reasonCode, "stale_revision");
    const latest = await complete(await call("plan", { operation: "get", planHandle: plan.planHandle }));
    assert.equal(latest.revision, plan.revision);
    if (settle && latest.basket.length && latest.operationalDecision.purchaseEligible) await settle({ call, plan: latest });
  }
  return { discovery, locale: request.locale, original, final: plan, transcript };
}
