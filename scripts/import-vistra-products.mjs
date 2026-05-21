import { spawn } from "node:child_process";

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
const output = argValue(
  "out",
  "/private/tmp/vistra-products-quality.json"
);

if (!hasArg("quality")) {
  throw new Error("Vistra import is quality-only. Run npm run import:vistra-products -- --quality");
}

await runNode([
  ...sharedNodeArgs,
  "--brand=vistra",
  "--discover",
  "--quality",
  "--apply",
  "--auto-approve",
  `--delay-ms=${delayMs}`,
  `--out=${output}`
]);

console.log(`[vistra] snapshot: ${output}`);
