#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length) : fallback;
}

function fail(message) {
  console.error(`[reset-dev-db-clean] ${message}`);
  process.exit(1);
}

function runNode(args, env = process.env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args, {
      env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      reject(new Error(`node ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

const snapshot = argValue("snapshot") ?? process.env.MATTANUTRA_CATALOGUE_SNAPSHOT;

if (!snapshot) {
  fail("Pass --snapshot=<catalogue-snapshot.json> or set MATTANUTRA_CATALOGUE_SNAPSHOT.");
}

const snapshotPath = resolve(snapshot);

await runNode([
  "--env-file-if-exists=.env.local",
  "scripts/reset-dev-db.mjs",
  "--confirm-blitz"
]);

await runNode([
  "--env-file-if-exists=.env.local",
  "--experimental-strip-types",
  "--import",
  "./scripts/register-ts-path-loader.mjs",
  "scripts/catalogue-reload.ts",
  `--input=${snapshotPath}`,
  "--confirm-catalogue-reload"
], {
  ...process.env,
  MATTANUTRA_CONFIRM_CATALOGUE_RELOAD: "reload"
});

console.log(`[reset-dev-db-clean] Reset complete and catalogue reloaded from ${snapshotPath}.`);
