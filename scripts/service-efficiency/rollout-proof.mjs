import assert from "node:assert/strict";

const sha = value => assert.match(value ?? "", /^[a-f0-9]{40}$/);
export function validateRolloutBinding(rollout, expected, environment, activeBase) {
  assert.ok(environment === "dev" || environment === "uat", "This package cannot deploy to PRD");
  assert.equal(rollout.version, 1);
  assert.deepEqual(rollout.environments, ["dev", "uat"]);
  sha(expected.sourceCommit); sha(expected.deploymentBases.dev); sha(expected.deploymentBases.uat);
  assert.match(expected.lockRegisterSha256, /^[a-f0-9]{64}$/);
  for (const key of ["sourceCommit", "deploymentBases", "lockRegisterSha256"]) assert.deepEqual(rollout[key], expected[key], `Changed rollout ${key}`);
  assert.ok(activeBase === expected.deploymentBases[environment] || activeBase === expected.sourceCommit, "Active deployment differs from the reviewed base");
  return true;
}

export function verifyLockExecution(register, events) {
  assert.deepEqual(register.mechanisms.map(row => row.number).sort((a,b) => a-b), Array.from({length:39}, (_,i) => i+1), "All 39 mechanisms must be registered");
  const rows = register.mechanisms.map(row => {
    assert.ok(row.cases?.length > 0, `Mechanism ${row.number} has no named verification`);
    for (const named of row.cases) {
      const matches = events.filter(event => event.file === named.file && event.name === named.name && event.type !== "suite");
      assert.equal(matches.length, 1, `Missing/duplicate case for mechanism ${row.number}: ${named.name}`);
      assert.equal(matches[0].passed, true, `Failed mechanism ${row.number}: ${named.name}`);
      for (const flag of ["skip", "todo", "cancelled", "retried"]) assert.ok(!matches[0][flag]);
    }
    return {number:row.number, disposition:row.disposition, cases:row.cases, passed:true};
  });
  return {passed:true, mechanisms:rows};
}

export function withUatWorkerIdentity(spec, sourceCommit) {
  sha(sourceCommit); assert.equal(spec.name, "mattanutra-ui-uat");
  const next = structuredClone(spec), service = next.services.find(row => row.name === "mattanutra-ui");
  assert.ok(service); assert.equal(service.github.branch, "uat");
  const keys = ["AGENTIC_BUILD_ID", "AGENTIC_WORKER_VERSION", "WORKER_VERSION"];
  // Service scope overrides app scope. Update both if an identity already exists at app scope.
  for (const item of next.envs ?? []) if (keys.includes(item.key)) Object.assign(item, {value:sourceCommit, scope:"RUN_TIME", type:"GENERAL"});
  service.envs ??= [];
  for (const key of keys) {
    const item = service.envs.find(row => row.key === key);
    const value = {key, value:sourceCommit, scope:"RUN_TIME", type:"GENERAL"};
    if (item) Object.assign(item, value); else service.envs.push(value);
  }
  return next;
}
