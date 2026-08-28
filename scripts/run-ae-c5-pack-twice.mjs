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
  const { canonicalAeC5Report, runAeC5Pack } = await import(
    "../test/agentic-ae-c5-pack.test.ts"
  );
  const a = await runAeC5Pack();
  const b = await runAeC5Pack();
  const left = canonicalAeC5Report(a);
  const right = canonicalAeC5Report(b);

  if (left !== right) {
    console.error("FAIL drift");
    console.error(
      JSON.stringify(
        {
          a: { passedCases: a.passedCases, totalCases: a.totalCases },
          b: { passedCases: b.passedCases, totalCases: b.totalCases }
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  assert.equal(left, right);
  console.log(
    JSON.stringify({
      packVersion: a.packVersion,
      passedCases: a.passedCases,
      totalCases: a.totalCases,
      cases: a.cases.map((item) => ({ id: item.id, result: item.result }))
    })
  );
  console.log(`${a.passedCases}/${a.totalCases}`);
  console.log("PASS identical");
}
