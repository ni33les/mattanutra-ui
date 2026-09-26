import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import * as full from "../scripts/run-full-test-suite.mjs";
import * as proof from "../scripts/dev-validation-proof.mjs";
import { isNodeTestFile } from "../scripts/matcher-test-inventory.mjs";

type ReplayFixture = { file: string; artifact: string; expectedCases: number; reason: string };
const replayFiles = ["test/mcp-evidence-images/contracts.test.ts", "test/simple-plan/documented.test.ts"];

it("QUALITY-PLAN-01 the replay inventory names only the two frozen business fixtures and all eleven assertions", () => {
  const inventory = full.fullTestInventory() as ReturnType<typeof full.fullTestInventory> & { semanticReplay: ReplayFixture[] };
  assert.deepEqual(inventory.semanticReplay?.map(row => row.file), replayFiles);
  assert.deepEqual(inventory.semanticReplay.map(row => row.artifact), ["real-plan-journey.json", "documented-inventory-run.json"]);
  assert.equal(inventory.semanticReplay.reduce((total, row) => total + row.expectedCases, 0), 11);
  for (const fixture of inventory.semanticReplay) {
    assert.ok(fixture.reason.length > 30);
    assert.ok(inventory.node.includes(fixture.file));
  }
});

async function canonicalFixture(changeReplayPrice = false) {
  const run = (full as unknown as { runCanonicalNodeSuite: (options: Record<string, unknown>) => Promise<{ results: unknown[]; semanticReplay: { passed: boolean } }> }).runCanonicalNodeSuite;
  assert.equal(typeof run, "function", "The existing full runner must expose its canonical execution for integration testing");
  const directory = mkdtempSync(join(tmpdir(), "canonical-suite-plan-"));
  const discovered = full.fullTestInventory() as ReturnType<typeof full.fullTestInventory> & { semanticReplay: ReplayFixture[] };
  const files = [...replayFiles, "test/ordinary.test.ts", "test/ordinary.integration.test.ts"];
  const seen: Array<{ label: string; files: string[]; output?: string; db?: string }> = [];
  let starts = 0;
  try {
    const result = await run({ common: { DB_URL: "isolated-canonical-db", TEST_DB_URL: "isolated-canonical-db" }, evidence: directory,
      inventory: { ...discovered, node: files, integration: [files.at(-1)], mcp: replayFiles }, args: ["--test", "--test-concurrency=1"],
      start: async () => { starts++; return { identity: { origin: "http://127.0.0.1:3101" }, stop: async () => {} }; },
      batch: async (label: string, args: string[], env: Record<string, string>) => {
        const selected = args.filter(isNodeTestFile), output = env.MCP_EVIDENCE_IMAGES_OUTPUT;
        seen.push({ label, files: selected, output, db: env.DB_URL });
        const events = selected.flatMap(file => Array.from({ length: discovered.semanticReplay.find(row => row.file === file)?.expectedCases ?? 1 }, (_, index) => ({
          file, name: `${file} case ${index + 1}`, line: index + 1, column: 1, nesting: 0,
          passed: true, skip: false, todo: false, failureType: null, type: "test"
        })));
        writeFileSync(join(directory, `${label}-events.jsonl`), events.map(row => JSON.stringify(row)).join("\n") + "\n");
        if (output) {
          mkdirSync(output, { recursive: true });
          for (const fixture of discovered.semanticReplay.filter(row => selected.includes(row.file))) {
            writeFileSync(join(output, fixture.artifact), JSON.stringify({ products: [{ productId: "frozen-product", price: changeReplayPrice && label === "node-semantic-replay" ? 101 : 100, imageUrl: "https://fixture.example/product.webp" }] }), { flag: "wx" });
          }
        }
        return { label, args, passed: true, execution: { passed: true, cases: events.length, files: selected.length, failures: [] } };
      }
    });
    return { result, seen, starts, files };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

it("QUALITY-PLAN-02 canonical execution visits every file once and replays only independently initialized frozen fixtures", async () => {
  const { result, seen, starts, files } = await canonicalFixture();
  const canonical = seen.filter(row => row.label !== "node-semantic-replay");
  assert.deepEqual(canonical.flatMap(row => row.files).sort(), [...files].sort());
  const replay = seen.filter(row => row.label === "node-semantic-replay");
  assert.equal(replay.length, 1);
  assert.deepEqual(replay[0].files, replayFiles);
  assert.equal(starts, 1, "The in-memory semantic replay must not start another shared HTTP executor");
  assert.notEqual(replay[0].output, canonical.find(row => row.output)?.output);
  assert.equal(replay[0].db ?? "", "", "Frozen replay has no shared database credentials");
  assert.equal(result.semanticReplay.passed, true);
});

it("QUALITY-PLAN-03 identical passing test flags cannot hide replay business-value drift", async () => {
  const { result } = await canonicalFixture(true);
  assert.equal(result.semanticReplay.passed, false);
});

it("QUALITY-PLAN-04 independent cases use bounded Node processes while shared HTTP and PostgreSQL leases stay serialized", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bounded-independent-batch-"));
  const independent = ["test/bounded-lru.test.ts", "test/sha256.test.ts"];
  const shared = "test/shared-http.test.ts", integration = "test/exclusive.integration.test.ts";
  const seen: Array<{ label: string; files: string[]; args: string[]; db?: string }> = [];
  const lifecycle: string[] = [];
  try {
    await full.runNodePair({ common: { DB_URL: "isolated-db", TEST_DB_URL: "isolated-db" }, evidence: directory,
      args: ["--test", "--test-concurrency=1", "--test-timeout=600000"], files: [...independent, shared, integration], integration: [integration], independentFiles: independent,
      unitLabel: "node-application", postgresLabel: "node-postgres", httpLabel: "http-canonical",
      start: async () => { lifecycle.push("start"); return { identity: { origin: "http://127.0.0.1:3101" }, stop: async () => { lifecycle.push("stop"); } }; },
      batch: async (label: string, args: string[], env: Record<string, string>) => {
        lifecycle.push(label); seen.push({ label, files: args.filter(isNodeTestFile), args, db: env.DB_URL }); return { passed: true };
      }
    });
    assert.deepEqual(lifecycle, ["node-application-independent", "start", "node-application", "stop", "node-postgres"]);
    assert.deepEqual(seen[0].files, independent);
    assert.equal(seen[0].db ?? "", "");
    assert.deepEqual(seen[0].args.filter(arg => arg.startsWith("--test-concurrency=")), ["--test-concurrency=2"]);
    for (const batch of seen.slice(1)) assert.ok(batch.args.includes("--test-concurrency=1"));
    for (const batch of seen) assert.ok(batch.args.includes("--test-timeout=600000"));
    assert.deepEqual(seen.flatMap(row => row.files).sort(), [...independent, shared, integration].sort());
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("QUALITY-PLAN-05 release proof and CI require canonical coverage plus bounded replay instead of a second complete matrix", () => {
  assert.equal((proof as unknown as { DEV_VALIDATION_PROOF_VERSION: string }).DEV_VALIDATION_PROOF_VERSION, "dev-advisory-validation-4");
  assert.ok(proof.REQUIRED_VALIDATION_STAGES.includes("bounded-semantic-replay"));
  assert.equal(proof.REQUIRED_VALIDATION_STAGES.includes("matcher-two-runs"), false);
  assert.equal(proof.REQUIRED_VALIDATION_STAGES.includes("matcher-results"), false);
  assert.ok(proof.REQUIRED_VALIDATION_ARTIFACTS.includes("full-suite/semantic-replay.json"));
  const workflow = readFileSync(".github/workflows/mcp-722.yml", "utf8");
  assert.match(workflow, /npm run test:matcher(?:\s|$)/m);
  assert.doesNotMatch(workflow, /test:matcher:twice/);
});

it("QUALITY-PLAN-06 an independent batch cannot duplicate files or take an exclusive database case", async () => {
  const directory = mkdtempSync(join(tmpdir(), "independent-batch-boundary-"));
  const file = "test/shared.test.ts", integration = "test/exclusive.integration.test.ts";
  try {
    for (const independentFiles of [[file, file], [integration], ["test/unselected.test.ts"]]) {
      let started = false;
      await assert.rejects(full.runNodePair({ common: {}, evidence: directory, args: ["--test"], files: [file, integration], integration: [integration], independentFiles,
        unitLabel: "node-application", postgresLabel: "node-postgres", httpLabel: "http-canonical",
        start: async () => { started = true; return { identity: { origin: "http://127.0.0.1:3101" }, stop: async () => {} }; },
        batch: async () => ({ passed: true })
      }), /independent|duplicate/i);
      assert.equal(started, false, "Invalid execution ownership must fail before shared runtime setup");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("QUALITY-PLAN-07 cancellation stops the canonical lifecycle before HTTP, PostgreSQL or replay can start", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cancelled-canonical-plan-"));
  const discovered = full.fullTestInventory();
  const seen: string[] = [];
  let starts = 0;
  try {
    const result = await full.runCanonicalNodeSuite({ common: {}, evidence: directory,
      inventory: { ...discovered, node: ["test/sha256.test.ts", ...replayFiles, "test/exclusive.integration.test.ts"], integration: ["test/exclusive.integration.test.ts"] }, args: ["--test"],
      start: async () => { starts++; return { identity: { origin: "http://127.0.0.1:3101" }, stop: async () => {} }; },
      batch: async (label: string) => { seen.push(label); return { label, passed: false, signal: "SIGTERM", interrupted: true }; }
    });
    assert.deepEqual(seen, ["node-application-independent"]);
    assert.equal(starts, 0);
    assert.equal(result.semanticReplay.passed, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
