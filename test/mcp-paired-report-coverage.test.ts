import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { it } from "node:test";

it("MCP-REPORT-01 every maintained domain pack and current public client participate in the paired report", () => {
  const report = readFileSync("scripts/mcp-matcher-pack-report.mjs", "utf8");
  const discovered = readdirSync("test").filter(file => /^agentic-.*-pack\.test\.ts$/.test(file)).flatMap(file => {
    const source = readFileSync(`test/${file}`, "utf8");
    return [...source.matchAll(/export async function (run\w+Pack)\(/g)].map(match => ({ file, run: match[1] }));
  });
  assert.ok(discovered.length >= 7, "Independent matching, commercial and value packs remain maintained");
  assert.match(report, /await runCurrentProtocolPack\(\)/);
  assert.doesNotMatch(report, /runAe(?:C[2-8])?Pack/);
  for (const pack of discovered) {
    assert.ok(report.includes(`../test/${pack.file}`), `${pack.file} is missing from the paired report`);
    assert.match(report, new RegExp(`await ${pack.run}\\(`), `${pack.run} must execute in each report run`);
  }
});

it("MCP-REPORT-02 persisted R4 evidence rejects missing packs and same-pass business drift", () => {
  const env = { ...process.env, AGENTIC_BUILD_ID: "a".repeat(40) };
  delete env.NODE_TEST_CONTEXT;
  const source = `
    import assert from "node:assert/strict";
    import { canonicalPack, sectionTotals, snapshotFromRun } from "./scripts/mcp-matcher-pack-report.mjs";
    const business = { coverage: [{ requestedAmount: 300, currentAmount: 300, deliveredAmount: 0, remainingGap: 0, unit: "mg" }],
      basket: [{ productId: "unchanged-product", servingsPerDay: 1, unitPriceMinor: 1900 }],
      advice: [{ message: "Current stock duration and future cash are unknown.", threshold: 350 }],
      cash90DayMinor: null, revision: 2 };
    const item = { id: "R4-DUR-03", result: "PASS", evidence: {
      assertions: [{ id: "DUR-03.narrative", pass: true }], acceptance: { response: business },
      freshKeyHash: "same-historical-hash", requestHash: "same-request-hash",
      mcpTranscript: { version: 1, calls: [{ request: { operation: "revise" }, response: business, state: "completed" }] }
    } };
    const section = { cases: [item], passedCases: 1, totalCases: 1, contractVersion: "5.0.0", snapshotId: "fixed-catalogue" };
    const labels = ["contract", "commercial", "valueRemediation", "valueImplementation", "valueR2", "valueR3", "valueR4"];
    const run = Object.fromEntries(labels.map(label => [label, structuredClone(section)]));
    run.matcher = { catalog: { catalogueVersion: "captured", productCount: 1, supplementCount: 1 },
      cases: ["matching.official_5_fewest_pills", "safety.mag_ul_and_ckd", "efficiency.structural"].map(id => ({id,coverage:[],leftovers:[],names:[],candidateKey:null,safety:[],skus:[]})),
      scores: { matching: 10, safety: 10, efficiency: 10 }, mcpTranscript: structuredClone(item.evidence.mcpTranscript) };
    const encoded = canonicalPack(run);
    assert.deepEqual(JSON.parse(encoded).valueR4.cases[0].evidence.acceptance.response, business, "Passing R4 business evidence must persist in canonical artifacts");
    assert.deepEqual(snapshotFromRun(run).valueR4, { "R4-DUR-03": "PASS" });
    assert.equal(sectionTotals(run).packPass, true);
    assert.deepEqual(snapshotFromRun(run).matcher, {"matching.official_5_fewest_pills":"PASS","safety.mag_ul_and_ckd":"PASS","efficiency.structural":"PASS"});
    assert.equal(sectionTotals(run).matcher.text,"3/3");
    for(const bad of [{matching:8,safety:10,efficiency:10},{matching:10,safety:8,efficiency:10},{matching:10,safety:10,efficiency:8}]){
      assert.equal(sectionTotals({...run,matcher:{...run.matcher,scores:bad}}).packPass,false,"The score bar remains enforced");
    }
    assert.equal(sectionTotals({...run,matcher:{...run.matcher,cases:[]}}).packPass,false,"An empty matcher report never passes");
    const missing = { ...run }; delete missing.valueR4;
    assert.throws(() => canonicalPack(missing), /valueR4.*evidence is missing/);
    const missingTranscript = structuredClone(run); delete missingTranscript.valueR4.cases[0].evidence.mcpTranscript;
    assert.throws(() => canonicalPack(missingTranscript), /valueR4.*evidence is missing/);
    for (const change of [
      { cash90DayMinor: 0 }, { coverage: [{ ...business.coverage[0], currentAmount: 299, remainingGap: 1 }] },
      { basket: [{ ...business.basket[0], servingsPerDay: 2 }] }, { basket: [{ ...business.basket[0], unitPriceMinor: 1901 }] },
      { advice: [] }, { revision: 3 }
    ]) {
      const changed = structuredClone(run);
      changed.valueR4.cases[0].evidence.acceptance.response = { ...business, ...change };
      assert.notEqual(canonicalPack(changed), encoded, "Equal PASS flags and old hashes cannot hide R4 business changes");
    }
    const failed = structuredClone(run); failed.valueR4.passedCases = 0; failed.valueR4.cases[0].result = "FAIL";
    assert.equal(sectionTotals(failed).packPass, false, "An R4 failure must fail the whole paired pack");
    console.log("R4 report proof passed");
  `;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "--input-type=module"],
    { input: source, env, encoding: "utf8", timeout: 20000 });
  assert.equal(child.status, 0, `${child.error ?? ""}\n${child.stderr}\n${child.stdout}`);
  assert.equal(child.stdout.trim(), "R4 report proof passed", "Importing pack functions must not launch their Node suites outside the test runner");
});

