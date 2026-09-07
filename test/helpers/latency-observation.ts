import assert from "node:assert/strict";

/** v4 acceptance policy: valid completed measurements are required; speed is advisory. */
export function observeLatency(value: number, budget: number, label: string) {
  assert.ok(Number.isFinite(value) && value >= 0, `${label}: invalid latency measurement`);
  assert.ok(Number.isFinite(budget) && budget > 0, `${label}: invalid latency budget`);
  if (value > budget) console.warn(JSON.stringify({ kind: "latency_warning", label, valueMs: value, budgetMs: budget }));
}

export function observeBenchmark(result: { passed: boolean; failureStage: string }, label: string) {
  assert.notEqual(result.failureStage, "SAMPLE_COUNT", `${label}: incomplete benchmark`);
  assert.notEqual(result.failureStage, "INVALID_SAMPLE", `${label}: invalid benchmark`);
  if (!result.passed) console.warn(JSON.stringify({ kind: "latency_warning", label, ...result }));
}

/** Only the declared latency diagnostics are removed; all identities and counts remain. */
export function nonLatencyBenchmarkEvidence(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(nonLatencyBenchmarkEvidence);
  if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).filter(([key]) =>
    !["failureStage", "passed"].includes(key)).map(([key, value]) => [key, nonLatencyBenchmarkEvidence(value)]));
  return input;
}
