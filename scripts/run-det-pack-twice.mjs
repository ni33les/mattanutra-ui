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
  const { loadDetCatalog, runDetPack } = await import("../test/agentic-det-pack.test.ts");
  const catalog = await loadDetCatalog();
  const a = runDetPack(catalog);
  const b = runDetPack(catalog);
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);

  if (left !== right) {
    console.error("FAIL drift");
    console.error(JSON.stringify({ a: a.scores, b: b.scores }, null, 2));
    process.exit(1);
  }

  assert.deepEqual(a, b);
  console.log(JSON.stringify(a.scores));
  console.log("PASS identical");
}
