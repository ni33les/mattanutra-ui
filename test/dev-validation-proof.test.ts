import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { it } from "node:test";
import { readDevValidationProof, validationContractIdentity, DEV_VALIDATION_PROOF_VERSION, REQUIRED_VALIDATION_STAGES, REQUIRED_VALIDATION_ARTIFACTS } from "../scripts/dev-validation-proof.mjs";

import { fullTestInventory } from "../scripts/run-full-test-suite.mjs";
import { SEMANTIC_REPLAY_FIXTURES, INDEPENDENT_NODE_TESTS } from "../scripts/matcher-test-inventory.mjs";

function evidence() {
  const directory = mkdtempSync(join(tmpdir(), "dev-validation-proof-"));
  const source = "a".repeat(64);
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const lint = { baseCommit: "b".repeat(40), files: ["matcher.ts"], sha256: hash(["matcher.ts"]) };
  const fixtures = SEMANTIC_REPLAY_FIXTURES;
  const replayFiles = fixtures.map(row => row.file);
  const inventoryContent = fullTestInventory();
  const inventory = { ...inventoryContent, sha256: hash(inventoryContent) };
  const tables = [{ table: "products", rows: 1, sha256: source }];
  const data = { tables, schemaSha256: source, catalogueSha256: hash(tables) };
  const comparison = { passed: true, comparisons: ["resources", "tools_only"].flatMap(discovery => ["en", "th", "zh-CN"].flatMap(locale => ["checkout", "-paid"].map(phase => ({ discovery, locale, phase, identical: true })))) };
  const named: Record<string, unknown> = { "release-lint.json": lint, "test-inventory.json": inventory, "data-before.json": data, "data-after.json": data, "client-comparison.json": comparison };
  const labels = ["node-application-independent", "node-application", "node-postgres", "node-semantic-replay"];
  const independent = INDEPENDENT_NODE_TESTS.filter(file => inventoryContent.node.includes(file));
  const selections = [independent, inventoryContent.node.filter(file => !independent.includes(file) && !inventoryContent.integration.includes(file)), inventoryContent.integration, replayFiles];
  const events = (files: string[]) => files.flatMap(file => Array.from({ length: fixtures.find(row => row.file === file)?.expectedCases ?? 1 }, (_, index) => ({
    file, name: `case ${index + 1}`, type: "test", passed: true, skip: false, todo: false, failureType: null
  })));
  const replay = { version: "bounded-semantic-replay-1", sourceSha256: source, passed: true, fixtures, replayFiles, canonicalFiles: inventoryContent.node,
    initialInputs: [...new Set(fixtures.flatMap(row => row.inputs))].sort().map(file => ({ file, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") })),
    unchangedInputs: true, identicalNonLatency: true,
    independentState: { processes: "fresh-node-test-processes", stores: "frozen-memory-fixtures", databaseCredentials: false },
    cases: fixtures.map(row => ({ file: row.file, expectedCases: row.expectedCases, canonicalCases: row.expectedCases, replayCases: row.expectedCases })),
    comparisons: fixtures.map(row => ({ file: row.artifact, identical: true })) };
  named["full-suite/semantic-replay.json"] = replay;
  named["full-suite/results.json"] = { passed: true, unchangedSource: true, sourceSha256: source, semanticReplay: replay,
    results: labels.map((label, index) => ({ label, passed: true, args: ["--test", ...selections[index]] })) };
  const lines = Object.fromEntries(labels.flatMap((label, index) => [
    [`full-suite/${label}-events.jsonl`, events(selections[index]).map(row => JSON.stringify(row)).join("\n") + "\n"],
    [`full-suite/${label}-timings.jsonl`, events(selections[index]).map(row => JSON.stringify({ ...row, durationMs: 1 })).join("\n") + "\n"]
  ]));
  for (const run of ["a", "b"]) for (const row of fixtures) named[`full-suite/semantic-${run}/${row.artifact}`] = { products: [{ id: "fixture-product", price: 100 }] };
  const browser = { suites: [{ specs: inventoryContent.browser.map(file => ({ file, id: file, title: file, line: 1,
    tests: [{ projectName: "chromium", status: "expected", results: [{ status: "passed" }] }] })) }], stats: { expected: inventoryContent.browser.length, skipped: 0, unexpected: 0, flaky: 0 } };
  named["full-suite/browser-discovery.json"] = browser;
  named["full-suite/browser.json"] = browser;
  const artifacts = [...new Set([...REQUIRED_VALIDATION_ARTIFACTS, "full-suite/browser-discovery.json", "full-suite/browser.json"])].map(file => {
    const path = join(directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, lines[file] ?? JSON.stringify(named[file] ?? { passed: true }));
    return { file, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
  });
  const proof = { version: DEV_VALIDATION_PROOF_VERSION, contractVersion: validationContractIdentity().contractVersion, releaseBaseCommit: "b".repeat(40), releaseLintSha256: lint.sha256, testInventorySha256: inventory.sha256, databaseSchemaSha256: data.schemaSha256, catalogueSha256: data.catalogueSha256, environment: "dev", candidateOrigin: "http://127.0.0.1:3100",
    passed: true, unchangedSource: true, sourceSha256: source, buildId: source.slice(0, 40), schemaChecksum: validationContractIdentity().schemaChecksum,
    steps: REQUIRED_VALIDATION_STAGES.map(label => ({ label, passed: true })), artifacts };
  const file = join(directory, "attestation.json");
  writeFileSync(file, JSON.stringify(proof));
  return { directory, source, proof, file };
}

it("reuses a complete validation only for the same source and unchanged evidence", () => {
  const fixture = evidence();
  try {
    assert.equal(readDevValidationProof(fixture.file, fixture.source).passed, true);
    assert.throws(() => readDevValidationProof(fixture.file, "b".repeat(64)), /different source/);
    writeFileSync(join(fixture.directory, "full-suite/semantic-replay.json"), JSON.stringify({ passed: false }));
    assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /artifact changed/);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

it("does not accept an overall green claim with missing or failed full-suite stages", () => {
  const fixture = evidence();
  try {
    fixture.proof.steps = fixture.proof.steps.filter(step => step.label !== "test-full");
    writeFileSync(fixture.file, JSON.stringify(fixture.proof));
    assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /required passing stage/);
    fixture.proof.steps = REQUIRED_VALIDATION_STAGES.map(label => ({ label, passed: label !== "docs-client-b-zh-CN-paid" }));
    writeFileSync(fixture.file, JSON.stringify(fixture.proof));
    assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /required passing stage/);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});


it("V5-GATE-04 rejects internally inconsistent inventory and incomplete locale evidence even when rehashed", () => {
  for (const target of ["test-inventory.json", "client-comparison.json", "data-after.json"]) {
    const fixture = evidence();
    try {
      const path = join(fixture.directory, target), data = JSON.parse(readFileSync(path, "utf8"));
      if (target === "test-inventory.json") data.mcp = [];
      if (target === "client-comparison.json") data.comparisons = data.comparisons.filter((row: { locale: string }) => row.locale !== "zh-CN");
      if (target === "data-after.json") data.schemaSha256 = "c".repeat(64);
      writeFileSync(path, JSON.stringify(data));
      fixture.proof.artifacts.find(row => row.file === target)!.sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
      writeFileSync(fixture.file, JSON.stringify(fixture.proof));
      assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /identity|language/);
    } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
  }
});


it("ANNA-GATE-01 rejects obsolete proofs and missing tools-only equality even when remaining evidence is rehashed", () => {
  for (const obsolete of [true, false]) {
    const fixture = evidence();
    try {
      if (obsolete) fixture.proof.version = "dev-advisory-validation-2";
      else {
        const path = join(fixture.directory, "client-comparison.json");
        const comparison = JSON.parse(readFileSync(path, "utf8"));
        comparison.comparisons = comparison.comparisons.filter((row: { discovery: string }) => row.discovery !== "tools_only");
        writeFileSync(path, JSON.stringify(comparison));
        fixture.proof.artifacts.find(row => row.file === "client-comparison.json")!.sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
      }
      writeFileSync(fixture.file, JSON.stringify(fixture.proof));
      assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /incomplete|language/);
    } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
  }
});

it("FULL-CYCLE-01 refuses a retired contract even when its old proof is internally consistent", () => {
  const fixture = evidence();
  try {
    fixture.proof.contractVersion = "7.0.0";
    writeFileSync(fixture.file, JSON.stringify(fixture.proof));
    assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /incomplete|contract/);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});


it("QUALITY-GATE-01 rehashed proof cannot omit or duplicate canonical execution, filter case names, or replay business drift", () => {
  for (const mode of ["missing", "duplicate", "filter", "extra-batch", "business", "replay-case", "source", "inputs"]) {
    const fixture = evidence();
    try {
      const updates: Record<string, string> = {};
      const results = JSON.parse(readFileSync(join(fixture.directory, "full-suite/results.json"), "utf8"));
      if (mode === "missing") results.results[1].args.pop();
      if (mode === "duplicate") results.results[1].args.push(results.results[1].args[1]);
      if (mode === "filter") results.results[1].args.push("--test-name-pattern=one-case");
      if (mode === "extra-batch") results.results.push({ ...results.results[1], label: "node-unreviewed-repeat" });
      if (mode === "source") results.sourceSha256 = "c".repeat(64);
      if (mode === "inputs") {
        results.semanticReplay.initialInputs[0].sha256 = "c".repeat(64);
        updates["full-suite/semantic-replay.json"] = JSON.stringify(results.semanticReplay);
      }
      updates["full-suite/results.json"] = JSON.stringify(results);
      if (mode === "business") updates["full-suite/semantic-b/real-plan-journey.json"] = JSON.stringify({ products: [{ id: "fixture-product", price: 101 }] });
      if (mode === "replay-case") {
        const path = "full-suite/node-semantic-replay-events.jsonl";
        updates[path] = readFileSync(join(fixture.directory, path), "utf8").trim().split("\n").slice(1).join("\n") + "\n";
      }
      for (const [name, contents] of Object.entries(updates)) {
        writeFileSync(join(fixture.directory, name), contents);
        fixture.proof.artifacts.find(row => row.file === name)!.sha256 = createHash("sha256").update(contents).digest("hex");
      }
      writeFileSync(fixture.file, JSON.stringify(fixture.proof));
      assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /canonical|replay/, mode);
    } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
  }
});


for (const mode of ["inventory-omit", "browser-omit", "timing-drift"]) {
  it(`QUALITY-GATE-02 source discovery and raw browser/timing evidence reject rehashed ${mode}`, () => {
    const fixture = evidence();
    try {
      const json = (name: string) => JSON.parse(readFileSync(join(fixture.directory, name), "utf8"));
      const updates: Record<string, string> = {};
      if (mode === "inventory-omit") {
        const inventory = json("test-inventory.json"), results = json("full-suite/results.json");
        const omitted = results.results[0].args.at(-1);
        inventory.node = inventory.node.filter((file: string) => file !== omitted);
        inventory.mcp = inventory.mcp.filter((file: string) => file !== omitted);
        for (const [family, files] of Object.entries(inventory.matcherGroups)) inventory.matcherGroups[family] = (files as string[]).filter(file => file !== omitted);
        const { sha256: _oldHash, ...content } = inventory;
        void _oldHash;
        inventory.sha256 = createHash("sha256").update(JSON.stringify(content)).digest("hex");
        fixture.proof.testInventorySha256 = inventory.sha256;
        results.results[0].args.pop();
        results.semanticReplay.canonicalFiles = inventory.node;
        updates["test-inventory.json"] = JSON.stringify(inventory);
        updates["full-suite/results.json"] = JSON.stringify(results);
        updates["full-suite/semantic-replay.json"] = JSON.stringify(results.semanticReplay);
        for (const suffix of ["events", "timings"]) {
          const name = `full-suite/node-application-independent-${suffix}.jsonl`;
          updates[name] = readFileSync(join(fixture.directory, name), "utf8").trim().split("\n").filter(line => JSON.parse(line).file !== omitted).join("\n") + "\n";
        }
      }
      if (mode === "browser-omit") {
        const browser = json("full-suite/browser.json");
        browser.suites[0].specs.pop();
        browser.stats.expected--;
        updates["full-suite/browser.json"] = JSON.stringify(browser);
      }
      if (mode === "timing-drift") {
        const name = "full-suite/node-application-independent-timings.jsonl";
        const rows = readFileSync(join(fixture.directory, name), "utf8").trim().split("\n").map(line => JSON.parse(line));
        rows[0].name = "different case identity";
        updates[name] = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
      }
      for (const [name, contents] of Object.entries(updates)) {
        writeFileSync(join(fixture.directory, name), contents);
        fixture.proof.artifacts.find(row => row.file === name)!.sha256 = createHash("sha256").update(contents).digest("hex");
      }
      writeFileSync(fixture.file, JSON.stringify(fixture.proof));
      assert.throws(() => readDevValidationProof(fixture.file, fixture.source), /discovery|browser|timing/, mode);
    } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
  });
}
