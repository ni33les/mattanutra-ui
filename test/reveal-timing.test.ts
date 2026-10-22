import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, it } from "node:test";
import { recordRevealTaskTerminal, revealTaskContext, timeRevealStage, timeRevealStageSync, timeRevealTaskExecution, timeRevealTaskStage } from "../lib/reveal-timing.ts";
import { serviceMeasurements, withServiceMeasurements } from "../lib/service-metrics.ts";

const planId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const originalInfo = console.info;
const originalEnabled = process.env.REVEAL_TIMING_ENABLED;
let records: Record<string, unknown>[];

beforeEach(() => {
  delete process.env.REVEAL_TIMING_ENABLED;
  records = [];
  console.info = line => { records.push(JSON.parse(String(line))); };
});
afterEach(() => {
  console.info = originalInfo;
  if (originalEnabled === undefined) delete process.env.REVEAL_TIMING_ENABLED;
  else process.env.REVEAL_TIMING_ENABLED = originalEnabled;
});

function task(overrides: Record<string, unknown> = {}) {
  return { id: taskId, planId, taskType: "generate_product_recommendations", attempts: 1, retryAttempt: 0,
    payload: { generation: { revision: 3, answers: { privateAnswer: "clinical-payload" } } },
    createdAt: "2026-10-22T01:00:00.000Z", scheduledFor: "2026-10-22T01:00:02.000Z",
    startedAt: "2026-10-22T01:00:05.000Z", completedAt: "2026-10-22T01:00:09.000Z", updatedAt: "2026-10-22T01:00:09.000Z", status: "completed" as const,
    ...overrides };
}

it("records monotonic duration once while preserving the calculation's value", async t => {
  let now = 100;
  t.mock.method(performance, "now", () => now);
  const value = { privateResult: "not-for-logs" };
  await withServiceMeasurements(async () => {
    const actual = await timeRevealStage("formulation", { planId, taskId }, async () => {
      now = 142.25;
      return value;
    });
    assert.equal(actual, value);
    assert.deepEqual(serviceMeasurements(), { "reveal.formulation_ms": { count: 1, total: 42.25, max: 42.25 } });
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].scope, "assessment.reveal_timing");
  assert.equal(records[0].message, "reveal_stage");
  assert.equal(records[0].durationMs, 42.25);
  assert.equal(records[0].planId, planId);
  assert.equal(records[0].outcome, "completed");
  assert.doesNotMatch(JSON.stringify(records), /privateResult|not-for-logs/);
});

it("preserves synchronous errors and emits no error text, stack, or clinical input", () => {
  const error = new Error("private diagnosis and email alice@example.com");
  const context = { ...revealTaskContext(task()), answers: { diagnosis: "clinical-payload" }, error };
  withServiceMeasurements(() => {
    assert.throws(() => timeRevealStageSync("healthscore_compute", context, () => { throw error; }), actual => actual === error);
    assert.equal(serviceMeasurements()["reveal.stage_failed"].count, 1);
  });
  assert.equal(records[0].outcome, "failed");
  assert.equal(records[0].revision, 3);
  assert.doesNotMatch(JSON.stringify(records), /private|clinical|diagnosis|alice|answers|stack|error/);
});

it("preserves asynchronous rejection, including non-Error thrown values", async () => {
  const failure = { privatePayload: "clinical-payload" };
  await assert.rejects(timeRevealStage("food_guidance", { planId, taskId }, async () => { throw failure; }), error => error === failure);
  assert.equal(records[0].outcome, "failed");
  assert.doesNotMatch(JSON.stringify(records), /privatePayload|clinical-payload/);
});

it("keeps the pipeline operational when the logging sink fails", async () => {
  console.info = () => { throw new Error("unavailable logging sink"); };
  const value = {};
  assert.equal(await timeRevealStage("capture", { planId }, async () => value), value);
  const failure = new Error("original error");
  await assert.rejects(timeRevealStage("formulation", { planId }, async () => { throw failure; }), error => error === failure);
});

it("keeps the pipeline operational when its measurement clock fails", async t => {
  t.mock.method(performance, "now", () => { throw new Error("clock unavailable"); });
  assert.equal(await timeRevealStage("capture", { planId }, async () => 7), 7);
  assert.equal(timeRevealStageSync("healthscore_compute", { planId }, () => 8), 8);
  assert.equal(records.length, 0);
});

it("can disable new timings without changing work or recording new aggregates", async () => {
  process.env.REVEAL_TIMING_ENABLED = "false";
  await withServiceMeasurements(async () => {
    assert.equal(await timeRevealStage("capture", { planId }, async () => 7), 7);
    assert.equal(timeRevealStageSync("healthscore_compute", { planId }, () => 8), 8);
    recordRevealTaskTerminal(task());
    assert.deepEqual(serviceMeasurements(), {});
  });
  assert.equal(records.length, 0);
});

