import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { runBatch } from "./run-full-test-suite.mjs";
import { testSourceHygiene, nodeExecutionProof } from "./test-execution-proof.mjs";

const inventory = JSON.parse(readFileSync("test/healthscore-performance/impact.json", "utf8"));
if (process.argv[2] === "--list") { console.log(JSON.stringify(inventory, null, 2)); process.exit(0); }
const output = process.argv[2];
assert.ok(output && isAbsolute(output) && !resolve(output).startsWith(`${process.cwd()}/`), "Use an absolute evidence path outside the checkout");
mkdirSync(output, { recursive: false, mode: 0o700 });
for (const row of inventory.files) assert.deepEqual(testSourceHygiene(readFileSync(row.file, "utf8"), row.file), []);
const files = inventory.files.map(row => row.file);
const env = Object.fromEntries(["PATH", "HOME", "LANG", "TMPDIR", "TZ"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
const result = await runBatch("node-healthscore-performance", ["--test", "--test-concurrency=1", "--experimental-strip-types",
  "--import", "./test/helpers/offline-network.mjs", "--import", "./scripts/register-ts-path-loader.mjs", ...files], { ...env, NODE_ENV: "test" }, output);
const events = readFileSync(`${output}/node-healthscore-performance-events.jsonl`, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const proof = nodeExecutionProof(files, events);
writeFileSync(`${output}/result.json`, JSON.stringify({ inventory, result, proof }, null, 2));
assert.ok(result.passed && proof.passed, JSON.stringify(proof));
for (const row of inventory.files) assert.equal(events.filter(e => e.file === row.file && e.type !== "suite").length, row.expectedCases, row.file);
console.log(JSON.stringify(proof));
