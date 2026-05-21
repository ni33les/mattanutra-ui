import { spawn } from "node:child_process";

function hasArg(name) {
  return process.argv.includes(`--${name}`);
}

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : fallback;
}

function passThroughArg(name) {
  const value = argValue(name);

  return value === null ? [] : [`--${name}=${value}`];
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
const output = argValue(
  "out",
  "/private/tmp/dhc-products-quality.json"
);
const clearArgs = hasArg("clear-existing") ? ["--clear-brand-products"] : [];

if (!hasArg("quality")) {
  throw new Error("DHC import is quality-only. Run npm run import:dhc-products -- --quality");
}

await runNode([
  ...sharedNodeArgs,
  "--brand=dhc",
  "--discover",
  "--quality",
  "--apply",
  "--auto-approve",
  `--delay-ms=${delayMs}`,
  `--out=${output}`,
  ...passThroughArg("limit"),
  ...passThroughArg("start-at"),
  ...passThroughArg("batch-size"),
  ...passThroughArg("dhc-max-pages"),
  ...passThroughArg("evidence-concurrency"),
  ...passThroughArg("ai-concurrency"),
  ...clearArgs
]);

console.log(`[dhc] snapshot: ${output}`);
