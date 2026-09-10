/** Public connector documents and responses are this client's only contract source. */
export function contractFromToolDiscovery(info, tools, guide) {
  const examples = [];
  for (const match of guide.matchAll(/^### ([^\n]+)\n+(?:(\w+)\n+)?```json\n([\s\S]*?)\n```/gm)) {
    const request = JSON.parse(match[3]);
    if (match[2]) examples.push({ name: match[1].trim(), tool: match[2], arguments: request });
    else if (request.method === "tools/call" && request.params?.name && request.params.arguments) examples.push({ name: match[1].trim(), tool: request.params.name, arguments: request.params.arguments });
  }
  if (!examples.length) throw new Error("Connector guide has no executable examples");
  return { contractVersion: info.contractVersion, tools: Object.fromEntries(tools.map(tool => [tool.name, { inputSchema: tool.inputSchema, outputSchema: tool.outputSchema }])), examples };
}

export function selectPublishedResources(info, resources) {
  const schema = resources.find(row => row.uri === info.contractSchema && row.mimeType === "application/schema+json");
  const guide = resources.find(row => row.uri === info.clientGuide && row.mimeType === "text/markdown");
  if (!schema || !guide) throw new Error("Connector is missing its published current schema and client guide");
  return { schema, guide };
}
export function publishedExample(contract, name) {
  const example = contract.examples.find(row => row.name === name);
  if (!example || example.tool !== "plan") throw new Error(`Connector is missing published example: ${name}`);
  return structuredClone(example.arguments);
}

/** Only published tool schemas, descriptions, templates and returned IDs enter this client. */
export async function runConversationalJourney({ rpc, locale = "en", discovery = "tools_only", key = "documented-client", wait = ms => new Promise(done => setTimeout(done, ms)), checkout = false }) {
  const { default: Ajv } = await import("ajv");
  const assert = (await import("node:assert/strict")).default;
  const listing = await rpc("tools/list", {});
  assert.equal(listing.contractVersion, "10.0.0"); assert.equal(listing.tools.length, 7);
  const nameOf = name => listing.tools.find(row => row.name === name || row.name.endsWith(`___${name}`))?.name;
  const ajv = new Ajv({ multipleOfPrecision: 8, strict: false, allErrors: true, validateFormats: false, useDefaults: false });
  const schemas = new Map(listing.tools.map(row => [row.name, { input: ajv.compile(row.inputSchema), output: ajv.compile(row.outputSchema) }]));
  const observations = [], terminal = [], measurements = [];
  async function call(name, args) {
    const actual = nameOf(name); assert.ok(actual, `${name} must be published`);
    const schema = schemas.get(actual); assert.ok(schema.input(args), JSON.stringify(schema.input.errors));
    const result = await rpc("tools/call", { name: actual, arguments: args });
    const value = result.structuredContent ?? JSON.parse(result.content[0].text);
    assert.ok(schema.output(value), JSON.stringify(schema.output.errors));
    assert.equal(result.isError, value.ok === false);
    if (result.structuredContent) assert.ok(!result.content.some(row => row.text === JSON.stringify(value)), "One substantive payload");
    observations.push({ tool: name, arguments: args, result: value });
    if (name === "plan") {
      const structuredBytes = Buffer.byteLength(JSON.stringify(value));
      const messageBytes = Buffer.byteLength(JSON.stringify({ id: 1, jsonrpc: "2.0", result }));
      measurements.push({ status: value.status, structuredBytes, messageBytes });
      if (value.status === "processing") assert.ok(messageBytes < 2000);
      else if (value.ok) { assert.ok(value.choices.length <= 1); assert.ok(structuredBytes < 20000); assert.ok(messageBytes < 22000); }
    }
    return value;
  }
  if (discovery !== "schema_only") {
    const info = await call("info", { locale, view: "client_guide" });
    assert.equal(info.schemaChecksum, listing.schemaChecksum);
    const unified = await call("info", { locale, view: "plan_schema" });
    assert.deepEqual(JSON.parse(unified.planSchemaJson), listing.tools.find(row => row.name === nameOf("plan")).inputSchema);
    assert.ok(info.clientExamples.some(row => row.name === "confirm-recommendation"));
    if (discovery === "resources") {
      const resources = await rpc("resources/list", {}), selected = selectPublishedResources(info, resources.resources);
      const text = (await rpc("resources/read", { uri: selected.guide.uri })).contents[0].text;
      assert.ok(text.includes("selectedOptionId") && text.includes("scoring"));
    }
  }
  async function complete(value, deadline = 175000) {
    const start = performance.now();
    while (value.status === "processing" && performance.now() - start < deadline) {
      await wait(value.pollAfterSeconds * 1000); value = await call("plan", { planHandle: value.planHandle });
    }
    assert.equal(value.ok, true, JSON.stringify(value)); assert.notEqual(value.status, "processing"); assert.notEqual(value.status, "failed");
    terminal.push(value); return value;
  }
  const create = { locale, destinationCountry: "TH", idempotencyKey: `${key}-create`, targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU", basis: "supplemental" }] };
  const started = performance.now(); let plan = await complete(await call("plan", create), 15000);
  const readyMs = performance.now() - started; assert.ok(readyMs <= 15000, `Idle D3 readiness ${readyMs}ms`);
  assert.equal(plan.selectedOptionId, null); assert.equal(plan.choices.length, 1); assert.equal(plan.scoring.profile, "best_match"); assert.ok(plan.recommendedOptionId);
  const original = plan;
  const change = async (suffix, fields) => { plan = await complete(await call("plan", { planHandle: plan.planHandle, expectedRevision: plan.revision, idempotencyKey: `${key}-${suffix}`, ...fields })); return plan; };
  await change("noop", { scoring: {} }); assert.equal(plan.revision, original.revision);
  await change("pills", { scoring: { weights: { pills: 0.543 } } }); assert.equal(plan.scoring.weights.pills, 0.543);
  const ingredient = plan.choices.flatMap(row => row.ingredients).find(row => row.requested === 2000); assert.ok(ingredient);
  await change("avoid", { targets: [{ ingredientId: ingredient.ingredientId, amount: 0 }], scoring: { weights: { nutrients: { [ingredient.ingredientId]: 1 } } } });
  assert.equal(plan.scoring.weights.nutrients[ingredient.ingredientId], 1);
  assert.ok(plan.choices.flatMap(row => row.ingredients).some(row => row.requested === 0));
  await change("reset", { targets: [{ ingredientId: ingredient.ingredientId, amount: 2000 }], scoring: { weights: null } }); assert.deepEqual(plan.scoring.weights, {});
  const candidate = currentRecommendation(plan); assert.ok(candidate?.products.length);
  const stale = await call("plan", { planHandle: plan.planHandle, expectedRevision: original.revision, selectedOptionId: candidate.optionId, idempotencyKey: `${key}-stale` });
  assert.equal(stale.ok, false); assert.equal(stale.error.reasonCode, "stale_revision");
  const selection = { planHandle: plan.planHandle, expectedRevision: plan.revision, selectedOptionId: candidate.optionId, idempotencyKey: `${key}-select` };
  plan = await complete(await call("plan", selection)); assert.ok(plan.selectedOptionId); assert.equal(plan.nextAction, "execute");
  assert.deepEqual(await call("plan", selection), plan);
  const selected = plan.choices.find(row => row.optionId === plan.selectedOptionId); assert.ok(selected);
  for (const product of selected.products) if (product.lineTotal !== null) assert.equal(Math.round(product.lineTotal * 100), product.quantity * Math.round(product.unitPrice * 100));
  const evidence = await call("evidence", { planHandle: plan.planHandle, expectedRevision: plan.revision, optionId: selected.optionId, productId: selected.products[0].productId });
  assert.equal(evidence.ok, true); assert.ok(Array.isArray(evidence.facts));
  if (checkout) {
    const args = { planHandle: plan.planHandle, expectedRevision: plan.revision, idempotencyKey: `${key}-checkout` };
    const order = await call("execute", args); assert.equal(order.ok, true, JSON.stringify(order));
    assert.deepEqual(await call("execute", args), order);
    const recovered = await call("order", { orderHandle: order.orderHandle }); assert.equal(recovered.ok, true);
    assert.equal(recovered.orderReference, order.orderReference); assert.ok(!("frozenOrder" in recovered)); terminal.push(recovered);
  } else {
    await change("remove", { targets: [{ ingredientId: ingredient.ingredientId, amount: null }] });
    assert.equal(plan.status, "no_purchase"); assert.equal(plan.nextAction, "no_purchase");
  }
  return { locale, discovery, terminal, observations, measurements, readyMs };
}

export function customerTargetConfirmation(plan) {
  for (const question of plan.questions ?? []) {
    const choice = question.choices.find(row => row.choice === 'satisfy_prerequisite');
    if (choice) return { question, choice };
  }
  throw new Error('No documented customer confirmation choice');
}
export function currentRecommendation(plan) {
  if (plan.choices.length !== 1) throw new Error('Expected one current recommendation');
  const choice = plan.choices[0];
  if (choice.optionId !== (plan.selectedOptionId ?? plan.recommendedOptionId) || !choice.products.length) throw new Error('No current purchasable recommendation');
  return choice;
}
export async function recoverPublishedPatch({ intended, idempotencyKey, current, callPlan }) {
  const latest = await current(await callPlan({ planHandle: intended.planHandle }));
  if (!latest.ok || !latest.planHandle || !Number.isSafeInteger(latest.revision) || latest.revision < 1) throw new Error('Cannot reload a current revision');
  const recovered = await current(await callPlan({ ...intended, planHandle: latest.planHandle, expectedRevision: latest.revision, idempotencyKey }));
  return { current: latest, recovered };
}
