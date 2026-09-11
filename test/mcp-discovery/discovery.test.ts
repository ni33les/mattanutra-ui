import { CURRENT_CONTRACT_SCHEMA_CHECKSUM } from "../helpers/current-contract-lock.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { handleLightweightJsonRpc, toolList } from "../../lib/agentic/mcp/rpc.ts";
import { AGENTIC_CONTRACT_VERSION, loadAgenticConfig, type AgenticEnvironment } from "../../lib/agentic/config.ts";
import { computeSchemaChecksum } from "../../lib/agentic/release-manifest.ts";
import { testSourceHygiene } from "../../scripts/test-execution-proof.mjs";
import { validateInstalledConnectorProjection } from "../../scripts/validate-installed-connector-projection.mjs";

const names = ["info", "plan", "execute", "order", "support", "feedback"];
const locales = ["en", "th", "zh-CN"];
const environments: AgenticEnvironment[] = ["dev", "uat", "prd"];
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const golden = (locale = "en") => read(`test/mcp-discovery/goldens/${locale}.json`);
const fixture = { conditionCodes: ["atrial_fibrillation"], medicationCodes: ["apixaban"], supportedCountries: [{ countryCode: "TH", countryName: "Thailand", currency: "THB" }] };
const adapter = () => read("lib/agentic/adapters/openai.json");
const captured = process.env.MCP_DISCOVERY_CAPTURE ? read(process.env.MCP_DISCOVERY_CAPTURE) : null;
async function call(method: string, args: Record<string, unknown> = {}, environment: AgenticEnvironment = "dev", locale = "en") {
  const key = `${environment}:${locale}:${method}:${args.view ?? "overview"}`;
  if (captured?.responses?.[key]) return captured.responses[key];
  const result = await handleLightweightJsonRpc({ ...loadAgenticConfig(), environment }, {
    jsonrpc: "2.0", id: 1, method, params: method === "tools/call" ? { name: "info", arguments: { locale, ...args } } : { locale, protocolVersion: "2025-06-18" }
  }, fixture);
  assert.ok(result?.result, `Missing ${key}`);
  return method === "tools/call" ? result.result.structuredContent as Record<string, unknown> : result.result;
}
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const operationalRules = [/finite/, /THB/, /flat targets/, /unknown.*zero/, /same key/, /exclusions/, /checkout.ready/];
function noGuarantees(value: unknown) {
  assert.doesNotMatch(JSON.stringify(value), /(?:guarantees?|always achieves?) (?:the )?(?:lowest|fewest|complete coverage|medical suitability)/i);
}

