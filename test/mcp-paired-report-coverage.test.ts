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
    run.matcher = { ...structuredClone(section), scores: { matching: 10, safety: 10, efficiency: 10 } };
    const encoded = canonicalPack(run);
    assert.deepEqual(JSON.parse(encoded).valueR4.cases[0].evidence.acceptance.response, business, "Passing R4 business evidence must persist in canonical artifacts");
    assert.deepEqual(snapshotFromRun(run).valueR4, { "R4-DUR-03": "PASS" });
    assert.equal(sectionTotals(run).packPass, true);
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
