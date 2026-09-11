import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { experimentHygiene, selectExperimentTests, reconcileExperimentExecution } from "../../scripts/run-matcher-experiment-tests.mjs";

const impact = JSON.parse(readFileSync(new URL("./experiment-impact.json", import.meta.url), "utf8"));
const declared = [...impact.experimentTests, ...impact.affectedTests].map(row => row.file);

describe("focused experiment runner", () => {
  it("selects only eight registered experiment suites and five justified production regressions", () => {
    const selection = selectExperimentTests(impact, declared);
    assert.equal(selection.experiments.length, 8);
    assert.equal(selection.affected.length, 5);
    assert.deepEqual(selection.files, [...declared].sort());
    assert.ok(selection.mapping.every(row => row.reason.length > 30));
    assert.ok(!selection.files.some(file => /integration|e2e|agentic/.test(file)));
  });
  it("rejects missing or extra experiment tests, duplicate selections and unjustified expansion", () => {
    assert.throws(() => selectExperimentTests(impact, declared.slice(1)), /Missing/);
    assert.throws(() => selectExperimentTests(impact, [...declared, "test/matcher/experiment-unregistered.test.ts"]), /Unregistered/);
    assert.throws(() => selectExperimentTests({ ...impact, experimentTests: [...impact.experimentTests, impact.experimentTests[0]] }, declared), /Duplicate/);
    assert.throws(() => selectExperimentTests({ ...impact, affectedTests: [{ ...impact.affectedTests[0], file: "test/agentic-live.test.ts" }] }, declared), /reviewed|affected/);
  });
  it("rejects only, skipped, todo, retries, empty cases and unchecked empty-precondition returns", () => {
    for (const source of [
      'test.only("x", () => { assert.ok(true); });',
      'test("x", { skip: process.env.MISSING }, () => { assert.ok(true); });',
      'test.todo("x");',
      'test("x", { retries: 1 }, () => { assert.ok(true); });',
      'test("x", () => {});',
      'test("x", () => { if (!rows.length) return; assert.ok(rows[0]); });'
    ]) assert.ok(experimentHygiene(source, "fixture.test.ts").length > 0, source);
    assert.ok(experimentHygiene('test("x", () => { assert.ok(!("error" in input)); if ("error" in input) return; assert.ok(input.value); });', "fixture.test.ts").length > 0, "Acceptance rejects early-return guards even after an assertion");
    assert.deepEqual(experimentHygiene('test("x", () => { assert.ok(!("error" in input)); assert.ok(input.value); });', "fixture.test.ts"), []);
    assert.deepEqual(experimentHygiene('test("x", () => { assert.equal("test.only", "test.only"); });', "fixture.test.ts"), []);
  });
  it("requires actual successful cases for every selected file and rejects unexpected results", () => {
    const files = ["test/matcher/a.test.ts", "test/matcher/b.test.ts"];
    const events = files.map(file => ({ file, name: "checks behavior", type: "test", passed: true }));
    assert.equal(reconcileExperimentExecution(files, events).passed, true);
    assert.equal(reconcileExperimentExecution(files, events.slice(0, 1)).passed, false);
    assert.equal(reconcileExperimentExecution(files, [...events, { ...events[0], file: "test/extra.test.ts" }]).passed, false);
    assert.equal(reconcileExperimentExecution(files, events.map(row => ({ ...row, skip: true }))).passed, false);
    assert.equal(reconcileExperimentExecution(files, events.map(row => ({ ...row, name: row.file }))).passed, false);
  });
});
