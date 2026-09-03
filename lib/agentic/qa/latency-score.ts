export const LATENCY_PERCENTILE_ALGORITHM = "linear_interpolation_rank_(n-1)*p" as const;

export const TECH07_FIXED_FIELD_PATH = "tech07.fixed" as const;
export const TECH07_LIVE_FIELD_PATH = "tech07.live" as const;

export const TECH07_FIXED_BUDGET = {
  cacheMode: "uncached" as const,
  concurrency: 10,
  n: 30,
  p50BudgetMs: 3_000,
  p95BudgetMs: 5_000
};

export const TECH07_LIVE_BUDGET = {
  cacheMode: "uncached" as const,
  concurrency: 10,
  n: 30,
  p50BudgetMs: 5_000,
  p95BudgetMs: 8_000
};

export function interpolatePercentile(values: readonly number[], p: number) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return 0;
  }
  if (sorted.length === 1) {
    return sorted[0]!;
  }
  const rank = (sorted.length - 1) * (p / 100);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) {
    return sorted[low]!;
  }
  const weight = rank - low;
  return sorted[low]! * (1 - weight) + sorted[high]! * weight;
}

export type Tech07FixedDefinition = Readonly<{
  cacheMode: string;
  concurrency: number;
  n: number;
  p50BudgetMs?: number;
  p95BudgetMs?: number;
}>;

export function readTech07Fixed(proof: unknown): Tech07FixedDefinition | null {
  if (!proof || typeof proof !== "object") {
    return null;
  }
  const tech07 = (proof as { tech07?: { fixed?: unknown } }).tech07;
  const fixed = tech07?.fixed;
  if (!fixed || typeof fixed !== "object") {
    return null;
  }
  const record = fixed as Record<string, unknown>;
  if (
    typeof record.n !== "number" ||
    typeof record.concurrency !== "number" ||
    typeof record.cacheMode !== "string"
  ) {
    return null;
  }
  return {
    cacheMode: record.cacheMode,
    concurrency: record.concurrency,
    n: record.n,
    p50BudgetMs: typeof record.p50BudgetMs === "number" ? record.p50BudgetMs : undefined,
    p95BudgetMs: typeof record.p95BudgetMs === "number" ? record.p95BudgetMs : undefined
  };
}

export function scoreUncachedPlanBenchmark(input: Readonly<{
  budgets: Readonly<{ p50BudgetMs: number; p95BudgetMs: number }>;
  cacheMode: string;
  concurrency: number;
  n: number;
  samples: readonly number[];
}>) {
  const p50Ms = interpolatePercentile(input.samples, 50);
  const p95Ms = interpolatePercentile(input.samples, 95);
  const p50Pass = p50Ms <= input.budgets.p50BudgetMs;
  const p95Pass = p95Ms <= input.budgets.p95BudgetMs;
  const passed = input.samples.length === input.n && p50Pass && p95Pass;
  let failureStage = "NONE";
  if (input.samples.length !== input.n) {
    failureStage = "SAMPLE_COUNT";
  } else if (!p95Pass) {
    failureStage = "P95";
  } else if (!p50Pass) {
    failureStage = "P50";
  }
  return {
    cacheMode: input.cacheMode,
    concurrency: input.concurrency,
    failureStage,
    n: input.n,
    p50BudgetMs: input.budgets.p50BudgetMs,
    p95BudgetMs: input.budgets.p95BudgetMs,
    passed,
    percentileAlgorithm: LATENCY_PERCENTILE_ALGORITHM
  };
}

export function canonicalLatencyEvidence(input: Readonly<{
  buildId: string;
  failureStage: string;
  fixed: ReturnType<typeof scoreUncachedPlanBenchmark>;
  live: ReturnType<typeof scoreUncachedPlanBenchmark>;
  snapshotId: string;
}>) {
  return {
    buildId: input.buildId,
    failureStage: input.failureStage,
    fixed: input.fixed,
    live: input.live,
    percentileAlgorithm: LATENCY_PERCENTILE_ALGORITHM,
    snapshotId: input.snapshotId
  };
}
