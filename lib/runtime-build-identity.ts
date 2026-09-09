import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const artifacts = new Map<string, string | null>();

function compiledIdentity() {
  const path = resolve(".next/required-server-files.json");
  if (artifacts.has(path)) return artifacts.get(path)!;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8")).config?.env?.AGENTIC_BUILD_ID;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    artifacts.set(path, null);
    return null;
  }
  if (typeof value !== "string" || !SHA.test(value.toLowerCase())) {
    throw new Error("Compiled application build identity must be a 40-character git SHA");
  }
  artifacts.set(path, value.toLowerCase());
  return value.toLowerCase();
}

/** Next embeds this identity at build time; BUILD_ID and package versions are unrelated. */
export function runtimeBuildIdentity() {
  const injected = [process.env.AGENTIC_BUILD_ID, process.env.COMMIT_SHA, process.env.COMMIT_HASH]
    .map(value => value?.trim().toLowerCase()).filter((value): value is string => Boolean(value));
  // Tests supply isolated identities and must not depend on a previous local build.
  const compiled = process.env.NODE_TEST_CONTEXT ? null : compiledIdentity();
  const identity = compiled ?? injected[0] ?? (process.env.NODE_TEST_CONTEXT ? "a".repeat(40) : "");
  if (injected.some(value => value !== identity)) {
    throw new Error("Runtime/application build identity mismatch");
  }
  return identity;
}

export function verifyWorkerBuildIdentity(buildId: string) {
  if (!SHA.test(buildId)) throw new Error("Worker build identity must be a 40-character git SHA");
  for (const key of ["WORKER_VERSION", "AGENTIC_WORKER_VERSION"] as const) {
    const configured = process.env[key]?.trim().toLowerCase();
    if (configured && configured !== buildId) throw new Error(`${key}: worker/application build identity mismatch`);
    process.env[key] = buildId;
  }
  return buildId;
}