test("DISC-PRE-01 generated connector displays MattaNutra", () => { assert.equal(adapter().name, "MattaNutra"); });
test("DISC-PRE-02 generated connector short description is the approved proposition", () => { assert.equal(adapter().shortDescription, golden().shortDescription); });
test("DISC-PRE-03 generated long description includes all routing and balancing dimensions", () => {
  assert.equal(adapter().longDescription, golden().longDescription);
  for (const term of [/Thailand/, /real products/, /purchasable/, /refine/, /coverage/, /overlap/, /current stock/, /pill burden/, /cost/, /not diagnosis/]) assert.match(adapter().longDescription, term);
});
test("DISC-PRE-04 published connector contains country exclusion and environment warnings", () => {
  assert.equal(adapter().unsupportedUseGuidance, golden().unsupportedUseGuidance);
  for (const environment of environments) assert.equal(adapter().environments?.[environment]?.warning, golden().environmentWarnings[environment]);
});
test("DISC-PRE-05 connector positioning makes no optimality or medical guarantees", () => { assert.ok(adapter().description); noGuarantees(adapter()); });
test("DISC-MCP-01 initialize begins with approved invocation paragraph", async () => {
  const result = await call("initialize"); assert.equal(String(result.instructions).split("\n")[0], golden().initialization);
  assert.equal((result.serverInfo as { name: string }).name, "mattanutra_dev"); assert.equal((result.serverInfo as { title?: string }).title, "MattaNutra");
});
test("DISC-MCP-02 initialize preserves service and operational boundaries", async () => {
  const text = String((await call("initialize")).instructions);
  for (const term of [/Thailand/, /real products/, /refine/, /coverage/, /overlap/, /current stock/, /pill burden/, /cost/, /not diagnosis/, ...operationalRules]) assert.match(text, term);
});
test("DISC-MCP-03 native six-tool order is unchanged", async () => { const result = await call("tools/list"); assert.deepEqual((result.tools as {name:string}[]).map(tool => tool.name), names); });
test("DISC-MCP-04 every native tool has the approved title", async () => { const result = await call("tools/list"); for (const tool of result.tools as {name:string;title?:string}[]) assert.equal(tool.title, golden().titles[tool.name]); });
test("DISC-MCP-05 descriptions lead with purpose and keep operation instructions", async () => {
  const result = await call("tools/list"); const tools = result.tools as {name:string;description:string}[];
  for (const tool of tools) assert.ok(tool.description.startsWith(golden().purposes[tool.name]), tool.name);
  const plan = tools.find(tool => tool.name === "plan")!; assert.ok(plan); for (const term of [/planHandle/, /response|conversation/, /same key/, /not medical clearance/, /exclusions/, /expectedRevision|current revision|revision/]) assert.match(plan.description, term);
  assert.match(tools.find(tool => tool.name === "execute")!.description, /confirm/i);
  assert.match(tools.find(tool => tool.name === "feedback")!.description, /consentConfirmed=true/);
});
test("DISC-MCP-06 info uses the exact approved English description", async () => { const info = await call("tools/call"); assert.equal(info.serviceName, "MattaNutra"); assert.equal(info.description, golden().infoDescription); });
test("DISC-MCP-07 existing info identity and capability fields remain intact", async () => {
  const info = await call("tools/call"); assert.equal(info.contractVersion, AGENTIC_CONTRACT_VERSION); assert.equal(info.schemaChecksum, CURRENT_CONTRACT_SCHEMA_CHECKSUM);
  for (const key of ["buildId", "valuePropositionId", "wellnessBoundary", "responsibilityVersion", "researchVersion"]) assert.ok(info[key]);
  assert.deepEqual(info.supportedLocales, locales); assert.deepEqual((info.supportedCountries as {countryCode:string}[]).map(row => row.countryCode), ["TH"]);
});
test("DISC-MCP-08 environment warning follows the purpose in initialization and info", async () => {
  for (const environment of environments) { const init = String((await call("initialize", {}, environment)).instructions), info = String((await call("tools/call", {}, environment)).clientInstructions), warning = golden().environmentWarnings[environment];
    for (const text of [init, info]) { if (warning) assert.ok(text.indexOf(warning) > 0, environment); else for (const other of ["dev", "uat"]) assert.ok(!text.includes(golden().environmentWarnings[other])); }
  }
});
test("DISC-MCP-09 client guide starts with invocation and retains the existing workflow", async () => {
  const text = String((await call("tools/call", {view:"client_guide"})).clientGuideText);
  assert.equal(text.split("\n\n")[1], golden().initialization);
  for (const term of [/scoring/, /idempotency/, /checkout/, /planHandle/, /unknown/i]) assert.match(text, term);
});
test("DISC-MCP-10 complete tool input and output schemas match the reviewed active contract", () => {
  assert.equal(computeSchemaChecksum(), CURRENT_CONTRACT_SCHEMA_CHECKSUM);
  const snapshot = read(`contract/mcp/${AGENTIC_CONTRACT_VERSION}/schema.json`); for (const tool of toolList()) assert.deepEqual({inputSchema:tool.inputSchema,outputSchema:tool.outputSchema}, snapshot.tools[tool.name]);
});
test("DISC-I18N-01 info description matches the requested approved locale", async () => { for (const locale of locales) assert.equal((await call("tools/call", {}, "dev", locale)).description, golden(locale).infoDescription); });
test("DISC-I18N-02 generated locale positioning preserves reviewed invocation and boundaries", () => {
  const published = adapter(); for (const locale of locales) { const copy = published.locales?.[locale]; assert.ok(copy, locale); assert.deepEqual(copy, golden(locale)); }
});
test("DISC-I18N-03 localized titles and purpose retain native names and wire contracts", async () => {
  for (const locale of locales) { const result = await call("tools/list", {}, "dev", locale); const tools = result.tools as {name:string;title:string;description:string;inputSchema:unknown}[];
    assert.deepEqual(tools.map(tool => tool.name), names); for (const tool of tools) { assert.equal(tool.title, golden(locale).titles[tool.name]); assert.ok(tool.description.startsWith(golden(locale).purposes[tool.name])); assert.deepEqual(tool.inputSchema, toolList().find(row => row.name === tool.name)!.inputSchema); }
  }
});
test("DISC-I18N-04 independently versioned locale goldens have a semantic review record", () => {
  const review = read("test/mcp-discovery/goldens/review.json"); assert.deepEqual(review.locales, locales); assert.ok(review.reviewer && review.reviewMethod && review.checks.length >= 8);
  for (const locale of locales) { const copy=golden(locale); assert.ok(copy.initialization && copy.unsupportedUseGuidance && copy.infoDescription); assert.deepEqual(Object.keys(copy.titles), names); }
});
test("DISC-DET-01 independent initializations have identical canonical metadata", async () => { assert.deepEqual(await call("initialize"), await call("initialize")); });
test("DISC-DET-02 tools list order copy schemas and annotations are deterministic", async () => { assert.deepEqual(await call("tools/list"), await call("tools/list")); });
test("DISC-DET-03 info capabilities and positioning are deterministic per locale", async () => { for (const locale of locales) assert.deepEqual(await call("tools/call", {}, "dev", locale), await call("tools/call", {}, "dev", locale)); });
test("DISC-DET-04 generated manifests bind the versioned positioning content", () => {
  const published = adapter(); assert.ok(existsSync("lib/agentic/discovery/positioning.ts")); assert.match(published.positioningChecksum, /^[a-f0-9]{64}$/);
  assert.equal(published.positioningChecksum, sha(published.locales)); assert.match(published.discoveryVersion, /single-recommendation/);
  for (const provider of ["anthropic", "xai"]) assert.deepEqual(read(`lib/agentic/adapters/${provider}.json`), published);
});
test("DISC-DET-05 package tests have no skipped focused or empty cases", () => {
  const file="test/mcp-discovery/discovery.test.ts", source=readFileSync(file,"utf8"); assert.deepEqual(testSourceHygiene(source,file), []);
  const ids=[...source.matchAll(/test\("(DISC-[A-Z0-9]+-\d+)/g)].map(row=>row[1]); assert.equal(ids.length,29); assert.equal(new Set(ids).size,29);
});
test("DISC-TRUTH-01 positioning promises balancing rather than guaranteed optimality", () => { noGuarantees(adapter()); assert.match(adapter().shortDescription ?? "", /balanc/i); });
test("DISC-TRUTH-02 ready and purchase eligibility never mean medical approval", async () => { const info=await call("tools/call"); assert.match(String(info.clientInstructions), /checkout-ready, not targets met or medical approval/); });
test("DISC-TRUTH-03 accepted medication codes are not claimed as assessed interactions", async () => { const info=await call("tools/call"); const text=String(info.clientInstructions); assert.match(text,/Medication\/condition codes are accepted inputs, not interaction coverage/); assert.match(text,/only quantified exposure above MattaNutra recommended limits/); assert.match(text,/Absence of advice is not medical clearance/); });
test("DISC-TRUTH-04 published market stays Thailand and catalogue gaps remain visible", async () => { const info=await call("tools/call"); assert.deepEqual((info.supportedCountries as {countryCode:string}[]).map(row=>row.countryCode),["TH"]); assert.match(String(info.clientInstructions),/finite catalogue/); assert.match(String(info.clientInstructions),/real gaps/); });
test("DISC-TRUTH-05 installed verification rejects missing titles and stale positioning", () => {
  const published={contractVersion:"9.0.0",schemaChecksum:computeSchemaChecksum(),tools:toolList(),connector:adapter()};
  const evidence={...structuredClone(published),source:"installed_connector",connectorId:"dev-live-export",environment:"dev",observedAt:"2026-09-09T00:00:00Z"};
  assert.equal(validateInstalledConnectorProjection(evidence,published).passed,true);
  const stale=structuredClone(evidence); delete (stale.tools[0] as {title?:string}).title;
  assert.equal(validateInstalledConnectorProjection(stale,published).passed,false);
  const wrong=structuredClone(evidence); wrong.connector={...wrong.connector,name:"mattanutra_uat"}; assert.equal(validateInstalledConnectorProjection(wrong,published).passed,false);
});
