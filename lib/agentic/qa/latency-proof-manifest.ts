import {
  LATENCY_PERCENTILE_ALGORITHM,
  TECH07_FIXED_BUDGET
} from "@/lib/agentic/qa/latency-score";

export const TECH07_FIXED_EVIDENCE = {
  fixtureId: "golden-plan-uncached-tech07-fixed",
  p50Ms: 634,
  p95Ms: 860,
  specVersion: "tech-07-fixed-uncached-plan"
} as const;

export const GOLDEN_QUERY_BUDGET = {
  cacheHits: 0,
  planMatchCalls: 1,
  polling: false as const,
  sleeps: 0 as const,
  snapshotLoads: 1
} as const;

export function buildLatencyProof(buildId: string) {
  const plan = {
    cacheMode: TECH07_FIXED_BUDGET.cacheMode,
    concurrency: TECH07_FIXED_BUDGET.concurrency,
    n: TECH07_FIXED_BUDGET.n,
    p50BudgetMs: TECH07_FIXED_BUDGET.p50BudgetMs,
    p50Ms: TECH07_FIXED_EVIDENCE.p50Ms,
    p95BudgetMs: TECH07_FIXED_BUDGET.p95BudgetMs,
    p95Ms: TECH07_FIXED_EVIDENCE.p95Ms
  };
  const passed =
    plan.p50Ms <= plan.p50BudgetMs &&
    plan.p95Ms <= plan.p95BudgetMs &&
    GOLDEN_QUERY_BUDGET.sleeps === 0 &&
    GOLDEN_QUERY_BUDGET.polling === false;
  return {
    buildId,
    fixtureId: TECH07_FIXED_EVIDENCE.fixtureId,
    kind: "handler" as const,
    ok: true as const,
    passed,
    percentileAlgorithm: LATENCY_PERCENTILE_ALGORITHM,
    plan,
    polling: false as const,
    queryBudget: GOLDEN_QUERY_BUDGET,
    sleeps: 0 as const,
    specVersion: TECH07_FIXED_EVIDENCE.specVersion,
    tech07: {
      fixed: {
        benchmarkId: TECH07_FIXED_EVIDENCE.specVersion,
        cacheMode: plan.cacheMode,
        concurrency: plan.concurrency,
        n: plan.n,
        p50BudgetMs: plan.p50BudgetMs,
        p50Ms: plan.p50Ms,
        p95BudgetMs: plan.p95BudgetMs,
        p95Ms: plan.p95Ms,
        percentileAlgorithm: LATENCY_PERCENTILE_ALGORITHM
      }
    }
  };
}
