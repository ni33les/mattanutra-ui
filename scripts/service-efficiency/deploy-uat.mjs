import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { run, runCapture } from "../dev-cycle-utils.mjs";
import { sourceManifest } from "../run-full-test-suite.mjs";
import { checkMcp721Proof, mcp721Identity } from "../mcp-721-proof.mjs";
import { compiledBuildIdentity } from "../mcp-payload/proof.mjs";
import { validateRolloutBinding, withUatWorkerIdentity } from "./rollout-proof.mjs";

const appId = "ea15bb05-f418-47e3-9d2d-2c4161ad7cf2";
export async function deployEfficiencyUat(file, schemaEnv) {
  assert.ok(file?.startsWith("/"), "An absolute scoped attestation is required");
  assert.equal(await runCapture("git", ["status", "--porcelain"]), "", "Validated source must remain clean");
  assert.equal(await runCapture("git", ["branch", "--show-current"]), "dev");
  const sourceCommit = await runCapture("git", ["rev-parse", "HEAD"]);
  const identity = mcp721Identity(sourceManifest().sha256, sourceCommit, "efficiency");
  checkMcp721Proof(file, identity, "efficiency");
  const evidence = dirname(file), build = JSON.parse(readFileSync(resolve(evidence, "build.json"), "utf8"));
  assert.equal(build.buildSha256, compiledBuildIdentity());
  assert.equal(build.sourceCommit, sourceCommit);
  const rollout = JSON.parse(readFileSync(resolve(evidence, "rollout.json"), "utf8"));
  assert.ok(process.env.DIGITALOCEAN_ACCESS_TOKEN, "Platform credentials are required");
  const api = async (path, method = "GET", body) => {
    const response = await fetch(`https://api.digitalocean.com/v2/${path}`, {method,
      headers:{Authorization:`Bearer ${process.env.DIGITALOCEAN_ACCESS_TOKEN}`, "Content-Type":"application/json"},
      body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(30_000)});
    assert.ok(response.ok, `Platform API ${method} failed: ${response.status}`);
    return response.json();
  };
  const {app} = await api(`apps/${appId}`);
  assert.ok(!app.in_progress_deployment && !app.pending_deployment, "Wait for the current UAT deployment");
  const activeBase = app.active_deployment.services.find(row => row.name === "mattanutra-ui")?.source_commit_hash;
  validateRolloutBinding(rollout, identity, "uat", activeBase);
  const next = withUatWorkerIdentity(app.spec, sourceCommit);
  const remote = (await runCapture("git", ["ls-remote", "origin", "refs/heads/uat"])).split(/\s+/)[0];
  assert.ok(remote === activeBase || remote === sourceCommit, "UAT branch changed since the reviewed deployment");
  await run("git", ["merge-base", "--is-ancestor", identity.deploymentBases.uat, sourceCommit]);
  const db = new URL(schemaEnv.DB_URL);
  assert.match(db.pathname, /uat/i); assert.doesNotMatch(db.pathname, /prd|prod/i);
  await run(process.execPath, ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", "scripts/apply-service-efficiency-schema.ts"], {env:schemaEnv});
  // Do not let the push start new source with the old injected runtime identity.
  const paused = structuredClone(app.spec);
  paused.services.find(row => row.name === "mattanutra-ui").github.deploy_on_push = false;
  await api(`apps/${appId}`, "PUT", {spec:paused});
  await run("git", ["push", `--force-with-lease=refs/heads/uat:${remote}`, "origin", `${sourceCommit}:refs/heads/uat`]);
  const response = await api(`apps/${appId}`, "PUT", {spec:next});
  const requestedDeployment = response.app.pending_deployment?.id ?? response.app.in_progress_deployment?.id ?? null;
  writeFileSync(resolve(evidence, "uat-rollout-request.json"), JSON.stringify({environment:"uat", appId, sourceCommit, activeBase,
    requestedDeployment, replicas:next.services.find(row => row.name === "mattanutra-ui").instance_count,
    poolsChanged:false, referenceDataChanged:false, at:new Date().toISOString()}, null, 2), {flag:"wx", mode:0o600});
  for (let attempt=0; attempt<180; attempt++) {
    const {app:current} = await api(`apps/${appId}`);
    const deployed = current.active_deployment;
    if (deployed?.phase === "ACTIVE" && deployed.services.find(row => row.name === "mattanutra-ui")?.source_commit_hash === sourceCommit) {
      writeFileSync(resolve(evidence, "uat-platform-deployment.json"), JSON.stringify({environment:"uat", appId,
        sourceCommit, deploymentId:deployed.id, phase:deployed.phase, at:new Date().toISOString(),
        executionVerification:"required separately; ACTIVE alone is not worker proof"}, null, 2), {flag:"wx", mode:0o600});
      console.log("[deploy:uat] Validated source is ACTIVE. Actual worker execution and environment-specific artifact proof remain required.");
      return;
    }
    const pending = current.in_progress_deployment ?? current.pending_deployment;
    assert.ok(!pending || !["ERROR", "CANCELED"].includes(pending.phase), "UAT deployment failed");
    await new Promise(done => setTimeout(done, 10_000));
  }
  throw new Error("UAT deployment did not become active within the bounded deployment window");
}
