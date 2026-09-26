import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { SEMANTIC_REPLAY_FIXTURES, isNodeTestFile } from "./matcher-test-inventory.mjs";
import { nodeExecutionProof, browserExecutionProof, mergeBrowserReports } from "./test-execution-proof.mjs";
import { normalizePublishedClientResult } from "./published-client-semantics.mjs";
import { fullTestInventory, browserTestPartitions } from "./run-full-test-suite.mjs";

/** Identity comes from generated publications, shared by readiness and release proofs. */
export function validationContractIdentity() {
  const directory = new URL("../contract/mcp/", import.meta.url);
  const versions = readdirSync(directory).filter(value => /^\d+\.\d+\.\d+$/.test(value))
    .sort((a, b) => { const left = a.split(".").map(Number), right = b.split(".").map(Number); return right[0] - left[0] || right[1] - left[1] || right[2] - left[2]; });
  if (!versions.length) throw new Error("Current generated contract publication is missing");
  const artifact = JSON.parse(readFileSync(new URL(`${versions[0]}/tools.json`, directory), "utf8"));
  if (artifact.contractVersion !== versions[0] || !/^[a-f0-9]{64}$/.test(artifact.schemaChecksum)) throw new Error("Generated contract identity is inconsistent");
  return { contractVersion: artifact.contractVersion, schemaChecksum: artifact.schemaChecksum };
}

export const VALIDATION_CLIENT_LOCALES = ["en", "th", "zh-CN"];
export const DEV_VALIDATION_PROOF_VERSION = "dev-advisory-validation-4";
export const VALIDATION_CLIENT_DISCOVERY = ["resources", "tools_only"];
const clientSuffixes = ["", "-tools"];
export const REQUIRED_VALIDATION_STAGES = [
  "prepare-assets", "administration-schema", "payment-schema", "web-schema", "pharmacy-schema", "agentic-schema", "matcher-runtime-schema", "reference-integrity-schema", "demand-cache-schema", "efficiency-schema", "matching-lock-boundaries-schema", "runtime-schema", "public-catalogue-fixtures", "typecheck", "changed-lint", "production-build", "browser-fixtures", "data-fingerprints-before", "test-full",
  "bounded-semantic-replay", "documented-client-rate-window", ...clientSuffixes.flatMap(suffix => ["a", "b"].flatMap(run => VALIDATION_CLIENT_LOCALES.flatMap(locale => [`docs-client-${run}-${locale}${suffix}`, `fixture-settlement-${run}-${locale}${suffix}`, `docs-client-${run}-${locale}${suffix}-paid`]))),
  "documented-client-non-latency-equality", "full-suite-results", "data-fingerprints-after", "unchanged-schema-and-catalogue"
];
const canonicalLabels = ["node-application-independent", "node-application", "node-postgres"];
export const REQUIRED_VALIDATION_ARTIFACTS = ["source-before.json", "source-after.json", "stage-results.json", "build-identity.json", "release-lint.json", "test-inventory.json", "data-before.json", "data-after.json", "public-catalogue-fixtures.json",
  "candidate-identity.json", "full-suite/results.json", "full-suite/semantic-replay.json", "full-suite/browser-discovery.json", "full-suite/browser.json", "full-suite/browser-mode-inventory.json",
  "full-suite/browser-classic/browser-discovery.json", "full-suite/browser-classic/browser.json", "full-suite/browser-classic/browser-results.json", "client-comparison.json",
  ...[...canonicalLabels, "node-semantic-replay"].flatMap(label => [`full-suite/${label}-events.jsonl`, `full-suite/${label}-timings.jsonl`]),
  ...["a", "b"].flatMap(run => SEMANTIC_REPLAY_FIXTURES.map(row => `full-suite/semantic-${run}/${row.artifact}`)),
  ...clientSuffixes.flatMap(suffix => ["a", "b"].flatMap(run => VALIDATION_CLIENT_LOCALES.flatMap(locale => [`fixture-settlement-${run}-${locale}${suffix}.json`, `client-${run}-${locale}${suffix}/receipt.json`, `client-${run}-${locale}${suffix}/semantic.json`, `client-${run}-${locale}${suffix}-paid/receipt.json`, `client-${run}-${locale}${suffix}-paid/semantic.json`])))];

