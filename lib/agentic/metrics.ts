const MAX_SAMPLES = 200;
const TOOLS = ["info", "plan", "execute", "order"] as const;

export type McpTimedTool = (typeof TOOLS)[number];

const samples: Record<McpTimedTool, number[]> = {
  execute: [],
  info: [],
  order: [],
  plan: []
};

function percentile(values: readonly number[], p: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return Math.round(sorted[index] ?? 0);
}

function summary(values: readonly number[]) {
  return {
    n: values.length,
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
    p99Ms: percentile(values, 99)
  };
}

export function recordMcpTiming(tool: string, durationMs: number) {
  if (!TOOLS.includes(tool as McpTimedTool) || !Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }

  const bucket = samples[tool as McpTimedTool];
  bucket.push(durationMs);
  if (bucket.length > MAX_SAMPLES) {
    bucket.splice(0, bucket.length - MAX_SAMPLES);
  }
}

export function mcpLatencySnapshot(buildId: string) {
  return {
    buildId,
    execute: summary(samples.execute),
    info: summary(samples.info),
    order: summary(samples.order),
    plan: summary(samples.plan)
  };
}
