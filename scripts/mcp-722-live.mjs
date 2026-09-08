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
  passed: checks.length >= 25 && checks.every(row => row.passed), installedConnectorVerified: false }, null, 2), { mode: 0o600 });
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
  check("test_hosted_plan_get_schema_advertises_response_view", () => assert.deepEqual(ops("get"), branches(getSchema)));
  check("test_hosted_plan_create_schema_defaults_conversation", () => {
    assert.deepEqual(ops("create"), [createSchema]); assert.equal(ops("create")[0].properties.responseView.default, "conversation");
  });
  check("test_hosted_plan_description_advertises_service", () => {
    for (const text of [init.instructions, planTool.description]) { assert.match(text, /Thailand/); assert.match(text, /finite/i); assert.match(text, /checkout.ready/i); }
  });
  check("test_tools_list_schema_checksum_matches_info", () => {
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
  const request = { locale: "en", destinationCountry: "TH", optimization: "lowest_cost", profile: {}, requirements: {}, currentSupplements: [],
    targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU", basis: "total_daily" }] };
  const start = performance.now();
  const created = await plan({ operation: "create", idempotencyKey: `m722-${runId}-d3`, request });
  check("L4_omit_create_defaults_to_conversation", () => assert.equal(created.value.responseView, "conversation"));
  await terminal(created, 15000);
  const conversation = await plan({ operation: "get", planHandle: created.value.planHandle });
  const elapsedMs = performance.now() - start, c = conversation.value;
  check("L5_omit_get_defaults_to_conversation", () => assert.equal(c.responseView, "conversation"));
  check("L7_standard_D3_reaches_terminal_within_15_seconds", () => { assert.ok(["ready", "needs_input"].includes(c.status)); assert.ok(elapsedMs <= 15000, `${elapsedMs}ms`); });
  check("test_conversation_text_is_not_a_json_clone", () => {
    assert.equal(conversation.result.content.length, 1); assert.match(conversation.result.content[0].text, /Next:/);
    assert.notEqual(conversation.result.content[0].text, JSON.stringify(c)); assert.ok(bytes(c) < 20000); assert.ok(bytes(conversation.body) < 22000);
  });
  const status = await plan({ operation: "get", planHandle: c.planHandle, responseView: "status" });
  const unchanged = await plan({ operation: "get", planHandle: c.planHandle, responseView: "status", knownResultVersion: status.value.resultVersion });
  check("L6_status_known_version_is_a_small_envelope", () => { assert.equal(unchanged.value.unchanged, true); assert.ok(bytes(unchanged.value) < 2000); });
  check("test_status_payload_under_2kb", () => assert.ok(bytes(unchanged.body) < 2000));
  const full = (await plan({ operation: "get", planHandle: c.planHandle, responseView: "full" })).value;
  const details = (await plan({ operation: "get", planHandle: c.planHandle, responseView: "details", expectedRevision: c.revision, sections: ["advice", "request"] })).value;
  const selected = full.options.find(row => row.optionId === full.optionId); assert.ok(selected?.basket?.length);
  check("test_conversation_advice_capped_to_selected_and_highlighted", () => {
    assert.ok(c.advice.length > 0 && c.advice.length <= 5);
    for (const row of c.options.filter(row => ![c.selectedOptionId, c.highlightedAlternativeOptionId].includes(row.optionId))) assert.deepEqual(row.adviceIds, []);
    assert.deepEqual(details.options.map(row => row.advice), full.options.map(row => row.advice));
  });
  check("test_incomplete_information_is_plan_level_once", () => {
    const rows = c.advice.filter(row => row.kind === "incomplete_information"); assert.equal(rows.length, 1); assert.ok(c.planAdviceIds.includes(rows[0].adviceId));
  });
  check("test_dose_review_without_threshold_is_not_high_severity", () => {
    assert.ok(c.advice.some(row => row.threshold === null), "Unknown reference fixture required");
    assert.ok(!c.advice.some(row => row.threshold === null && row.ruleId?.startsWith("ul:missing:") && row.severity === "high"));
  });
  check("test_no_float_junk_in_messages", () => { for (const row of c.advice) assert.doesNotMatch(row.message, /\d+\.\d{13,}/); });
  check("test_d3_2000_does_not_select_ten_caps_of_an_incidental", () => {
    assert.equal(selected.basket.length, 1); assert.equal(selected.basket[0].productName, "Blackmores Vitamin D3 1000 IU");
    assert.equal(selected.basket[0].servingsPerDay, 2); assert.equal(selected.stackSummary.totalDailyPills, 2); assert.equal(selected.doseFit.total, 0);
  });
  check("test_highlighted_alternative_present_when_alternativeSearch_found", () => {
    assert.ok(c.highlightedAlternativeOptionId && c.highlightedAlternativeOptionId !== c.selectedOptionId);
    assert.ok(c.options.some(row => row.optionId === c.highlightedAlternativeOptionId && row.purchaseEligible && row.coveragePercent > 0));
  });
  const med = await plan({ operation: "create", idempotencyKey: `m722-${runId}-med`, request: { ...request,
    profile: { ageYears: 60, sex: "female", lifeStage: "adult" }, medicationCodes: ["eliquis"], conditionCodes: ["atrial_fibrillation"],
    targets: [{ name: "Vitamin K2", amount: 100, unit: "mcg", basis: "supplemental" }] } });
  await terminal(med, 30000);
  const medPlan = (await plan({ operation: "get", planHandle: med.value.planHandle })).value;
  check("test_listed_medication_without_row_is_unassessed_not_cleared", () => {
    assert.ok(medPlan.advice?.length);
    assert.ok(medPlan.advice.some(row => row.kind === "interaction") || medPlan.advice.some(row => row.uncertaintyCodes?.includes("medication_unassessed:apixaban") && /apixaban/i.test(row.message)));
  });
  const expandedRequest = JSON.parse(readFileSync("test/fixtures/ax-refinement/six-profiles.json", "utf8")).find(row => row.id === "A2").request;
  const excluded = "prd_50265f478be551c496f907a01d746dab";
  const base = await plan({ operation: "create", idempotencyKey: `m722-${runId}-a2`, request: expandedRequest });
  await terminal(base, 30000);
  const committed = (await plan({ operation: "get", planHandle: base.value.planHandle })).value;
  assert.equal(committed.ok, true); assert.notEqual(committed.status, "processing");
  const expandedStart = performance.now();
  const revised = await plan({ operation: "revise", planHandle: committed.planHandle, expectedRevision: committed.revision, idempotencyKey: `m722-${runId}-expanded`,
    searchEffort: "expanded", requestPatch: { requirements: { excludeProductIds: [excluded] } } });
  const second = await plan({ operation: "revise", planHandle: committed.planHandle, expectedRevision: committed.revision, idempotencyKey: `m722-${runId}-competing`,
    searchEffort: "expanded", requestPatch: { requirements: { excludeProductIds: [] } } });
  check("test_second_expanded_while_processing_is_rejected_or_coalesced", () => {
    assert.equal(revised.value.status, "processing", "Concurrency must be exercised while work is active");
    assert.equal(second.value.ok, false); assert.equal(second.value.error.reasonCode, "stale_revision");
  });
  await terminal(revised, 180000 - (performance.now() - expandedStart));
  const expanded = (await plan({ operation: "get", planHandle: committed.planHandle, responseView: "full" })).value;
  check("test_expanded_single_job_reaches_terminal_state", () => {
    assert.ok(performance.now() - expandedStart <= 180000); assert.equal(expanded.ok, true); assert.notEqual(expanded.status, "processing");
    assert.ok(expanded.searchSummary.expansionAttempts > 8000); assert.equal(expanded.searchSummary.expansionBudget, 64000);
  });
  const expandedDetails = (await plan({ operation: "get", planHandle: committed.planHandle, responseView: "details", expectedRevision: expanded.revision, sections: ["request", "products"] })).value;
  check("test_expanded_does_not_relax_constraints", () => {
    assert.equal(expandedDetails.originalRequest.requirements.dietaryPreference, "vegan");
    assert.equal(expandedDetails.originalRequest.requirements.omega3SourcePreference, "algae_only");
    assert.deepEqual(expandedDetails.originalRequest.requirements.excludeProductIds, [excluded]);
    assert.ok(expanded.options.some(row => row.basket.length));
    for (const row of expanded.options) assert.ok(row.basket.every(product => product.productId !== excluded));
  });
  writeFileSync(`${output}/measurements.json`, JSON.stringify({ elapsedMs, expandedElapsedMs: performance.now() - expandedStart,
    structuredBytes: bytes(c), textBytes: bytes(conversation.result.content), completeBytes: bytes(conversation.body), statusBytes: bytes(unchanged.body),
    selected: { products: selected.basket.map(row => ({ name: row.productName, servingsPerDay: row.servingsPerDay })), stackSummary: selected.stackSummary },
    contractVersion: info.contractVersion, schemaChecksum: info.schemaChecksum, callsSha256: createHash("sha256").update(readFileSync(`${output}/calls.json`)).digest("hex") }, null, 2));
} catch (error) {
  checks.push({ name: "required_live_journey_completed", passed: false, message: error.stack }); save();
}
save(); console.log(JSON.stringify({ checks: checks.length, failures: checks.filter(row => !row.passed), output, installedConnectorVerified: false }));
if (checks.length < 25 || checks.some(row => !row.passed)) process.exitCode = 1;