/** Reuse complete evidence only for byte-identical source; a commit alone is insufficient. */
export function readDevValidationProof(file, sourceSha256) {
  const proof = JSON.parse(readFileSync(file, "utf8"));
  if (proof.version !== DEV_VALIDATION_PROOF_VERSION || proof.contractVersion !== validationContractIdentity().contractVersion || !/^[a-f0-9]{40}$/.test(proof.releaseBaseCommit ?? "") || ["releaseLintSha256", "testInventorySha256", "databaseSchemaSha256", "catalogueSha256"].some(key => !/^[a-f0-9]{64}$/.test(proof[key] ?? "")) || proof.environment !== "dev" ||
      proof.candidateOrigin !== "http://127.0.0.1:3100" || proof.passed !== true ||
      proof.unchangedSource !== true || proof.sourceSha256 !== sourceSha256 ||
      proof.buildId !== sourceSha256.slice(0, 40) || proof.schemaChecksum !== validationContractIdentity().schemaChecksum) {
    throw new Error("DEV validation evidence is failed, incomplete, or belongs to different source.");
  }
  if (!Array.isArray(proof.steps) || proof.steps.some(step => step.passed !== true) ||
      REQUIRED_VALIDATION_STAGES.some(label => proof.steps.filter(step => step.label === label && step.passed === true).length !== 1)) {
    throw new Error("DEV validation evidence is missing a required passing stage.");
  }
  const directory = dirname(resolve(file));
  if (!Array.isArray(proof.artifacts) || !proof.artifacts.length) throw new Error("DEV validation artifact manifest is missing.");
  if (REQUIRED_VALIDATION_ARTIFACTS.some(name => !proof.artifacts.some(item => item.file === name))) throw new Error("DEV validation evidence omitted required artifacts.");
  for (const item of proof.artifacts) {
    const path = resolve(directory, item.file), local = relative(directory, path);
    if (isAbsolute(item.file) || local.startsWith("..") || !local) throw new Error("DEV validation artifact path is outside its evidence directory.");
    const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (actual !== item.sha256) throw new Error(`DEV validation artifact changed: ${item.file}`);
  }
  for (const name of ["full-suite/results.json", "full-suite/semantic-replay.json", "client-comparison.json", "stage-results.json"]) {
    const result = JSON.parse(readFileSync(resolve(directory, name), "utf8"));
    if (result.passed !== true) throw new Error(`DEV validation stage did not pass: ${name}`);
  }
  const json = name => JSON.parse(readFileSync(resolve(directory, name), "utf8"));
  const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const lint = json("release-lint.json"), inventory = json("test-inventory.json");
  const { sha256: inventoryHash, ...inventoryContent } = inventory;
  if (lint.baseCommit !== proof.releaseBaseCommit || lint.sha256 !== proof.releaseLintSha256 || hash(lint.files) !== lint.sha256 ||
      inventoryHash !== proof.testInventorySha256 || hash(inventoryContent) !== inventoryHash || !inventory.node?.length || !inventory.browser?.length || !inventory.mcp?.length) {
    throw new Error("DEV validation release or test inventory identity is inconsistent.");
  }
  if (hash(fullTestInventory()) !== inventoryHash) throw new Error("DEV validation test discovery identity is inconsistent with the current source.");
  validateCanonicalEvidence(directory, inventory, sourceSha256);
  const dataBefore = json("data-before.json"), dataAfter = json("data-after.json");
  if ([dataBefore, dataAfter].some(data => data.schemaSha256 !== proof.databaseSchemaSha256 || data.catalogueSha256 !== proof.catalogueSha256 || !data.tables?.length || hash(data.tables) !== data.catalogueSha256)) {
    throw new Error("DEV validation schema or catalogue identity changed.");
  }
  const comparison = json("client-comparison.json");
  if (!Array.isArray(comparison.comparisons) || comparison.comparisons.length !== VALIDATION_CLIENT_LOCALES.length * VALIDATION_CLIENT_DISCOVERY.length * 2 ||
      VALIDATION_CLIENT_DISCOVERY.some(discovery => VALIDATION_CLIENT_LOCALES.some(locale => ["checkout", "-paid"].some(phase => comparison.comparisons.filter(row => row.discovery === discovery && row.locale === locale && row.phase === phase && row.identical === true).length !== 1)))) {
    throw new Error("DEV validation omitted a language or payment phase from client equality.");
  }
  return proof;
}