it("keeps overlapping calculations correlated when they finish out of order", async () => {
  const secondTaskId = "33333333-3333-4333-8333-333333333333";
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  const first = timeRevealStage("formulation", { planId, taskId }, () => new Promise<void>(resolve => { finishFirst = resolve; }));
  const second = timeRevealStage("healthscore_advice", { planId, taskId: secondTaskId }, () => new Promise<void>(resolve => { finishSecond = resolve; }));
  finishSecond();
  await second;
  finishFirst();
  await first;
  assert.deepEqual(records.map(record => [record.stage, record.taskId]), [["healthscore_advice", secondTaskId], ["formulation", taskId]]);
});

it("omits untrusted identifiers and unexpected correlation values", async () => {
  await timeRevealStage("capture", { planId: "private clinical text", taskId: "alice@example.com", taskType: "sensitive input", revision: -1,
    attempt: NaN, retryAttempt: Infinity }, async () => undefined);
  assert.doesNotMatch(JSON.stringify(records), /clinical|alice|sensitive|planId|taskId|taskType|revision|attempt/i);
});

it("does not time unrelated worker jobs as reveal work", async () => {
  const context = { taskId, taskType: "send_healthscore_email" };
  assert.equal(await timeRevealTaskExecution(context, async () => 7), 7);
  assert.equal(await timeRevealTaskStage("work_item", context, async () => 8), 8);
  assert.equal(records.length, 0);
});

it("separates scheduled delay, queue/dependency wait, and reservation-to-terminal time", () => {
  withServiceMeasurements(() => {
    recordRevealTaskTerminal(task());
    assert.deepEqual(serviceMeasurements(), {
      "reveal.task_age_ms": { count: 1, total: 9000, max: 9000 },
      "reveal.first_reservation_to_terminal_ms": { count: 1, total: 4000, max: 4000 },
      "reveal.queue_and_dependency_wait_ms": { count: 1, total: 3000, max: 3000 }
    });
  });
  assert.equal(records[0].message, "reveal_task_terminal");
  assert.equal(records[0].scheduledDelayMs, 2000);
  assert.equal(records[0].queueAndDependencyWaitMs, 3000);
  assert.equal(records[0].firstReservationToTerminalMs, 4000);
  assert.equal(records[0].taskAgeMs, 9000);
  assert.equal(records[0].revision, 3);
  assert.doesNotMatch(JSON.stringify(records), /privateAnswer|clinical-payload/);
});

it("does not present a retained first reservation on retries as per-attempt queue time", () => {
  withServiceMeasurements(() => {
    recordRevealTaskTerminal(task({ attempts: 2, status: "failed", completedAt: null }));
    assert.equal(serviceMeasurements()["reveal.queue_and_dependency_wait_ms"], undefined);
  });
  assert.equal(records[0].attempt, 2);
  assert.equal(records[0].outcome, "failed");
  assert.equal(records[0].terminalTimestampSource, "updatedAt");
  assert.equal(records[0].firstReservationToTerminalMs, 4000);
  assert.equal(records[0].queueAndDependencyWaitMs, undefined);
});

it("records failed task age and queue wait from failure updated_at when completed_at is null", () => {
  withServiceMeasurements(() => {
    recordRevealTaskTerminal(task({ status: "failed", completedAt: null, updatedAt: "2026-10-22T01:00:07.000Z" }));
    assert.equal(serviceMeasurements()["reveal.task_age_ms"].total, 7000);
    assert.equal(serviceMeasurements()["reveal.queue_and_dependency_wait_ms"].total, 3000);
  });
  assert.equal(records[0].terminalTimestampSource, "updatedAt");
  assert.equal(records[0].terminalAt, "2026-10-22T01:00:07.000Z");
  assert.equal(records[0].firstReservationToTerminalMs, 2000);
});

it("omits impossible durations and nonterminal tasks", () => {
  recordRevealTaskTerminal(task({ status: "running", completedAt: null }));
  recordRevealTaskTerminal(task({ completedAt: "invalid" }));
  recordRevealTaskTerminal(task({ completedAt: "2026-10-21T01:00:00Z" }));
  assert.equal(records.length, 0);
  recordRevealTaskTerminal(task({ startedAt: "2026-10-22T01:00:20Z" }));
  assert.equal(records.length, 1);
  assert.equal(records[0].taskAgeMs, 9000);
  assert.equal(records[0].queueAndDependencyWaitMs, undefined);
  assert.equal(records[0].firstReservationToTerminalMs, undefined);
});