function standaloneFixtureProbe(source: string, timeout = 20000, withoutDatabase = false) {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  if (withoutDatabase) for (const key of ["DB_URL", "DB_WORKER_URL", "TEST_DB_URL"]) env[key] = "";
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "--input-type=module"],
    { input: source, env, encoding: "utf8", timeout, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(child.status, 0, `${child.error ?? ""}\n${child.stderr}\n${child.stdout}`);
}

it("MCP-REPORT-03 standalone dose checks use the same captured catalogue and references as Node tests", () => {
  standaloneFixtureProbe(`
    import assert from "node:assert/strict";
    import {capturedMatcherCatalogue} from "./test/helpers/captured-matcher-catalogue.ts";
    import {loadDetCatalog} from "./test/agentic-det-pack.test.ts";
    import {matcherSafetyReferenceIdentity} from "./lib/matcher/safety-ceilings.ts";
    const expected=capturedMatcherCatalogue(),actual=await loadDetCatalog();
    assert.equal(actual.snapshot.catalogueVersion,expected.snapshot.catalogueVersion,"A command must not silently switch this fixed arithmetic corpus to its database catalogue");
    assert.deepEqual(actual.snapshot,expected.snapshot);assert.deepEqual(actual.ceilings,expected.references.ceilings);
    assert.deepEqual(matcherSafetyReferenceIdentity(),{runtimeRevision:expected.references.runtimeRevision,fingerprint:expected.references.fingerprint});
  `, 20000, true);
});

it("MCP-REPORT-04 a frozen remediation pack retains its complete reference identity after global reset", () => {
  standaloneFixtureProbe(`
    import assert from "node:assert/strict";
    import {capturedMatcherCatalogue} from "./test/helpers/captured-matcher-catalogue.ts";
    import {runCvFixPack} from "./test/agentic-cv-fix-pack.test.ts";
    import {resetMatcherSafetyCeilings,setMatcherSafetyCeilings} from "./lib/matcher/safety-ceilings.ts";
    import {candidateSetHash,valueCatalogueFingerprint} from "./lib/agentic/value/fingerprint.ts";
    import {loadAgenticConfig} from "./lib/agentic/config.ts";
    import {closeSqlPool} from "./lib/db.ts";
    const {snapshot,references}=capturedMatcherCatalogue();
    const frozenReferences={version:1,ceilings:references.ceilings,identity:{runtimeRevision:references.runtimeRevision,fingerprint:references.fingerprint},unavailable:false};
    const freeze={buildId:loadAgenticConfig().buildId,candidateSetHash:candidateSetHash(snapshot.products.map(p=>p.productId)),
      catalogueVersion:snapshot.catalogueVersion,countryCode:"TH",currency:"THB",fingerprint:valueCatalogueFingerprint(snapshot,references.ceilings),
      productCount:snapshot.products.length,retailerId:"retailer_th_delight",snapshot,supplementCount:snapshot.supplements.length};
    resetMatcherSafetyCeilings();setMatcherSafetyCeilings(references.ceilings);
    try {const report=await runCvFixPack(freeze,frozenReferences);
      assert.equal(report.passedCases,9,JSON.stringify(report.cases.filter(c=>c.result!=="PASS").map(c=>({id:c.id,failed:c.evidence.failed,status:c.evidence.status,error:c.evidence.error}))));
      assert.equal(report.totalCases,9);assert.equal(report.cases.length,9);
    } finally {await closeSqlPool();resetMatcherSafetyCeilings();}
  `, 180000);
});

it("MCP-REPORT-05 standalone documented clients use their declared catalogue independently of database or earlier packs", () => {
  standaloneFixtureProbe(`
    import assert from "node:assert/strict";
    import {documentedRun} from "./test/simple-plan/documented-harness.ts";
    import {fixtureSnapshot} from "./lib/agentic/catalogue/fixtures.ts";
    import {closeSqlPool} from "./lib/db.ts";
    const allowed=new Set(fixtureSnapshot().products.map(p=>p.productId));
    try {const journey=await documentedRun("en","tools_only");
      const ready=journey.observations.filter(o=>o.tool==="plan"&&o.result.status==="ready");
      assert.ok(ready.length>0,"The documented client must reach a useful result");
      const products=ready.flatMap(o=>o.result.choices.flatMap(c=>c.products));assert.ok(products.length>0);
      assert.ok(products.every(p=>allowed.has(p.productId)),"No prior pack or live database may replace the declared client fixture");
    } finally {await closeSqlPool();}
  `, 45000, true);
});
