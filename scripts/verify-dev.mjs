import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { npmRun, run, runCapture } from "./dev-cycle-utils.mjs";
import { sourceManifest } from "./run-full-test-suite.mjs";
import { readDevValidationProof } from "./dev-validation-proof.mjs";

async function main() {
  let attestation = process.env.DEV_VALIDATION_ATTESTATION?.trim();
  if (!attestation) {
    const evidence = resolve(process.env.DEV_ADVISORY_EVIDENCE_DIR ?? `/tmp/mattanutra-dev-validation-${Date.now()}-${randomBytes(3).toString("hex")}`);
    await npmRun("validate:dev:advisory", [], { env: { ...process.env, DEV_ADVISORY_EVIDENCE_DIR: evidence } });
    attestation = join(evidence, "attestation.json");
  }
  const source = sourceManifest();
  readDevValidationProof(attestation, source.sha256);
  const buildId = (await runCapture("git", ["rev-parse", "HEAD"])).trim();
  console.log(`[verify:dev] Complete validation verified for source ${source.sha256}.`);
  await run("next", ["build", "--webpack"], {
    env: {
      ...process.env,
      AGENTIC_BUILD_ID: buildId,
      NEXT_BUILD_CPUS: "1",
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=2300",
      NEXT_BUILD_SKIP_TYPECHECK: "1"
    }
  });
  if (sourceManifest().sha256 !== source.sha256) throw new Error("Source changed during the deployment build; validation must be repeated.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
