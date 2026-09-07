#!/usr/bin/env node
/** Focused, offline experiment gate. Importing this module performs no runs. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { runBatch, sourceManifest } from "./run-full-test-suite.mjs";
import { nodeExecutionProof, testSourceHygiene } from "./test-execution-proof.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const EXPERIMENTS = ["scoring", "search", "oracle", "corpus", "report", "runner", "comparison", "pair"].map(name => `test/matcher/experiment-${name}.test.ts`);
const AFFECTED = ["advisory-dose-fit", "flexible-v5-doses", "flexible-v5-priority", "flexible-v5-options", "flexible-v5-search"].map(name => `test/matcher/${name}.test.ts`);
const HOOK_FILES = new Set(["lib/matcher/index.ts", "lib/matcher/search.ts"]);
const hash = value => createHash("sha256").update(value).digest("hex");

export function selectExperimentTests(impact, existingFiles) {
  assert.equal(impact.version, "matcher-experiment-impact-1");
  assert.equal(impact.scope, "offline_scoring_experiment_and_affected_matcher_hooks");
  const mapping = [...impact.experimentTests, ...impact.affectedTests];
  assert.equal(new Set(mapping.map(row => row.file)).size, mapping.length, "Duplicate test selection");
  assert.deepEqual(impact.experimentTests.map(row => row.file).sort(), [...EXPERIMENTS].sort(), "Experiment suites must match the reviewed eight-file inventory");
  assert.deepEqual(impact.affectedTests.map(row => row.file).sort(), [...AFFECTED].sort(), "Only the five reviewed affected production suites may run");
  for (const row of mapping) assert.ok(typeof row.reason === "string" && row.reason.trim().length > 30, "Every selected suite needs a meaningful review reason");
  for (const row of impact.affectedTests) assert.ok(row.changedProductionFiles?.length > 0 && row.changedProductionFiles.every(file => HOOK_FILES.has(file)), "Affected tests must identify the bounded production hooks");
  for (const file of EXPERIMENTS.concat(AFFECTED)) assert.ok(existingFiles.includes(file), `Missing declared test file: ${file}`);
  for (const file of existingFiles.filter(file => /(?:^|\/)experiment-.*\.test\.ts$/.test(file))) assert.ok(EXPERIMENTS.includes(file), `Unregistered experiment test file: ${file}`);
  return { version: impact.version, scope: impact.scope, experiments: [...EXPERIMENTS], affected: [...AFFECTED], files: mapping.map(row => row.file).sort(), mapping };
}

function unparen(node) { while (ts.isParenthesizedExpression(node)) node = node.expression; return node; }
function booleanKey(input, parsed, negative = false) {
  const node = unparen(input);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) return booleanKey(node.operand, parsed, !negative);
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) {
    const and = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
    return `${and !== negative ? "and" : "or"}(${[booleanKey(node.left, parsed, negative), booleanKey(node.right, parsed, negative)].sort().join(",")})`;
  }
  return `${negative ? "!" : ""}${node.getText(parsed).replace(/\s+/g, "")}`;
}
function assertedGuard(statement, parsed) {
  if (!ts.isIfStatement(statement)) return false;
  const parent = statement.parent;
  if (!ts.isBlock(parent)) return false;
  const index = parent.statements.indexOf(statement), previous = parent.statements[index - 1];
  if (!previous || !ts.isExpressionStatement(previous) || !ts.isCallExpression(previous.expression)) return false;
  const call = previous.expression;
  return ["assert", "assert.ok"].includes(call.expression.getText(parsed)) && call.arguments.length > 0 && booleanKey(call.arguments[0], parsed, true) === booleanKey(statement.expression, parsed);
}
export function experimentHygiene(source, file) {
  const failures = testSourceHygiene(source, file);
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  function callbackReturns(node) {
    if (ts.isReturnStatement(node) && !node.expression) {
      const guard = ts.isBlock(node.parent) ? node.parent.parent : node.parent;
      if (!assertedGuard(guard, parsed)) failures.push(`${file}: unchecked empty-precondition return can omit behavioral assertions`);
    }
    ts.forEachChild(node, child => { if (!ts.isFunctionLike(child)) callbackReturns(child); });
  }
  function visit(node) {
    if (ts.isCallExpression(node)) {
      let base = node.expression; const modifiers = [];
      while (ts.isPropertyAccessExpression(base)) { modifiers.unshift(base.name.text); base = base.expression; }
      if (ts.isIdentifier(base) && ["test", "it", "describe"].includes(base.text)) {
        if (modifiers.some(key => ["only", "skip", "todo", "fixme", "retry", "retries"].includes(key))) failures.push(`${file}: focused acceptance prohibits test modifiers and retries`);
        for (const argument of node.arguments) {
          if (ts.isObjectLiteralExpression(argument)) for (const prop of argument.properties) {
            if (!ts.isPropertyAssignment(prop)) continue;
            const name = prop.name.getText(parsed).replace(/["']/g, "");
            if (["only", "skip", "todo"].includes(name) && prop.initializer.kind !== ts.SyntaxKind.FalseKeyword) failures.push(`${file}: conditional ${name} can omit an acceptance case`);
            if (["retry", "retries"].includes(name) && prop.initializer.getText(parsed) !== "0") failures.push(`${file}: automatic retries are prohibited`);
          }
          if ((ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) && ts.isBlock(argument.body)) callbackReturns(argument.body);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return [...new Set(failures)];
}
export function reconcileExperimentExecution(files, events) { return nodeExecutionProof(files, events); }

export async function main(args = process.argv.slice(2)) {
  assert.ok(args.length === 0 || args.length === 1 && args[0] === "--list" || args.length === 2 && args[0] === "--output", "Use --list or --output NEW_DIRECTORY");
  const impact = JSON.parse(readFileSync(join(ROOT, "test/matcher/experiment-impact.json"), "utf8"));
  const existing = readdirSync(join(ROOT, "test/matcher"), { recursive: true }).filter(name => typeof name === "string" && name.endsWith(".test.ts")).map(name => `test/matcher/${name}`);
  const inventory = selectExperimentTests(impact, existing);
  const failures = inventory.files.flatMap(file => experimentHygiene(readFileSync(join(ROOT, file), "utf8"), file));
  assert.deepEqual(failures, [], failures.join("\n"));
  if (args[0] === "--list") { console.log(JSON.stringify(inventory, null, 2)); return inventory; }
  const evidence = resolve(args[1] ?? process.env.MATCHER_EXPERIMENT_TEST_EVIDENCE_DIR ?? `/tmp/matcher-experiment-tests-${Date.now()}`);
  assert.ok(!existsSync(evidence), "Evidence directory must be new");
  const parent = realpathSync(dirname(evidence)), local = relative(ROOT, parent);
  assert.ok(local.startsWith("..") || isAbsolute(local), "Evidence must be outside the checkout");
  mkdirSync(evidence, { mode: 0o700 });
  const save = (file, data) => writeFileSync(join(evidence, file), `${JSON.stringify(data, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  const before = sourceManifest(), inventorySha256 = hash(JSON.stringify(inventory));
  save("source-before.json", before); save("inventory.json", { ...inventory, sha256: inventorySha256 });
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
  Object.assign(env, { NODE_ENV: "test", MATTANUTRA_ENV: "dev", STRIPE_PAYMENT_MODE: "mock", NODE_OPTIONS: "--max-old-space-size=1500" });
  const result = await runBatch("node-matcher-experiment", ["--test", "--test-concurrency=1", "--experimental-strip-types", "--import", "./scripts/matcher-experiment-offline.mjs", "--import", "./scripts/register-ts-path-loader.mjs", ...inventory.files], env, evidence);
  const events = readFileSync(join(evidence, "node-matcher-experiment-events.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const execution = reconcileExperimentExecution(inventory.files, events), after = sourceManifest();
  save("source-after.json", after);
  const final = { version: "matcher-experiment-test-evidence-1", scope: inventory.scope, inventorySha256, sourceSha256: before.sha256,
    unchangedSource: before.sha256 === after.sha256, retries: 0, execution, result,
    passed: before.sha256 === after.sha256 && execution.passed && result.passed };
  save("results.json", final); console.log(JSON.stringify({ evidence, passed: final.passed, files: execution.files, cases: execution.cases }));
  if (!final.passed) process.exitCode = 1;
  return final;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
