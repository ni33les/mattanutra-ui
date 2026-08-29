import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = fileURLToPath(import.meta.url);
const strip = "--experimental-strip-types";
const loader = "--import";
const loaderPath = "./scripts/register-ts-path-loader.mjs";

if (!process.execArgv.includes(strip)) {
  const child = spawn(
    process.execPath,
    [strip, loader, loaderPath, here, ...process.argv.slice(2)],
    { stdio: "inherit" }
  );
  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
} else {
  const { canonicalComReport, runComPack } = await import("../test/agentic-com-pack.test.ts");
  const a = await runComPack();
  const b = await runComPack();
  const left = canonicalComReport(a);
  const right = canonicalComReport(b);
  mkdirSync("tmp", { recursive: true });
  writeFileSync("tmp/com-pack-run-a.json", left);
  writeFileSync("tmp/com-pack-run-b.json", right);

  const summary = {
    identical: left === right,
    packVersion: a.packVersion,
    passedCases: a.passedCases,
    totalCases: a.totalCases,
    cases: a.cases.map((item) => ({ id: item.id, result: item.result }))
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log(`${a.passedCases}/${a.totalCases}`);

  if (left !== right) {
    console.error("FAIL drift");
    process.exit(1);
  }

  assert.equal(left, right);
  if (a.passedCases !== a.totalCases) {
    console.error("FAIL incomplete");
    process.exit(1);
  }
  console.log("PASS identical");
}
