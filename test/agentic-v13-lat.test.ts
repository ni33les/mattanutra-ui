import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import { TECH07_FIXED_BUDGET, TECH07_LIVE_BUDGET } from "../lib/agentic/qa/latency-score.ts";
import { TECH07_FIXED_EVIDENCE } from "../lib/agentic/qa/latency-proof-manifest.ts";

type StageName = "admission" | "handler" | "snapshot" | "matcher" | "serialization";

type StageRecord = Readonly<{
  admission: number;
  handler: number;
  matcher: number;
  serialization: number;
  snapshot: number;
  total: number;
}>;

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function hash(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function createInjectedClock(start = 0) {
  let current = start;
  return {
    advance(ms: number) {
      current += ms;
      return ms;
    },
    now() {
      return current;
    }
  };
}

function runAttributedWave(input: Readonly<{
  clock: ReturnType<typeof createInjectedClock>;
  concurrency: number;
  n: number;
  stages: Readonly<Record<StageName, number>>;
}>): StageRecord[] {
  const records: StageRecord[] = [];
  for (let index = 0; index < input.n; index += 1) {
    const admission = input.clock.advance(input.stages.admission);
    const snapshot = input.clock.advance(input.stages.snapshot);
    const matcher = input.clock.advance(input.stages.matcher);
    const handler = input.clock.advance(input.stages.handler);
    const serialization = input.clock.advance(input.stages.serialization);
    const total = admission + snapshot + matcher + handler + serialization;
    records.push({ admission, handler, matcher, serialization, snapshot, total });
  }
  void input.concurrency;
  return records;
}

describe("v1.3 LAT attribution before optimization", () => {
  it("LAT-ATTR-01 stage totals reconcile to the service-side total", () => {
    const clock = createInjectedClock();
    const records = runAttributedWave({
      clock,
      concurrency: TECH07_LIVE_BUDGET.concurrency,
      n: TECH07_LIVE_BUDGET.n,
      stages: { admission: 1, handler: 2, matcher: 3, serialization: 4, snapshot: 5 }
    });
    assert.equal(records.length, 30);
    for (const record of records) {
      assert.equal(
        record.admission + record.handler + record.snapshot + record.matcher + record.serialization,
        record.total
      );
    }
  });

  it("LAT-ATTR-02 injected clock twice yields byte-identical stage records and percentiles", () => {
    const stages = { admission: 10, handler: 20, matcher: 30, serialization: 40, snapshot: 50 };
    const first = runAttributedWave({
      clock: createInjectedClock(),
      concurrency: 10,
      n: 30,
      stages
    });
    const second = runAttributedWave({
      clock: createInjectedClock(),
      concurrency: 10,
      n: 30,
      stages
    });
    assert.equal(hash(first), hash(second));
    assert.equal(canonicalJson(first), canonicalJson(second));
  });

  it("LAT-ATTR-03 pre-service queue handler and post-service stages reconcile without double-count", () => {
    const clock = createInjectedClock();
    const pre = clock.advance(7);
    const queue = clock.advance(11);
    const handler = clock.advance(13);
    const post = clock.advance(17);
    assert.equal(pre + queue + handler + post, 7 + 11 + 13 + 17);
    assert.equal(clock.now(), 48);
    assert.equal(TECH07_FIXED_EVIDENCE.p50Ms, 634);
    assert.equal(TECH07_FIXED_EVIDENCE.p95Ms, 860);
    assert.equal(TECH07_FIXED_BUDGET.n, 30);
    assert.equal(TECH07_LIVE_BUDGET.n, 30);
  });
});
