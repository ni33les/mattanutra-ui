/** Uses published tools/resources and returned identifiers only. The caller
 * supplies agreed flat request fields; the harness alone owns test settlement. */
import assert from "node:assert/strict";
import Ajv from "ajv";
import { contractFromToolDiscovery, publishedExample, selectPublishedResources } from "../published-client-journey.mjs";

export async function refinementJourney({ rpc, request, discovery = "tools_only", key, settle, wait = ms => new Promise(done => setTimeout(done, ms)) }) {
  const transcript = [];
  const listing = await rpc("tools/list", {}), tools = listing.tools;
  assert.deepEqual(tools.map(row => row.name), ["info", "plan", "execute", "order", "support", "feedback"]);
  const first = (await rpc("tools/call", { name: "info", arguments: { locale: request.locale } })).structuredContent;
  assert.equal(first.contractVersion, "11.0.0");
  assert.equal(first.schemaChecksum, listing.schemaChecksum);
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
    const schema = schemas.get(tool); assert.ok(schema, `${tool} must be discoverable`);
    assert.ok(schema.input(args), JSON.stringify(schema.input.errors));
    const result = (await rpc("tools/call", { name: tool, arguments: args })).structuredContent;
    assert.ok(schema.output(result), JSON.stringify(schema.output.errors));
    transcript.push({ tool, arguments: args, result }); return result;
  }
  async function complete(result) {
    const started = performance.now();
    while (result.status === "processing" && performance.now() - started < 175000) {
      await wait(result.pollAfterSeconds * 1000);
      result = await call("plan", { ...publishedExample(contract, "read-or-poll"), planHandle: result.planHandle });
    }
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.notEqual(result.status, "processing"); assert.notEqual(result.status, "failed");
    assert.ok(result.choices.length <= 1); return result;
  }
  const template = publishedExample(contract, "create-provisional-targets");
  let plan = await complete(await call("plan", { ...template, ...request, idempotencyKey: `${key}-create` }));
  const original = plan;
  const ingredients = plan.choices.flatMap(row => row.ingredients);
  assert.equal(ingredients.filter(row => row.requested !== null).length, request.targets.length, "No requested target disappears");
  const change = async (suffix, fields) => { plan = await complete(await call("plan", { planHandle: plan.planHandle, expectedRevision: plan.revision, idempotencyKey: `${key}-${suffix}`, ...fields })); return plan; };
  if (request.currentSupplements?.some(row => row.daysRemaining === 90)) {
    const kept = ingredients.find(row => row.name === "Vitamin D3" && row.requested !== null); assert.ok(kept);
    await change("continued", { targets: ingredients.filter(row => row.requested !== null && row.ingredientId !== kept.ingredientId).map(row => ({ ingredientId: row.ingredientId, amount: null })) });
    assert.equal(plan.status, "no_purchase"); assert.equal(plan.nextAction, "replenish_later");
    assert.ok(plan.nextReplenishmentDay > 0);
    assert.ok(plan.choices.every(row => row.products.length === 0));
  } else {
    // A single recommendation replaces the retired highlighted-option menu.
    // The agent may explicitly change ranking weights without changing targets.
    if (!plan.choices[0]?.products.length) {
      await change("coverage-tradeoff", { scoring: { weights: { pills: 0, products: 0, price: 0, servings: 0,
        nutrients: Object.fromEntries(ingredients.filter(row => row.requested !== null).map(row => [row.ingredientId, 2])) } } });
    }
    const product = plan.choices[0]?.products[0];
    assert.ok(product, "The real exploratory request must produce a useful routine after explicit refinement");
    await change("quantity", { requirements: { productDoses: [{ productId: product.productId, servingsPerDay: product.servingsPerDay }] } });
    assert.ok(plan.choices[0].products.some(row => row.productId === product.productId && row.servingsPerDay === product.servingsPerDay), "Physical proposal is evaluated before confirmation");
    const baseRevision = plan.revision;
    await change("exclude", { requirements: { productDoses: [], excludeProductIds: [product.productId], maxDailyPills: null, maxPriceMinor: null, maxProductCount: null } });
    for (const choice of plan.choices) assert.equal(choice.products.some(row => row.productId === product.productId), false);
    const stale = await call("plan", { ...publishedExample(contract, "recover-failed-or-stale-work"), planHandle: plan.planHandle, expectedRevision: baseRevision, idempotencyKey: `${key}-stale` });
    assert.equal(stale.ok, false); assert.equal(stale.error.reasonCode, "stale_revision");
    const latest = await complete(await call("plan", { ...publishedExample(contract, "read-or-poll"), planHandle: plan.planHandle }));
    assert.deepEqual(latest, plan);
    if (latest.choices[0]?.products.length) {
      await change("noop", { scoring: {} }); assert.equal(plan.nextAction, "execute");
      assert.equal(plan.revision, latest.revision, "A successful unchanged refinement must not create a confirmation revision");
      assert.deepEqual(plan.choices, latest.choices);
      if (settle) await settle({ call, plan });
    }
  }
  return { discovery, locale: request.locale, original, final: plan, transcript };
}
