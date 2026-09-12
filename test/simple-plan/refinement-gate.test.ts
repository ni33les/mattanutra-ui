import assert from 'node:assert/strict';
import test from 'node:test';
import * as benchmark from '../../scripts/service-efficiency/benchmark-proof.mjs';
import { MCP_PACKAGES, packageStages } from '../../scripts/mcp-721-proof.mjs';
const names = ['d3', 'daniel-create', 'daniel-refine', 'maya-create'];
const identity = { sourceCommit: 'a'.repeat(40), fixtureHashes: Object.fromEntries([...names, 'maya-expanded'].map(name => [name, 'b'.repeat(64)])) };
function evidence() {
  return { kind: 'native-request-to-committed-terminal', ...identity, sourceUnchanged: true,
    trials: names.flatMap(fixture => [0, 1, 2].map(trial => ({ fixture, trial, workerRegistered: true, idleWorker: true, catalogueLoaded: true,
      completedCacheHit: false, attempts: 8000, admissionMs: 50, retrievalMs: 60, terminalMs: 750, semanticHash: 'c'.repeat(64),
      processingBytes: 900, structuredBytes: 9000, messageBytes: 9500 }))),
    expanded: { fixture: 'maya-expanded', attempts: 64000, terminalMs: 50000, completedCacheHit: false } };
}
test('REF-PACK-01 scoped release requires fresh native timing evidence and keeps unrelated suites out', () => {
  assert.equal(MCP_PACKAGES.refinement?.version, '11.0.0');
  const stages = packageStages('refinement'); assert.ok(stages.includes('fresh-standard-performance'));
  assert.ok(stages.includes('no-new-locks')); assert.ok(!stages.includes('complete-mcp-regression'));
});
test('REF-PACK-02 every trial must pass, without cache hits, averaging or hidden retries', () => {
  assert.equal(benchmark.verifyFreshStandardTimings(evidence(), identity).passed, true);
  for (const mutate of [
    (value: ReturnType<typeof evidence>) => { value.trials[0].terminalMs = 1000; },
    (value: ReturnType<typeof evidence>) => { value.trials[0].completedCacheHit = true; },
    (value: ReturnType<typeof evidence>) => { value.trials.pop(); },
    (value: ReturnType<typeof evidence>) => { value.trials.push(value.trials[0]); },
    (value: ReturnType<typeof evidence>) => { value.trials[0].attempts = 7999; },
    (value: ReturnType<typeof evidence>) => { value.trials[0].idleWorker = false; }
  ]) { const invalid = evidence(); mutate(invalid); assert.throws(() => benchmark.verifyFreshStandardTimings(invalid, identity)); }
});
test('REF-PACK-03 kernel-only, stale, semantic-change, oversized and unfinished expanded evidence cannot authorize deployment', () => {
  for (const mutate of [
    (value: ReturnType<typeof evidence>) => { value.kind = 'kernel-only'; },
    (value: ReturnType<typeof evidence>) => { value.sourceCommit = 'd'.repeat(40); },
    (value: ReturnType<typeof evidence>) => { value.trials[1].semanticHash = 'd'.repeat(64); },
    (value: ReturnType<typeof evidence>) => { value.trials[0].processingBytes = 2048; },
    (value: ReturnType<typeof evidence>) => { value.expanded.terminalMs = 180001; }
  ]) { const invalid = evidence(); mutate(invalid); assert.throws(() => benchmark.verifyFreshStandardTimings(invalid, identity)); }
});

test('REF-PACK-04 frozen expanded commands retain their requested effort over the admission draft', async () => {
  const { frozenMatchingInput } = await import('../../scripts/service-efficiency/refinement-input.ts');
  const frozen = { state: { searchEffort: 'standard' }, request: { searchEffort: 'expanded' }, snapshot: { catalogueVersion: 'frozen' } };
  const result = frozenMatchingInput(frozen);
  assert.equal(result.state.searchEffort, 'expanded');
  assert.equal(frozen.state.searchEffort, 'standard', 'Historical input evidence stays unchanged');
  assert.strictEqual(result.snapshot, frozen.snapshot);
  assert.equal(frozenMatchingInput({ ...frozen, request: {} }).state.searchEffort, 'standard');
  assert.throws(() => frozenMatchingInput({ ...frozen, request: { searchEffort: 'fast' } }));
});
