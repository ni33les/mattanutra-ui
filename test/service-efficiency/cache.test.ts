import assert from "node:assert/strict";
import { test } from "node:test";
import * as cache from "../../lib/match-work-cache.ts";
const barrier = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };

test("EFF-CACHE-01 byte eviction preserves detached exact values and never retains oversized entries", () => {
  const values = new cache.ByteBoundedCache<{ dose: bigint; text: string }>(300);
  values.set("a", { dose: 10n, text: "a".repeat(70) }); values.set("b", { dose: 20n, text: "b".repeat(70) });
  const copy = values.get("a"); assert.ok(copy); copy.dose = 999n;
  assert.equal(values.get("a")?.dose, 10n);
  values.set("c", { dose: 30n, text: "c".repeat(70) });
  assert.ok(values.bytes <= 300); assert.equal(values.get("b"), undefined); assert.ok(values.get("a"));
  values.set("huge", { dose: 1n, text: "x".repeat(1000) }); assert.equal(values.get("huge"), undefined);
});

test("EFF-CACHE-02 cancelling one owner does not cancel shared computation or another owner's checkpoint", async () => {
  const work = new cache.SharedMatchWork<number, number>(1000), entered = barrier(), release = barrier();
  const first = new AbortController(), second = new AbortController(); let calls = 0, computeSignal!: AbortSignal;
  const acknowledgements: number[] = [];
  const compute = async (context: cache.SharedWorkContext<number>) => {
    calls++; computeSignal = context.signal; entered.release(); await release.promise;
    await context.notify(4000); return 42;
  };
  const one = work.run("same", { signal: first.signal, checkpoint: async () => { throw new Error("cancelled owner must not acknowledge"); } }, compute);
  const rejected = assert.rejects(one, /owner cancelled/);
  await entered.promise;
  const two = work.run("same", { signal: second.signal, checkpoint: async value => { acknowledgements.push(value); } }, compute);
  first.abort(new Error("owner cancelled")); assert.equal(computeSignal.aborted, false); release.release();
  assert.equal(await two, 42); await rejected;
  assert.equal(calls, 1); assert.deepEqual(acknowledgements, [4000]);
  assert.equal(await work.run("same", { checkpoint: async () => {} }, async () => { throw new Error("cache miss"); }), 42);
});

test("EFF-CACHE-03 failed work and lost ownership are isolated and never cached as success", async () => {
  const work = new cache.SharedMatchWork<number, number>(1000);
  await assert.rejects(work.run("failure", {}, async () => { throw new Error("dependency unavailable"); }), /dependency unavailable/);
  assert.equal(await work.run("failure", {}, async () => 5), 5);
  const enter = barrier(), release = barrier();
  const compute = async (context: cache.SharedWorkContext<number>) => { enter.release(); await release.promise; await context.notify(1); return 9; };
  const one = work.run("lease", { checkpoint: async () => { throw new Error("lease lost"); } }, compute);
  const rejected = assert.rejects(one, /lease lost/); await enter.promise;
  const two = work.run("lease", { checkpoint: async () => {} }, compute); release.release();
  assert.equal(await two, 9); await rejected;
  assert.equal(await work.run("different-scope", {}, async () => 6), 6);
});

test("EFF-CACHE-04 compiled facts are deeply immutable and reused within the byte budget", () => {
  const facts = new cache.ByteBoundedCache<{ amounts: { amount: bigint }[] }>(1000, true);
  const source = { amounts: [{ amount: 1n }] }; facts.set("catalogue-and-reference", source); source.amounts[0].amount = 100n;
  const first = facts.get("catalogue-and-reference"); assert.ok(first);
  assert.equal(first.amounts[0].amount, 1n); assert.equal(facts.get("catalogue-and-reference"), first);
  assert.throws(() => { first.amounts[0].amount = 0n; }, TypeError); assert.ok(facts.bytes <= 1000);
});

test("EFF-CACHE-05 shared checkpoint writes retain each owner's request lifetime", async () => {
  const { withRequestLifetime, requestLifetime } = await import("../../lib/request-lifetime.ts");
  const work = new cache.SharedMatchWork<number, number>(1000), entered = barrier(), release = barrier();
  const a = new AbortController(), b = new AbortController();
  const compute = async (context: cache.SharedWorkContext<number>) => { entered.release(); await release.promise; await context.notify(1); return 3; };
  const one = withRequestLifetime({ signal: a.signal, logicalId: "a" }, () => work.run("owners", { signal: a.signal }, compute));
  const rejected = assert.rejects(one, { name: "AbortError" }); await entered.promise;
  const two = withRequestLifetime({ signal: b.signal, logicalId: "b" }, () => work.run("owners", { signal: b.signal, checkpoint: async () => {
    assert.equal(requestLifetime()?.logicalId, "b"); assert.equal(requestLifetime()?.signal, b.signal);
  } }, compute));
  a.abort(); release.release(); assert.equal(await two, 3); await rejected;
});

test("EFF-CACHE-06 durable result identities fence locale, effort, scope, facts and reference availability", async () => {
  const { input } = await import("./support.ts");
  const { matchingResultIdentity } = await import("../../lib/agentic/plan/matching.ts");
  const { setMatcherSafetyCeilingsUnavailable, resetMatcherSafetyCeilings } = await import("../../lib/matcher/safety-ceilings.ts");
  const job = await input(), key = matchingResultIdentity(job, "dev:tenant-a");
  try {
    assert.notEqual(matchingResultIdentity(job, "uat:tenant-a"), key);
    assert.notEqual(matchingResultIdentity(job, "dev:tenant-b"), key);
    assert.notEqual(matchingResultIdentity({ ...job, state: { ...job.state, locale: "th" } }, "dev:tenant-a"), key);
    assert.notEqual(matchingResultIdentity({ ...job, state: { ...job.state, searchEffort: "expanded" } }, "dev:tenant-a"), key);
    assert.notEqual(matchingResultIdentity({ ...job, snapshot: { ...job.snapshot, availabilityAsOf: "2026-09-09T00:00:00Z" } }, "dev:tenant-a"), key);
    resetMatcherSafetyCeilings();
    const noReferences = matchingResultIdentity(job, "dev:tenant-a");
    setMatcherSafetyCeilingsUnavailable();
    assert.notEqual(matchingResultIdentity(job, "dev:tenant-a"), noReferences);
  } finally { resetMatcherSafetyCeilings(); }
});