/** Recompute coverage and business equality from the hashed raw evidence, not green flags. */
function validateCanonicalEvidence(directory, inventory, sourceSha256) {
  const json = name => JSON.parse(readFileSync(resolve(directory, `full-suite/${name}`), "utf8"));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const suite = json("results.json"), replay = json("semantic-replay.json");
  const fixtures = SEMANTIC_REPLAY_FIXTURES, replayFiles = fixtures.map(row => row.file);
  if (suite.sourceSha256 !== sourceSha256 || suite.unchangedSource !== true ||
      !Array.isArray(suite.results) || suite.results.some(row => row.passed !== true) ||
      replay.sourceSha256 !== sourceSha256 || replay.version !== "bounded-semantic-replay-1" ||
      !same(inventory.semanticReplay, fixtures) || !same(replay.fixtures, fixtures) ||
      !same(replay.replayFiles, replayFiles) || !same(replay.canonicalFiles, inventory.node) ||
      !same(suite.semanticReplay, replay) || !same(replay.independentState,
        { processes: "fresh-node-test-processes", stores: "frozen-memory-fixtures", databaseCredentials: false })) {
    throw new Error("DEV validation canonical source or bounded replay identity is inconsistent.");
  }
  const lines = name => readFileSync(resolve(directory, `full-suite/${name}.jsonl`), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const rows = [...canonicalLabels, "node-semantic-replay"].map(label => {
    const matches = suite.results.filter(row => row.label === label);
    if (matches.length !== 1) throw new Error("DEV validation canonical execution stage is missing or duplicated.");
    const row = matches[0], files = row.args?.filter(isNodeTestFile), recorded = lines(`${label}-events`);
    if (!files?.length || row.args.some(arg => /^--test-(?:name|skip)-pattern(?:=|$)/.test(arg)) ||
        !nodeExecutionProof(files, recorded).passed) throw new Error("DEV validation canonical case execution is incomplete.");
    const timing = lines(`${label}-timings`);
    if (!same(timing.map(({ durationMs, ...event }) => {
      if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error("DEV validation canonical timing measurement is invalid.");
      return event;
    }), recorded)) throw new Error("DEV validation canonical timing identities differ from executed cases.");
    return { files, recorded };
  });
  const canonical = rows.slice(0, canonicalLabels.length);
  if (suite.results.filter(row => row.label?.startsWith("node-")).length !== rows.length || new Set(inventory.node).size !== inventory.node.length ||
      !same(canonical.flatMap(row => row.files).sort(), [...inventory.node].sort()) || !same(rows.at(-1).files, replayFiles)) {
    throw new Error("DEV validation canonical coverage is missing or duplicated.");
  }
  const first = canonical.flatMap(row => row.recorded).filter(row => replayFiles.includes(row.file)), second = rows.at(-1).recorded;
  const canonicalEvents = rows => rows.map(row => JSON.stringify(row)).sort();
  const cases = fixtures.map(row => ({ file: row.file, expectedCases: row.expectedCases,
    canonicalCases: first.filter(event => event.file === row.file && event.type !== "suite").length,
    replayCases: second.filter(event => event.file === row.file && event.type !== "suite").length }));
  const inputs = [...new Set(fixtures.flatMap(row => row.inputs))].sort().map(file => ({ file,
    sha256: createHash("sha256").update(readFileSync(new URL(`../${file}`, import.meta.url))).digest("hex") }));
  if (!same(replay.initialInputs, inputs) || replay.unchangedInputs !== true || replay.identicalNonLatency !== true ||
      !same(replay.cases, cases) || cases.some(row => row.canonicalCases !== row.expectedCases || row.replayCases !== row.expectedCases) ||
      !same(canonicalEvents(first), canonicalEvents(second))) throw new Error("DEV validation bounded replay inputs or cases changed.");
  const comparisons = fixtures.map(row => {
    const normalized = run => normalizePublishedClientResult(json(`semantic-${run}/${row.artifact}`));
    return { file: row.artifact, identical: same(normalized("a"), normalized("b")) };
  });
  if (comparisons.some(row => !row.identical) || !same(replay.comparisons, comparisons)) throw new Error("DEV validation bounded replay business values changed.");
  const browser = suite.results.filter(row => row.label === "browser"), discovery = suite.results.filter(row => row.label === "browser-discovery");
  const classicRows = suite.results.filter(row => row.label === "browser-classic");
  const modes = browserTestPartitions(inventory.browser), recordedModes = json("browser-mode-inventory.json");
  const classic = json("browser-classic/browser-results.json"), classicFiles = modes.classic.map(row => row.file);
  const flags = { NEXT_PUBLIC_CHAT_QUESTIONNAIRE_V6: "0", NEXT_PUBLIC_CHAT_QUESTIONNAIRE_V5: "0" };
  const files = row => row?.args?.filter(arg => arg.startsWith("test/e2e/") && arg.endsWith(".spec.ts"));
  const validRun = row => row?.passed === true && row.args?.includes("--retries=0") && row.args?.includes("--workers=1");
  if (browser.length !== 1 || discovery.length !== 1 || classicRows.length !== 1 ||
      !same(recordedModes, { discovered: inventory.browser, standard: modes.standard, classic: modes.classic,
        classicOrigin: "http://127.0.0.1:3101", classicFlags: flags }) ||
      !discovery[0].args?.includes("--list") || !same(files(discovery[0]), modes.standard) ||
      !validRun(browser[0]) || !same(files(browser[0]), modes.standard) ||
      classic.passed !== true || !classic.discovery?.passed || !classic.discovery.args?.includes("--list") ||
      !same(files(classic.discovery), classicFiles) || !validRun(classic.run) || !same(files(classic.run), classicFiles) ||
      !same(classic.runtime, { origin: "http://127.0.0.1:3101", questionnaireFlags: flags }) ||
      !same(classicRows[0], { label: "browser-classic", ...classic })) {
    throw new Error("DEV validation browser mode discovery or execution is incomplete.");
  }
  const classicProof = browserExecutionProof(classicFiles, json("browser-classic/browser-discovery.json"), json("browser-classic/browser.json"));
  const combined = browserExecutionProof(inventory.browser,
    mergeBrowserReports([json("browser-discovery.json"), json("browser-classic/browser-discovery.json")]),
    mergeBrowserReports([json("browser.json"), json("browser-classic/browser.json")]));
  if (!classicProof.passed || classicProof.cases !== modes.classic.reduce((n, row) => n + row.expectedCases, 0) ||
      !same(classic.execution, classicProof) || !combined.passed || !same(browser[0].execution, combined)) {
    throw new Error("DEV validation raw browser coverage is incomplete or duplicated.");
  }
}
