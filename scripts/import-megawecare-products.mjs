import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : fallback;
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`command failed with exit code ${code}`));
    });
  });
}

const sharedNodeArgs = [
  "--env-file-if-exists=.env.local",
  "--experimental-strip-types",
  "--import",
  "./scripts/register-ts-path-loader.mjs",
  "scripts/scrape-manufacturer-products.ts"
];
const delayMs = argValue("delay-ms", "250");
const aiDelayMs = argValue("ai-delay-ms", "250");
const qualityMode = hasArg("quality");
const output = argValue(
  "out",
  qualityMode
    ? path.join(os.tmpdir(), "megawecare-products-quality.json")
    : path.join(os.tmpdir(), `megawecare-products-${Date.now()}.json`)
);
const clearArgs = hasArg("keep-existing") ? [] : ["--clear-brand-products"];
const strictArgs = hasArg("strict")
  ? ["--ai-correction-strict", "--ai-copy-strict"]
  : [];

if (qualityMode) {
  await runNode([
    ...sharedNodeArgs,
    "--brand=mega we care",
    "--discover",
    "--quality",
    "--apply",
    "--auto-approve",
    `--delay-ms=${delayMs}`,
    `--out=${output}`,
    ...clearArgs
  ]);
} else {
  await runNode([
    ...sharedNodeArgs,
    "--brand=mega we care",
    "--discover",
    `--delay-ms=${delayMs}`,
    `--out=${output}`
  ]);

  await runNode([
    ...sharedNodeArgs,
    "--brand=mega we care",
    `--input=${output}`,
    `--out=${output}`,
    "--apply",
    "--auto-approve",
    "--ai-translate-copy",
    "--ai-correct-facts",
    "--ai-fallback-facts",
    `--delay-ms=${delayMs}`,
    `--ai-copy-delay-ms=${aiDelayMs}`,
    `--ai-correction-delay-ms=${aiDelayMs}`,
    ...clearArgs,
    ...strictArgs
  ]);
}

console.log(`[megawecare] snapshot: ${output}`);
