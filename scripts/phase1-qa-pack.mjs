#!/usr/bin/env node
// Legacy entry point. Cases now live in the maintained full suite; see
// docs/dev-advisory-v4-implementation.md for the replacement coverage map.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const runner = fileURLToPath(new URL("./run-full-test-suite.mjs", import.meta.url));
console.log("This legacy pack now runs the maintained full repository suite with isolated fixtures.");
const child = spawn(process.execPath, [runner, ...process.argv.slice(2)], { stdio: "inherit" });
child.once("error", error => { console.error(error.message); process.exitCode = 1; });
child.once("exit", (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
