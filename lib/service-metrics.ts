import { AsyncLocalStorage } from "node:async_hooks";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";

const METRIC_NAMES = ["mcp.admission_ms", "mcp.retrieval_ms", "match.catalogue_ms", "match.compilation_ms", "match.search_ms", "match.publication_ms", "db.acquire_begin_ms", "db.setup_ms", "db.sql_ms", "db.statements", "db.lock_timeouts", "db.lock_statement_client_ms", "db.transaction_client_ms",
  "worker.unstarted_cleanup_failures", "worker.queue_ms", "worker.execute_ms", "worker.input_bytes", "worker.sampled_input_bytes", "checkpoint.encode_ms", "checkpoint.decode_ms",
  "checkpoint.bytes", "serialization.ms", "cache.hit", "cache.miss", "cache.eviction", "cache.bytes"] as const;
export type ServiceMetric = typeof METRIC_NAMES[number];
type Aggregate = { count: number; total: number; max: number };
export type ServiceMetricBatch = Partial<Record<ServiceMetric, Aggregate>>;
type Context = { metrics: Map<ServiceMetric, Aggregate>; queryNamespace: string; queries: Map<string, Map<string, number>> };
const scopes = new AsyncLocalStorage<Context>();
const totals = new Map<ServiceMetric, Aggregate>();
let eventLoop: ReturnType<typeof monitorEventLoopDelay> | undefined;

export function serviceMeasurementContext() { return scopes.getStore(); }
export function withServiceMeasurements<T>(work: () => T): T {
  return scopes.run({ metrics: new Map(), queryNamespace: "global", queries: new Map() }, work);
}
function add(map: Map<ServiceMetric, Aggregate>, name: ServiceMetric, value: number) {
  const previous = map.get(name) ?? { count: 0, total: 0, max: 0 };
  map.set(name, { count: previous.count + 1, total: previous.total + value, max: Math.max(previous.max, value) });
}
export function recordServiceMetric(name: ServiceMetric, value = 1) {
  if (!Number.isFinite(value) || value < 0) return;
  add(totals, name, value);
  const scope = scopes.getStore(); if (scope) add(scope.metrics, name, value);
}
export function serviceMeasurements() { return Object.fromEntries(scopes.getStore()?.metrics ?? []); }
export function serviceProcessMeasurements() {
  // Enable only when requested by operational monitoring; no timer per request.
  if (!eventLoop) { eventLoop = monitorEventLoopDelay({ resolution: 20 }); eventLoop.enable(); }
  const result = { metrics: Object.fromEntries(totals), memory: process.memoryUsage(),
    eventLoop: { p95Ms: eventLoop.percentile(95) / 1e6, maxMs: eventLoop.max / 1e6 } };
  eventLoop.reset(); totals.clear(); return result;
}
export function measureService(name: ServiceMetric) {
  const start = performance.now();
  return () => recordServiceMetric(name, performance.now() - start);
}

let reportTimer: ReturnType<typeof setInterval> | undefined;
/** A single aggregate record per minute; values never contain request inputs. */
export function startServiceMeasurementReporting(write: (value: ReturnType<typeof serviceProcessMeasurements>) => void) {
  if (reportTimer) return () => {};
  serviceProcessMeasurements();
  reportTimer = setInterval(() => { write(serviceProcessMeasurements()); }, 60_000);
  reportTimer.unref?.();
  return () => { clearInterval(reportTimer); reportTimer = undefined; eventLoop?.disable(); eventLoop = undefined; };
}


/** Fixed numeric fields only; worker batches never include customer inputs. */
export function takeWorkerMeasurements(): ServiceMetricBatch {
  const result = Object.fromEntries(totals); totals.clear(); return result;
}
export function mergeWorkerMeasurements(batch: ServiceMetricBatch | undefined) {
  if (!batch) return;
  for (const name of METRIC_NAMES) {
    const value = batch[name];
    if (!value || !Number.isSafeInteger(value.count) || value.count < 1 || !Number.isFinite(value.total) || value.total < 0 || !Number.isFinite(value.max) || value.max < 0) continue;
    for (const map of [totals, scopes.getStore()?.metrics]) if (map) {
      const previous = map.get(name) ?? { count: 0, total: 0, max: 0 };
      map.set(name, { count: previous.count + value.count, total: previous.total + value.total, max: Math.max(previous.max, value.max) });
    }
  }
}
