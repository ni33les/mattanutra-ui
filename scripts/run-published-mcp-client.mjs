#!/usr/bin/env node
/** A client of the published connector only. No application, catalogue or store imports. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import Ajv from "ajv";
import { selectPublishedResources, publishedExample, selectPurchaseTradeOff, customerTargetConfirmation, recoverPublishedPatch } from "./published-client-journey.mjs";
import { CLIENT_NORMALIZATION, normalizePublishedClientResult } from "./published-client-semantics.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const endpoint = new URL(arg("--url", process.env.MCP_URL ?? "http://127.0.0.1:3000/api/mcp"));
if (!["localhost", "127.0.0.1", "[::1]", "dev.mattanutra.com"].includes(endpoint.hostname)) throw new Error("The documented client journey is restricted to DEV or localhost.");
const output = resolve(arg("--output", "/tmp/mattanutra-published-client"));
const runKey = arg("--run-key", randomUUID());
const resumeFile = arg("--resume", null);
const locale = arg("--locale", "en");
if (!["en", "th", "zh-CN"].includes(locale)) throw new Error("Documented acceptance locale must be en, th or zh-CN.");
const transcript = [];
const assertions = [];
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true, coerceTypes: false, useDefaults: false, removeAdditional: false, validateFormats: false });
let requestId = 0, sessionId;
const validators = new Map();
let contract;
function check(condition, message) { assertions.push({ message, passed: Boolean(condition) }); if (!condition) throw new Error(message); }
async function rpc(method, params = {}) {
  const request = { jsonrpc: "2.0", id: ++requestId, method, params };
  const started = performance.now();
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...(sessionId ? { "mcp-session-id": sessionId } : {}) }, body: JSON.stringify(request), signal: AbortSignal.timeout(30000) });
  if (response.headers.get("mcp-session-id")) sessionId = response.headers.get("mcp-session-id");
  const raw = await response.text();
  let body;
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const lines = raw.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).filter(Boolean);
    body = lines.map(line => JSON.parse(line)).find(item => item.id === request.id);
  } else body = JSON.parse(raw);
  transcript.push({ request, httpStatus: response.status, response: body, latencyMs: Math.round(performance.now() - started) });
  check(response.ok && body && !body.error, `${method} succeeds`);
  return body.result;
}
function validate(schema, value, name) {
  let compiled = validators.get(schema);
  if (!compiled) { compiled = ajv.compile(schema); validators.set(schema, compiled); }
  check(compiled(value), `${name} conforms to its published schema${compiled.errors ? `: ${JSON.stringify(compiled.errors)}` : ""}`);
}
async function call(name, arguments_) {
  const descriptor = contract.tools[name];
  check(Boolean(descriptor), `${name} is documented`);
  validate(descriptor.inputSchema, arguments_, `${name} request`);
  const result = await rpc("tools/call", { name, arguments: arguments_ });
  validate(descriptor.outputSchema, result.structuredContent, `${name} response`);
  const value = result.structuredContent;
  for (const item of result.content ?? []) {
    if (item.type !== "text" || typeof item.text !== "string") continue;
    let parsed;
    try { parsed = JSON.parse(item.text); } catch { continue; }
    if (parsed && typeof parsed === "object" && "ok" in parsed) check(isDeepStrictEqual(parsed, value), `${name} JSON text and structured response agree`);
  }
  check(result.isError === (value.ok === false), `${name} error envelope agrees`);
  return value;
}
async function current(plan) {
  for (let i = 0; plan.status === "processing" && i < 90; i++) {
    await new Promise(done => setTimeout(done, Math.max(1, plan.pollAfterSeconds ?? 1) * 1000));
    plan = await call("plan", { operation: "get", planHandle: plan.planHandle });
  }
  check(plan.status !== "processing", "plan finishes within the published polling window");
  return plan;
}
function checkFrozenMoney(frozen, label) {
  check(Boolean(frozen && Array.isArray(frozen.items)), `${label} supplies a frozen item ledger`);
  for (const item of frozen.items) check(Number.isInteger(item.quantity) && item.quantity > 0 && item.lineTotalMinor === item.quantity * item.unitPriceMinor, `${label} line total matches purchased pack quantity`);
  check(frozen.subtotalMinor === frozen.items.reduce((sum, item) => sum + item.lineTotalMinor, 0), `${label} subtotal equals its line totals`);
  check(frozen.totalPriceMinor === frozen.subtotalMinor + frozen.shippingMinor + frozen.taxMinor, `${label} total includes the stated items, delivery and tax`);
}
async function exercisePartialMatchAndAnswer(request, baseline) {
  const partialExample = contract.examples.find(item => item.name === "create-partial-coverage");
  const decisionExample = contract.examples.find(item => item.name === "ask-customer-target-decision");
  const answerExample = contract.examples.find(item => item.name === "answer-returned-customer-decision");
  check(partialExample?.tool === "plan" && decisionExample?.tool === "plan" && answerExample?.tool === "plan", "connector publishes partial-coverage and customer-choice examples");
  const target = partialExample.arguments.request.targets[0];
  const retained = baseline.basket.find(item => (item.requestedNutrients ?? []).some(nutrient => nutrient.name === target.name && nutrient.unit === target.unit));
  check(Boolean(retained), "published basket identifies the fixture nutrient and product");
  const nutrient = retained.requestedNutrients.find(item => item.name === target.name && item.unit === target.unit);
  check(nutrient.amount / retained.servingsPerDay === 1000 && target.amount === 2500 && target.unit === "IU", "partial example matches the published 1000 IU per-serving product fact");
  const partialRequest = { ...structuredClone(request), targets: structuredClone(partialExample.arguments.request.targets),
    requirements: { ...structuredClone(request.requirements), ...structuredClone(partialExample.arguments.request.requirements), retainProductIds: [retained.productId] } };
  function preserved(plan, label) {
    check(isDeepStrictEqual(plan.medicationCodes, request.medicationCodes), `${label} preserves the disclosed medication`);
    const row = plan.coverage.find(item => item.name === target.name);
    check(row && row.requestedAmount === target.amount && row.unit === target.unit && row.basis === target.basis, `${label} preserves the provisional target amount, unit and basis`);
    check(plan.basket.length === 1 && plan.basket.every(item => item.productId === retained.productId), `${label} respects the explicitly retained product`);
    return row;
  }
  function honestPartial(plan, label) {
    const row = preserved(plan, label);
    check(plan.status === "ready" && row.status === "partial" && row.coveragePercent === 80 && row.deliveredAmount === 2000 && row.remainingGap === 500, `${label} reports genuine 80% per-target dose coverage and a 500 IU gap`);
    check(plan.acknowledgementStatus === "not_required" && (plan.questions ?? []).length === 0, `${label} introduces no mandatory question or health acknowledgement`);
  }
  let partial = await current(await call("plan", { ...partialExample.arguments, request: partialRequest, idempotencyKey: `docs-partial-${runKey}` }));
  honestPartial(partial, "Partial plan");
  partial = await current(await call("plan", { ...decisionExample.arguments, planHandle: partial.planHandle, expectedRevision: partial.revision, idempotencyKey: `docs-customer-decision-${runKey}` }));
  preserved(partial, "Customer-decision revision");
  check(partial.status === "needs_input" && partial.operationalDecision.nextAction === "answer_questions", "an explicit customer decision returns actionable needs_input");
  const { question, choice } = customerTargetConfirmation(partial);
  check(Boolean(question && choice), "the connector offers a choice to confirm the customer's provisional target");
  partial = await current(await call("plan", { ...answerExample.arguments, planHandle: partial.planHandle, expectedRevision: partial.revision,
    idempotencyKey: `docs-customer-answer-${runKey}`, answers: [{ questionId: question.questionId, choice: choice.choice }] }));
  honestPartial(partial, "Answered customer decision");
}

let receipt;
let failure;
try {
  await mkdir(output, { recursive: true });
  const initialized = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "published-documentation-client", version: "5.0.0" } });
  check(typeof initialized.instructions === "string" && /advi(?:ce|s)/i.test(initialized.instructions), "connector supplies essential advisory instructions");
  const tools = (await rpc("tools/list")).tools;
  check(tools.length === 7, "exactly seven public tools are advertised");
  const infoTool = tools.find(tool => tool.name === "info");
  check(Boolean(infoTool), "capability discovery is advertised");
  validate(infoTool.inputSchema, { locale }, "info request");
  const bootstrap = await rpc("tools/call", { name: "info", arguments: { locale } });
  validate(infoTool.outputSchema, bootstrap.structuredContent, "info response");
  const info = bootstrap.structuredContent;
  check(info.ok && info.contractVersion === "5.0.0", "v5 capability discovery succeeds");
  check(info.supportedLocales.includes(locale), "the requested language is supported");
  const resources = (await rpc("resources/list")).resources;
  const selectedResources = selectPublishedResources(info, resources);
  contract = JSON.parse((await rpc("resources/read", { uri: selectedResources.schema.uri })).contents[0].text);
  const guide = (await rpc("resources/read", { uri: selectedResources.guide.uri })).contents[0].text;
  check(contract.contractVersion === info.contractVersion, "current resources match capability discovery");
  check(/plan\.question\.satisfy_prerequisite/.test(guide) && /requestPatch/.test(guide) && /stale_revision/.test(guide) && /payment/i.test(guide) && /productDoses/.test(guide) && /searchEffort/.test(guide), "guide explains conversational refinement and recovery");
  for (const tool of tools) {
    check(JSON.stringify(tool.inputSchema) === JSON.stringify(contract.tools[tool.name].inputSchema), `${tool.name} input matches published contract`);
    check(JSON.stringify(tool.outputSchema) === JSON.stringify(contract.tools[tool.name].outputSchema), `${tool.name} output matches published contract`);
  }
  if (resumeFile) {
    receipt = JSON.parse(await readFile(resumeFile, "utf8"));
    check(receipt.endpoint === endpoint.href && receipt.locale === locale, "saved receipt belongs to this environment and language");
    receipt.order = await call("order", { orderHandle: receipt.checkout.orderHandle });
    checkFrozenMoney(receipt.order.frozenOrder, "Recovered order");
    check(receipt.order.money.totalPriceMinor === receipt.order.frozenOrder.totalPriceMinor, "Recovered order money matches the frozen quote");
  } else {
    const example = contract.examples.find(item => item.name === "create");
    check(example?.tool === "plan", "create uses an example supplied by the connector");
    const request = { ...structuredClone(example.arguments.request), locale };
    check(info.supportedCountries.some(country => country.countryCode === request.destinationCountry), "example destination is currently deliverable");
    check(info.medicationCodes.length > 0, "capabilities supply a medication for the context-preservation fixture");
    request.medicationCodes = [info.medicationCodes[0]];
    const create = { ...example.arguments, request, idempotencyKey: `docs-create-${runKey}` };
    let plan = await current(await call("plan", create));
    check(plan.locale === locale, "created plan uses the requested language");
    check(plan.ok && Array.isArray(plan.options) && plan.options.length > 0, "fixture produces reviewable options from partial health information");
    check(JSON.stringify(plan.medicationCodes) === JSON.stringify(request.medicationCodes), "created plan retains the explicitly disclosed medication");
    check(plan.acknowledgementStatus === "not_required", "health advice requires no acknowledgement");
    check(plan.operationalDecision.status === plan.status, "operational status is consistent");
    await exercisePartialMatchAndAnswer(request, plan);
    const originalTargets = structuredClone(request.targets);
    const returnedProducts = plan.options.flatMap(option => option.basket ?? []);
    const tradeOff = selectPurchaseTradeOff(plan);
    check(tradeOff.doseFit && tradeOff.coverage?.length && tradeOff.roles?.length, "trade-off exposes dose fit, coverage and explicit roles");
    const selectedTradeOff = { ...publishedExample(contract, "select"), planHandle: plan.planHandle, expectedRevision: plan.revision,
      idempotencyKey: `docs-tradeoff-${runKey}`, optionId: tradeOff.optionId };
    plan = await current(await call("plan", selectedTradeOff));
    check(plan.optionId === tradeOff.optionId && plan.operationalDecision.purchaseEligible, "selecting a disclosed trade-off is purchasable without acknowledgement");
    const proposalProduct = returnedProducts.find(item => item.administration?.route === "oral" && item.administration.provenance?.status === "verified" && item.administration.unitsPerServing > 0 && item.administration.doseIncrement > 0);
    check(Boolean(proposalProduct), "a returned product provides verified physical administration for the quantity proposal");
    const proposal = { productId: proposalProduct.productId, servingsPerDay: proposalProduct.servingsPerDay };
    const physicalIncrements = proposal.servingsPerDay * proposalProduct.administration.unitsPerServing / proposalProduct.administration.doseIncrement;
    check(Math.abs(physicalIncrements - Math.round(physicalIncrements)) < 1e-9, "the proposed returned quantity consists of supported measurable increments");
    const quantityExample = publishedExample(contract, "propose-product-quantity");
    plan = await current(await call("plan", { ...quantityExample, planHandle: plan.planHandle, expectedRevision: plan.revision,
      idempotencyKey: `docs-quantity-${runKey}`, requestPatch: { ...quantityExample.requestPatch,
        requirements: { ...quantityExample.requestPatch.requirements, productDoses: [proposal] } } }));
    check(plan.ok && plan.basket.some(item => item.productId === proposal.productId && item.servingsPerDay === proposal.servingsPerDay), "revised evaluation honours the explicitly proposed product quantity");
    check(isDeepStrictEqual(plan.medicationCodes, request.medicationCodes), "quantity refinement preserves medication context");
    check(plan.acknowledgementStatus === "not_required", "quantity advice does not require acknowledgement");
    plan = await current(await call("plan", { ...publishedExample(contract, "clear-quantity-proposals"), planHandle: plan.planHandle,
      expectedRevision: plan.revision, idempotencyKey: `docs-clear-quantity-${runKey}` }));
    const product = plan.basket?.[0] ?? plan.options.flatMap(option => option.basket ?? [])[0];
    check(product?.productId, "published result identifies a product to reject");
    const before = plan;
    const patch = { ...publishedExample(contract, "exclude-one-product"), planHandle: plan.planHandle, expectedRevision: plan.revision, idempotencyKey: `docs-exclude-${runKey}`, requestPatch: { requirements: { excludeProductIds: [product.productId] } } };
    plan = await current(await call("plan", patch));
    check(plan.ok && !(plan.basket ?? []).some(item => item.productId === product.productId), "replanning excludes the requested product");
    check(JSON.stringify(plan.medicationCodes) === JSON.stringify(request.medicationCodes), "replanning retains disclosed medications");
    const requestedRows = [...(plan.coverage ?? []), ...(plan.leftovers ?? [])];
    check(originalTargets.every(target => requestedRows.some(row => row.name === target.name && (row.requestedAmount ?? row.amount) === target.amount && row.unit === target.unit && row.basis === (target.basis ?? "total_daily"))), "replanning retains every original target amount, unit and basis");
    const stale = await call("plan", { ...patch, idempotencyKey: `docs-stale-${runKey}`, expectedRevision: before.revision });
    check(stale.ok === false && stale.error.reasonCode === "stale_revision", "stale revisions provide an actionable error");
    const recovery = await recoverPublishedPatch({ contract, intended: patch, idempotencyKey: `docs-recover-stale-${runKey}`,
      callPlan: args => call("plan", args), current });
    plan = recovery.recovered;
    check(plan.ok && plan.revision > recovery.current.revision && plan.planHandle === recovery.current.planHandle,
      "stale recovery reapplies the intended patch as a new revision of the freshly returned plan");
    check(!(plan.basket ?? []).some(item => item.productId === product.productId) &&
      (plan.options ?? []).every(option => !(option.basket ?? []).some(item => item.productId === product.productId)),
    "stale recovery preserves the rejected product exclusion in every returned option");
    check(isDeepStrictEqual(plan.medicationCodes, request.medicationCodes), "stale recovery preserves disclosed medications");
    const recoveredRows = [...(plan.coverage ?? []), ...(plan.leftovers ?? [])];
    check(originalTargets.every(target => recoveredRows.some(row => row.name === target.name && (row.requestedAmount ?? row.amount) === target.amount && row.unit === target.unit && row.basis === (target.basis ?? "total_daily"))),
      "stale recovery preserves every original target amount, unit and basis");
    plan = await current(await call("plan", { ...publishedExample(contract, "clear-product-exclusions"), planHandle: plan.planHandle, expectedRevision: plan.revision, idempotencyKey: `docs-clear-${runKey}` }));
    plan = await current(await call("plan", { ...publishedExample(contract, "clear-customer-ceilings"), planHandle: plan.planHandle, expectedRevision: plan.revision, idempotencyKey: `docs-clear-ceilings-${runKey}` }));
    const standardLoss = plan.doseFit.total;
    const expanded = { ...publishedExample(contract, "expand-search"), planHandle: plan.planHandle, expectedRevision: plan.revision, idempotencyKey: `docs-expanded-${runKey}` };
    plan = await current(await call("plan", expanded));
    check(plan.searchSummary?.effort === "expanded" && plan.searchSummary.expansionBudget === 64000 && plan.searchSummary.canExpand === false,
      "expanded search reports its larger finite effort without an ineffective further retry");
    check(plan.doseFit.total <= standardLoss, "expanded search retains or improves the previous dose fit");
    const expandedRetry = await current(await call("plan", expanded));
    check(expandedRetry.revision === plan.revision && isDeepStrictEqual(expandedRetry.options, plan.options), "same-key expanded search retry reuses the evaluated result");
    check(plan.status === "ready", "clearing the rejection restores a ready fixture option");
    const option = plan.options.find(item => item.selected && item.purchaseEligible) ?? plan.options.find(item => item.purchaseEligible && item.basket?.length);
    check(Boolean(option), "expanded search still supplies a current purchase option");
    plan = await current(await call("plan", { operation: "select", planHandle: plan.planHandle, expectedRevision: plan.revision, idempotencyKey: `docs-select-${runKey}`, optionId: option.optionId }));
    check(plan.status === "ready" && plan.operationalDecision.purchaseEligible, "fixture confirms the exact current purchasable revision");
    const execute = { planHandle: plan.planHandle, expectedRevision: plan.revision, idempotencyKey: `docs-execute-${runKey}` };
    const checkout = await call("execute", execute);
    check(checkout.ok && checkout.orderHandle && checkout.checkoutUrl, "checkout returns a durable public receipt");
    checkFrozenMoney(checkout.frozenPlan, "Checkout");
    const retry = await call("execute", execute);
    const repeated = await call("execute", { ...execute, idempotencyKey: `docs-existing-${runKey}` });
    check(checkout.orderHandle === retry.orderHandle && checkout.orderHandle === repeated.orderHandle, "same-key retry and existing-checkout recovery reuse one order");
    const order = await call("order", { orderHandle: checkout.orderHandle });
    check(order.ok, "order tracking reads authoritative payment state");
    checkFrozenMoney(order.frozenOrder, "Tracked order");
    check(order.money.totalPriceMinor === checkout.frozenPlan.totalPriceMinor, "Tracked order money matches the checkout quote");
    receipt = { endpoint: endpoint.href, locale, runKey, plan, checkout, order, confirmation: { fixture: true, selectedOptionId: plan.optionId, revision: plan.revision }, guideSha256: createHash("sha256").update(guide).digest("hex"), schemaChecksum: info.schemaChecksum };
  }
} catch (error) { failure = error instanceof Error ? error.message : String(error); }
await mkdir(output, { recursive: true });
if (receipt) await writeFile(resolve(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
await writeFile(resolve(output, "transcript.json"), `${JSON.stringify(transcript, null, 2)}\n`, { flag: "wx" });
await writeFile(resolve(output, "semantic.json"), `${JSON.stringify(normalizePublishedClientResult({ assertions, transcript, receipt, failure: failure ?? null }, endpoint), null, 2)}\n`, { flag: "wx" });
await writeFile(resolve(output, "normalization.json"), `${JSON.stringify(CLIENT_NORMALIZATION, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ passed: !failure, assertions: assertions.length, output, ...(failure ? { failure } : {}), receipt: receipt ? resolve(output, "receipt.json") : null }));
if (failure) process.exitCode = 1;
