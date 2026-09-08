import assert from "node:assert/strict";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import Ajv from "ajv";

const [outputFlag, directory, buildFlag, expectedBuild] = process.argv.slice(2);
assert.equal(outputFlag, "--output"); assert.equal(buildFlag, "--build"); assert.match(expectedBuild, /^[a-f0-9]{40}$/);
const output = resolve(directory); assert.ok(directory.startsWith("/") && relative(process.cwd(), output).startsWith("..") && !existsSync(output));
mkdirSync(output, { recursive: true, mode: 0o700 });
const calls = [], checks = [], save = (file, value) => writeFileSync(`${output}/${file}`, JSON.stringify(value, null, 2), { mode: 0o600 });
let previous = 0;
async function rpc(method, params) {
  await new Promise(done => setTimeout(done, Math.max(0, 1050 - (Date.now() - previous)))); previous = Date.now();
  const request = { jsonrpc: "2.0", id: calls.length + 1, method, params };
  const response = await fetch("https://dev.mattanutra.com/api/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(15000) });
  const body = await response.json(); calls.push({ request, response: body }); save("calls.json", calls);
  assert.equal(response.status, 200); assert.equal(response.headers.get("x-agentic-build-id"), expectedBuild); assert.ok(body.result, JSON.stringify(body));
  return body.result.structuredContent ?? body.result;
}
const tool = (name, args) => rpc("tools/call", { name, arguments: args });
const leaves = schema => schema.anyOf ? schema.anyOf.flatMap(leaves) : [schema];
function check(name, run) { run(); checks.push(name); }
try {
  const listing = await rpc("tools/list", {}); save("tools-list.json", { result: listing });
  const plan = listing.tools.find(row => row.name === "plan"); assert.ok(plan);
  save("plan-tool.json", plan);
  const ops = name => leaves(plan.inputSchema).filter(row => row.properties?.operation?.const === name);
  check("hosted_get_schema_includes_response_view", () => {
    const visible = plan.inputSchema.anyOf.find(row => row.properties?.operation?.const === "get");
    assert.ok(visible); assert.deepEqual(visible.properties.responseView.enum, ["conversation", "full", "status", "details"]);
    assert.ok(visible.properties.knownResultVersion && visible.properties.expectedRevision && visible.properties.sections);
    const get = ops("get");
    assert.deepEqual(get.flatMap(row => row.properties.responseView.enum ?? [row.properties.responseView.const]), ["conversation", "full", "status", "details"]);
    assert.ok(get.find(row => row.properties.responseView.const === "status").properties.knownResultVersion);
    const details = get.find(row => row.properties.responseView.const === "details"); assert.ok(details.required.includes("expectedRevision") && details.required.includes("sections"));
  });
  check("hosted_create_defaults_to_conversation", () => assert.equal(ops("create")[0].properties.responseView.default, "conversation"));
  check("hosted_plan_blurb_mentions_thailand_gaps_and_conversation", () => {
    assert.match(plan.description, /TH|Thailand/); assert.match(plan.description, /finite catalogue/); assert.match(plan.description, /conversation/); assert.match(plan.description, /gaps/); assert.equal(plan.description.split("\n").length, 8);
  });
  // Client phase: compile only tools/list. No info, resources or application imports.
  const validate = new Ajv({ strict: false, validateFormats: false }).compile(plan.inputSchema);
  const callPlan = args => { assert.ok(validate(args), JSON.stringify(validate.errors)); return tool("plan", args); };
  const start = performance.now();
  const created = await callPlan({ operation: "create", idempotencyKey: `tool-card-${randomUUID()}`, searchEffort: "standard", request: {
    locale: "en", destinationCountry: "TH", optimization: "lowest_cost", profile: {}, requirements: {},
    intake: [{ source: "diet", certainty: "unknown", description: "Dietary quantities are unknown." }],
    targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU", basis: "total_daily" }]
  } });
  assert.equal(created.responseView, "conversation");
  let state = created;
  while (state.status === "processing" && performance.now() - start < 15000) {
    await new Promise(done => setTimeout(done, Math.max(1000, (state.pollAfterSeconds ?? 3) * 1000)));
    state = await callPlan({ operation: "get", planHandle: created.planHandle, responseView: "status", ...(state.resultVersion ? { knownResultVersion: state.resultVersion } : {}) });
  }
  const conversation = await callPlan({ operation: "get", planHandle: created.planHandle });
  check("tools_list_only_client_creates_polls_and_reads_conversation", () => {
    assert.ok(["ready", "needs_input"].includes(conversation.status)); assert.equal(conversation.responseView, "conversation");
    assert.ok(performance.now() - start < 15000); assert.ok(calls.every(row => row.request.params?.name !== "info"));
  });
  save("tools-only-client.json", { passed: true, elapsedMs: performance.now() - start, calls: [...calls] });
  // Separate publication audit after the tools-only client has completed.
  const schemas = [];
  for (const planOperation of ["create", "get", "revise", "answer", "select"]) {
    const info = await tool("info", { locale: "en", view: "plan_schema", planOperation });
    assert.equal(info.contractVersion, listing.contractVersion); assert.equal(info.schemaChecksum, listing.schemaChecksum);
    const schema = JSON.parse(info.planSchemaJson); schemas.push(schema); save(`info-${planOperation}.json`, info);
  }
  check("every_published_operation_is_exactly_the_info_schema", () => assert.deepEqual(plan.inputSchema, { type: "object", anyOf: schemas }));
  const overview = await tool("info", { locale: "en" });
  check("public_plan_card_is_the_shared_overview", () => assert.ok(overview.clientInstructions.endsWith(plan.description)));
  const report = { passed: true, sourceBuild: expectedBuild, contractVersion: listing.contractVersion, schemaChecksum: listing.schemaChecksum, checks,
    inputSchemaSha256: createHash("sha256").update(JSON.stringify(plan.inputSchema)).digest("hex"),
    inspected: { createResponseView: ops("create")[0].properties.responseView, getVariants: ops("get").map(row => ({ fields: Object.keys(row.properties), required: row.required, responseView: row.properties.responseView })), description: plan.description },
    installedConnectorCacheVerified: false };
  save("results.json", report); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  save("failure.json", { passed: false, checks, message: error.stack }); throw error;
}
