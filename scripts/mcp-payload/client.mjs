/** Tools-only client: no application imports, database access or private fixture
 * APIs. Inputs are customer-agreed targets; all continuation IDs come from MCP. */
import assert from "node:assert/strict";
import Ajv from "ajv";

export async function payloadJourney({ rpc, request, key, view = "conversation", reader = "structured", resources = false,
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) }) {
  const trace = [], decisions = [];
  const initialize = await rpc("initialize", { protocolVersion: "2025-06-18" });
  assert.ok(initialize.instructions.includes("plan"));
  const discovery = await rpc("tools/list", {});
  assert.deepEqual(discovery.tools.map(tool => tool.name), ["info", "plan", "execute", "order", "support", "feedback", "evidence"]);
  const ajv = new Ajv({ strict: false, validateFormats: false });
  const validators = new Map(discovery.tools.map(tool => [tool.name, { input: ajv.compile(tool.inputSchema), output: ajv.compile(tool.outputSchema) }]));
  async function tool(name, args, expectError = false, purpose = "decision") {
    const check = validators.get(name); assert.ok(check);
    assert.ok(check.input(args), `${name} input: ${JSON.stringify(check.input.errors)}`);
    const result = await rpc("tools/call", { name, arguments: args });
    const value = reader === "text" ? JSON.parse(result.content.filter(row => row.type === "text").at(-1).text) : result.structuredContent;
    assert.deepEqual(value, result.structuredContent, "Text continuation must preserve the exact wire result");
    assert.ok(check.output(value), `${name} output: ${JSON.stringify(check.output.errors)}`);
    assert.equal(value.ok, !expectError, JSON.stringify(value));
    trace.push({ tool: name, purpose, operation: args.operation, status: value.status ?? value.paymentStatus, revision: value.revision, nextAction: purpose === "details" ? undefined : value.operationalDecision?.nextAction ?? value.nextAction, error: value.error?.reasonCode });
    return value;
  }
  const info = await tool("info", { locale: request.locale });
  assert.ok(info.clientInstructions.includes("supplemental"));
  assert.ok(info.clientExamples.some(example => example.tool === "plan" && example.arguments.operation === "create"));
  if (resources) {
    const guide = await rpc("resources/read", { uri: info.clientGuide });
    assert.ok(guide.contents[0].text.includes("requestPatch"));
  }
  const presentation = view === "conversation" ? {} : { responseView: "full" };
  async function settlePlan(plan) {
    let polled = false;
    for (let polls = 0; plan.status === "processing" && polls < 4; polls++) {
      await wait(Math.max(0, plan.pollAfterSeconds ?? info.pollAfterSeconds) * 1000);
      plan = await tool("plan", { operation: "get", planHandle: plan.planHandle, responseView: "status",
        ...(plan.resultVersion ? { knownResultVersion: plan.resultVersion } : {}) });
      polled = true;
    }
    assert.notEqual(plan.status, "processing", "Controlled work must finish; no automatic operation retry");
    if (polled) plan = await tool("plan", { operation: "get", planHandle: plan.planHandle, ...presentation });
    decisions.push(plan); return plan;
  }
  const create = { ...structuredClone(info.clientExamples.find(example => example.tool === "plan" && example.arguments.operation === "create").arguments), operation: "create", idempotencyKey: `${key}-create`, request, ...presentation };
  if (view === "conversation") delete create.responseView;
  let plan = await settlePlan(await tool("plan", create));
  const initial = plan;
  const selectedId = value => value.selectedOptionId ?? value.optionId;
  const highlightId = value => value.highlightedAlternativeOptionId ?? value.compactDecision?.highlightedAlternativeOptionId;
  const purchasable = value => value.options.find(option => option.optionId === highlightId(value) && option.purchaseEligible)
    ?? value.options.find(option => option.optionId === selectedId(value) && option.purchaseEligible)
    ?? value.options.find(option => option.purchaseEligible);
  async function select(option) {
    assert.ok(option, "Fixture must contain a useful purchase choice");
    plan = await settlePlan(await tool("plan", { operation: "select", planHandle: plan.planHandle, expectedRevision: plan.revision,
      idempotencyKey: `${key}-select-${plan.revision}`, optionId: option.optionId, ...presentation }));
    assert.equal(selectedId(plan), option.optionId);
    const chosen = plan.options.find(option => option.optionId === selectedId(plan));
    assert.ok(chosen.basket.length > 0); return chosen;
  }
  let chosen = await select(purchasable(plan));
  const productId = chosen.basket[0].productId;
  // Asking about label basis is explicit detail work, never an ordinary review prerequisite.
  const details = await tool("plan", view === "conversation" ? { operation: "get", planHandle: plan.planHandle, expectedRevision: plan.revision,
    responseView: "details", sections: ["products", "advice"], optionIds: [chosen.optionId] } : { operation: "get", planHandle: plan.planHandle, responseView: "full" }, false, "details");
  const product = details.options.find(option => option.optionId === chosen.optionId).basket.find(item => item.productId === productId);
  assert.equal(product.servingsPerDay, chosen.basket[0].servingsPerDay);
  const proposal = { operation: "revise", planHandle: plan.planHandle, expectedRevision: plan.revision, idempotencyKey: `${key}-quantity`,
    requestPatch: { requirements: { productDoses: [{ productId, servingsPerDay: product.servingsPerDay }] } }, ...presentation };
  plan = await settlePlan(await tool("plan", proposal));
  plan = await settlePlan(await tool("plan", { operation: "revise", planHandle: plan.planHandle, expectedRevision: plan.revision,
    idempotencyKey: `${key}-exclude`, requestPatch: { requirements: { productDoses: [], excludeProductIds: [productId] } }, ...presentation }));
  for (const option of plan.options) assert.ok(!(option.basket ?? []).some(item => item.productId === productId));
  plan = await settlePlan(await tool("plan", { operation: "revise", planHandle: plan.planHandle, expectedRevision: plan.revision,
    idempotencyKey: `${key}-clear`, requestPatch: { requirements: { excludeProductIds: [], maxProductCount: null } }, ...presentation }));
  const stale = await tool("plan", { operation: "select", planHandle: plan.planHandle, expectedRevision: initial.revision,
    idempotencyKey: `${key}-stale`, optionId: selectedId(initial), ...presentation }, true);
  assert.ok(["stale_revision", "revision_conflict"].includes(stale.error.reasonCode));
  plan = await settlePlan(await tool("plan", { operation: "get", planHandle: plan.planHandle, ...presentation }));
  chosen = await select(purchasable(plan));
  assert.equal(plan.operationalDecision.purchaseEligible, true);
  // The test persona confirms these exact returned products, doses and revision.
  const confirmation = { revision: plan.revision, optionId: chosen.optionId, basket: chosen.basket.map(item => ({ productId: item.productId, servingsPerDay: item.servingsPerDay, quantity: item.quantity, lineTotalMinor: item.lineTotalMinor })) };
  const execute = { planHandle: plan.planHandle, expectedRevision: plan.revision, idempotencyKey: `${key}-checkout` };
  const checkout = await tool("execute", execute);
  const order = await tool("order", { orderHandle: checkout.orderHandle, responseView: view, ...(view === "conversation" ? { locale: request.locale } : {}) });
  assert.equal(order.paymentStatus, "unpaid");
  await wait(Math.max(0, order.pollAfterSeconds) * 1000);
  const paid = await tool("order", { orderHandle: checkout.orderHandle,
    ...(view === "conversation" ? { responseView: "status", knownResultVersion: order.resultVersion, locale: request.locale } : presentation) });
  assert.equal(paid.paymentStatus, "paid");
  const replay = await tool("execute", execute);
  assert.equal(replay.orderHandle, checkout.orderHandle); assert.deepEqual(replay.frozenPlan, checkout.frozenPlan);
  const support = await tool("support", { orderHandle: checkout.orderHandle, idempotencyKey: `${key}-support`, message: "Isolated fixture: explain the order tracking state." });
  assert.equal(support.status, "open");
  await tool("feedback", { planHandle: plan.planHandle, expectedRevision: plan.revision, optionId: chosen.optionId,
    idempotencyKey: `${key}-feedback`, consentConfirmed: true, rating: 4, summary: "Isolated fixture: decisions and recovery remained clear." });
  return { trace, decisions, confirmation, checkout, order, paid, reader, resources };
}
