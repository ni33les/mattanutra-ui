import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import Ajv from "ajv";

// Native DEV sign-off only. Installed-host definitions are checked separately.
// No database access, private fixture endpoints, execute, settlement or emails.
const [flag, outputArg, buildFlag, expectedBuild] = process.argv.slice(2);
assert.equal(flag, "--output"); assert.equal(buildFlag, "--build");
assert.match(expectedBuild, /^[a-f0-9]{40}$/);
assert.ok(outputArg?.startsWith("/"));
const output = resolve(outputArg);
assert.ok(relative(process.cwd(), output).startsWith("..") && !existsSync(output));
mkdirSync(output, { recursive: true, mode: 0o700 });
const checks = [], calls = [], runId = randomUUID();
const save = () => writeFileSync(`${output}/results.json`, JSON.stringify({ sourceBuild: expectedBuild, runId, checks,
  passed: checks.length >= 26 && checks.every(row => row.passed), installedConnectorVerified: false }, null, 2), { mode: 0o600 });
const check = (name, fn) => {
  try { fn(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, message: error.message }); }
  save();
};
let lastAt = 0;
async function rpc(method, params) {
  await new Promise(done => setTimeout(done, Math.max(0, 1050 - (Date.now() - lastAt)))); lastAt = Date.now();
  const request = { jsonrpc: "2.0", id: calls.length + 1, method, params };
  const response = await fetch("https://dev.mattanutra.com/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request), signal: AbortSignal.timeout(15000) });
  const raw = await response.text();
  assert.equal(response.status, 200, raw); assert.equal(response.headers.get("x-agentic-build-id"), expectedBuild);
  const body = JSON.parse(raw);
  calls.push({ request, response: body, bytes: Buffer.byteLength(raw) });
  writeFileSync(`${output}/calls.json`, JSON.stringify(calls), { mode: 0o600 });
  assert.ok(body.result, JSON.stringify(body)); return { body, value: body.result.structuredContent ?? body.result, result: body.result };
}
const tool = (name, args) => rpc("tools/call", { name, arguments: args });
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const branches = schema => schema.anyOf ? schema.anyOf.flatMap(branches) : [schema];
let validatePlan;
async function plan(args) {
  assert.ok(validatePlan(args), JSON.stringify(validatePlan.errors));
  return tool("plan", args);
}
async function terminal(first, milliseconds) {
  const start = performance.now(); let current = first;
  while (current.value.status === "processing" && current.value.operationStatus !== "failed" && performance.now() - start < milliseconds) {
    await new Promise(done => setTimeout(done, 1000));
    current = await plan({ operation: "get", planHandle: first.value.planHandle, responseView: "status" });
  }
  return current;
}
try {
  const init = (await rpc("initialize", { protocolVersion: "2025-06-18" })).value;
  const listing = (await rpc("tools/list", {})).value;
  const info = (await tool("info", { locale: "en" })).value;
  const createSchema = JSON.parse((await tool("info", { view: "plan_schema", planOperation: "create" })).value.planSchemaJson);
  const getSchema = JSON.parse((await tool("info", { view: "plan_schema", planOperation: "get" })).value.planSchemaJson);
  const planTool = listing.tools.find(row => row.name === "plan"); assert.ok(planTool);
  validatePlan = new Ajv({ strict: false, validateFormats: false }).compile(planTool.inputSchema);
  const ops = name => branches(planTool.inputSchema).filter(row => row.properties?.operation?.const === name);
  check("native_get_schema_includes_response_view", () => assert.deepEqual(ops("get"), branches(getSchema)));
  check("native_create_defaults_to_conversation", () => {
    assert.deepEqual(ops("create"), [createSchema]); assert.equal(ops("create")[0].properties.responseView.default, "conversation");
  });
  check("native_plan_blurb_mentions_thailand_gaps_and_conversation", () => {
    for (const text of [init.instructions, planTool.description]) { assert.match(text, /Thailand/); assert.match(text, /finite/i); assert.match(text, /checkout.ready/i); }
  });
  check("published_listing_version_matches_info", () => {
    assert.equal(listing.schemaChecksum, info.schemaChecksum); assert.equal(listing.contractVersion, info.contractVersion);
  });
  const guide = await rpc("resources/read", { uri: info.clientGuide });
  check("test_client_guide_uri_matches_contractVersion", () => { assert.ok(info.clientGuide.includes(`/${info.contractVersion}/`)); assert.ok(guide.value.contents.length); });
  check("L1_overview_is_honest_and_advertises_seven_tools", () => {
    assert.deepEqual(listing.tools.map(row => row.name).sort(), ["evidence", "execute", "feedback", "info", "order", "plan", "support"]);
    assert.match(info.clientInstructions, /TH.*only/); assert.match(info.clientInstructions, /finite catalogue/);
    assert.match(info.clientInstructions, /gaps are real/); assert.match(info.clientInstructions, /not targets met or medical approval/);
  });
  check("L2_info_create_schema_defaults_conversation", () => assert.equal(createSchema.properties.responseView.default, "conversation"));
  check("L3_info_get_schema_advertises_all_views", () => assert.deepEqual(branches(getSchema).flatMap(row => row.properties.responseView.enum ?? [row.properties.responseView.const]), ["conversation", "full", "status", "details"]));
  check("test_info_does_not_claim_interaction_coverage", () => assert.match(info.clientInstructions, /accepted inputs.*do not guarantee.*interaction/i));
  const goldens = JSON.parse(readFileSync("test/fixtures/mcp-7-2-3/goldens.json", "utf8"));
  const request = goldens.d3;
  const start = performance.now();
  const created = await plan({ operation: "create", idempotencyKey: `m723-${runId}-d3`, request });
  check("L4_omit_create_defaults_to_conversation", () => assert.equal(created.value.responseView, "conversation"));
  await terminal(created, 15000);
  const conversation = await plan({ operation: "get", planHandle: created.value.planHandle });
  const elapsedMs = performance.now() - start, c = conversation.value;
  check("L5_omit_get_defaults_to_conversation", () => assert.equal(c.responseView, "conversation"));
  check("L7_standard_D3_reaches_terminal_within_15_seconds", () => { assert.ok(["ready", "needs_input"].includes(c.status)); assert.ok(elapsedMs <= 15000, `${elapsedMs}ms`); });
  check("conversation_text_is_a_short_summary", () => {
    assert.equal(conversation.result.content.length, 1); assert.match(conversation.result.content[0].text, /Next:/);
    assert.ok(conversation.result.content[0].text.length < 800); assert.notEqual(conversation.result.content[0].text, JSON.stringify(c)); assert.ok(bytes(c) < 20000); assert.ok(bytes(conversation.body) < 22000);
  });
  const status = await plan({ operation: "get", planHandle: c.planHandle, responseView: "status" });
  const unchanged = await plan({ operation: "get", planHandle: c.planHandle, responseView: "status", knownResultVersion: status.value.resultVersion });
  check("L6_status_known_version_is_a_small_envelope", () => { assert.equal(unchanged.value.unchanged, true); assert.ok(bytes(unchanged.value) < 2000); });
  check("status_body_stays_tiny", () => assert.ok(bytes(unchanged.body) < 2000));
  const full = (await plan({ operation: "get", planHandle: c.planHandle, responseView: "full" })).value;
  const details = (await plan({ operation: "get", planHandle: c.planHandle, responseView: "details", expectedRevision: c.revision, sections: ["advice", "request"] })).value;
  const selected = full.options.find(row => row.optionId === full.optionId); assert.ok(selected?.basket?.length);
  check("conversation_has_at_most_five_advice_rows", () => {
    assert.ok(c.advice.length > 0 && c.advice.length <= 5);
    for (const row of c.options.filter(row => ![c.selectedOptionId, c.highlightedAlternativeOptionId].includes(row.optionId))) assert.deepEqual(row.adviceIds, []);
    assert.deepEqual(details.options.map(row => row.advice), full.options.map(row => row.advice));
  });
  check("incomplete_information_appears_once", () => {
    const rows = c.advice.filter(row => row.kind === "incomplete_information"); assert.equal(rows.length, 1); assert.ok(c.planAdviceIds.includes(rows[0].adviceId));
  });
  check("dose_review_with_no_threshold_is_not_high_severity", () => {
    assert.ok(c.advice.some(row => row.threshold === null), "Unknown reference fixture required");
    assert.ok(!c.advice.some(row => row.threshold === null && row.ruleId?.startsWith("ul:missing:") && row.severity === "high"));
  });
  check("advice_messages_have_no_float_junk", () => { for (const row of c.advice) assert.doesNotMatch(row.message, /\d+\.\d{13,}/); });
  check("d3_2000_selected_is_one_product_and_at_most_two_pills", () => {
    assert.equal(selected.basket.length, 1); assert.equal(selected.basket[0].productName, "Blackmores Vitamin D3 1000 IU");
    assert.equal(selected.basket[0].servingsPerDay, 2); assert.equal(selected.stackSummary.totalDailyPills, 2); assert.equal(selected.doseFit.total, 0);
  });
  check("highlighted_alternative_is_a_different_option", () => {
    assert.ok(c.highlightedAlternativeOptionId && c.highlightedAlternativeOptionId !== c.selectedOptionId);
    assert.ok(c.options.some(row => row.optionId === c.highlightedAlternativeOptionId && row.purchaseEligible && row.coveragePercent > 0));
  });
  const med = await plan({ operation: "create", idempotencyKey: `m723-${runId}-k2-d3`, request: goldens.k2_d3 });
  await terminal(med, 30000);
  const medPlan = (await plan({ operation: "get", planHandle: med.value.planHandle })).value;
  check("lock_AF_apixaban_is_unassessed", () => {
    assert.ok(medPlan.advice?.length);
    const text = medPlan.advice.map(row => row.message).join(" ");
    assert.match(text, /apixaban/); assert.match(text, /atrial_fibrillation/); assert.match(text, /not (?:been )?assessed/);
    assert.ok(medPlan.advice.length <= 5);
  });
  const medFull = (await plan({ operation: "get", planHandle: med.value.planHandle, responseView: "full" })).value;
  check("k2_plus_d3_does_not_require_a_calcium_stack_when_a_simpler_option_exists", () => {
    const simpler = medFull.options.find(row => row.purchaseEligible && row.basket?.length === 1 && row.coverage.some(c => c.name === "Vitamin D3" && c.coveragePercent === 100) && row.coverage.some(c => c.name === "Vitamin K2" && c.remainingGap === 90));
    assert.ok(simpler, "D3-only alternative must exist with K2 90 mcg gap");
    const selected = medFull.options.find(row => row.optionId === medFull.optionId);
    assert.ok(selected.basket.length === 1 || (/1.product/.test(medPlan.summary) && /D3/.test(medPlan.summary) && /K2/.test(medPlan.summary) && /90 mcg/.test(medPlan.summary)));
    assert.equal(medFull.summary, medPlan.summary);
  });
  const expandedRequest = JSON.parse(readFileSync("test/fixtures/ax-refinement/six-profiles.json", "utf8")).find(row => row.id === "A2").request;
  const excluded = "prd_50265f478be551c496f907a01d746dab";
  const expandedStart = performance.now();
  const first = await plan({ operation: "create", searchEffort: "expanded", idempotencyKey: `m723-${runId}-expanded-1`, request: { ...expandedRequest, requirements: { ...expandedRequest.requirements, excludeProductIds: [excluded] } } });
  const second = await plan({ operation: "create", searchEffort: "expanded", idempotencyKey: `m723-${runId}-expanded-2`, request: expandedRequest });
  assert.equal(first.value.status, "processing"); assert.equal(second.value.status, "processing"); assert.notEqual(first.value.planHandle, second.value.planHandle);
  // Sequential HTTP polls keep documented pacing while two independent jobs run.
  let pending = [first, second];
  while (pending.some(row => row.value.status === "processing") && performance.now() - expandedStart < 180000) {
    for (let i = 0; i < pending.length; i++) if (pending[i].value.status === "processing") pending[i] = await plan({ operation: "get", planHandle: pending[i].value.planHandle, responseView: "status" });
  }
  const expanded = [];
  for (const row of pending) expanded.push((await plan({ operation: "get", planHandle: row.value.planHandle, responseView: "full" })).value);
  check("one_expanded_job_finishes_in_three_minutes", () => {
    assert.ok(performance.now() - expandedStart <= 180000);
    for (const value of expanded) { assert.equal(value.ok, true); assert.notEqual(value.status, "processing"); assert.ok(value.searchSummary.expansionAttempts > 8000); assert.equal(value.searchSummary.expansionBudget, 64000); }
  });
  check("a_second_expanded_job_does_not_break_get", () => {
    assert.equal(expanded.length, 2); assert.notEqual(expanded[0].planHandle, expanded[1].planHandle);
    assert.ok(expanded.every(row => row.ok && row.status !== "processing"));
    assert.ok(calls.every(row => !row.response.error));
  });
  const expandedDetails = [];
  for (const value of expanded) expandedDetails.push((await plan({ operation: "get", planHandle: value.planHandle, responseView: "details", expectedRevision: value.revision, sections: ["request", "products"] })).value);
  check("expanded_does_not_relax_vegan_or_algae_rules", () => {
    for (const [i, details] of expandedDetails.entries()) {
      assert.equal(details.originalRequest.requirements.dietaryPreference, "vegan"); assert.equal(details.originalRequest.requirements.omega3SourcePreference, "algae_only");
      assert.ok(details.options.some(row => row.basket.length));
      const exclusions = details.originalRequest.requirements.excludeProductIds ?? [];
      if (i === 0) assert.deepEqual(exclusions, [excluded]);
      for (const row of details.options) assert.ok(row.basket.every(product => !exclusions.includes(product.productId)));
    }
  });
  writeFileSync(`${output}/measurements.json`, JSON.stringify({ elapsedMs, expandedElapsedMs: performance.now() - expandedStart,
    structuredBytes: bytes(c), textBytes: bytes(conversation.result.content), completeBytes: bytes(conversation.body), statusBytes: bytes(unchanged.body),
    selected: { products: selected.basket.map(row => ({ name: row.productName, servingsPerDay: row.servingsPerDay })), stackSummary: selected.stackSummary },
    contractVersion: info.contractVersion, schemaChecksum: info.schemaChecksum, callsSha256: createHash("sha256").update(readFileSync(`${output}/calls.json`)).digest("hex") }, null, 2));
} catch (error) {
  checks.push({ name: "required_live_journey_completed", passed: false, message: error.stack }); save();
}
save(); console.log(JSON.stringify({ checks: checks.length, failures: checks.filter(row => !row.passed), output, installedConnectorVerified: false }));
if (checks.length < 26 || checks.some(row => !row.passed)) process.exitCode = 1;
