import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

export const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      shell: process.platform === "win32",
      stdio: options.stdio ?? "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const suffix =
        signal === null ? `exited with code ${code}` : `received signal ${signal}`;
      reject(new Error(`${command} ${args.join(" ")} ${suffix}`));
    });
  });
}

export function runCapture(command, args = []) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || `${command} ${args.join(" ")} failed`));
    });
  });
}

export function npmRun(script, args = [], options = {}) {
  return run(npmCommand, ["run", script, ...args], options);
}

export function splitFiles(value) {
  return value
    .split(/[\n,]+/)
    .map((file) => normalizePath(file.trim()))
    .filter(Boolean);
}

export async function changedFiles() {
  if (process.env.DEV_CYCLE_CHANGED_FILES) {
    return splitFiles(process.env.DEV_CYCLE_CHANGED_FILES);
  }

  const [tracked, untracked] = await Promise.all([
    runCapture("git", ["diff", "--name-only", "HEAD"]),
    runCapture("git", ["ls-files", "--others", "--exclude-standard"])
  ]);

  return [...new Set([...splitFiles(tracked), ...splitFiles(untracked)])].sort();
}

export function allTestFiles() {
  return readdirSync("test")
    .filter((file) => file.endsWith(".test.ts"))
    .map((file) => normalizePath(join("test", file)))
    .sort();
}

export function existingFiles(files) {
  return files.filter((file) => existsSync(file));
}

export function hasLintableExtension(file) {
  return [".cjs", ".js", ".mjs", ".ts", ".tsx"].includes(extname(file));
}

export function isDocsOnly(file) {
  return (
    file.endsWith(".md") ||
    file.startsWith("docs/") ||
    file.startsWith(".codex/") ||
    file === ".gitignore"
  );
}

export function isBroadChange(file) {
  return (
    file === "package.json" ||
    file === "package-lock.json" ||
    file === "tsconfig.json" ||
    file === "next.config.ts" ||
    file === "proxy.ts" ||
    file === "eslint.config.mjs" ||
    file === "lib/db.ts" ||
    /^scripts\/.*schema\.(ts|mjs)$/.test(file) ||
    file === "scripts/register-ts-path-loader.mjs" ||
    file === "scripts/ts-path-loader.mjs" ||
    file === "scripts/run-tests.mjs" ||
    file === "scripts/lint-changed.mjs" ||
    file === "scripts/dev-cycle-utils.mjs" ||
    file === "scripts/build-dev-fast.mjs" ||
    file === "scripts/verify-dev.mjs" ||
    file === "scripts/deploy-dev.mjs"
  );
}

export function printList(title, values) {
  console.log(`${title}: ${values.length === 0 ? "(none)" : ""}`);
  for (const value of values) {
    console.log(`  - ${value}`);
  }
}
