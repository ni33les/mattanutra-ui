import { performance } from "node:perf_hooks";
import { createLogger } from "@/lib/logger";
import { recordServiceMetric, type ServiceMetric } from "@/lib/service-metrics";
import type { TaskRecord } from "@/lib/task-service-types";

const log = createLogger("assessment.reveal_timing");
const stageMetrics = {
  capture: "reveal.capture_ms",
  healthscore_compute: "reveal.healthscore_compute_ms",
  work_item: "reveal.work_item_ms",
  healthscore_advice: "reveal.healthscore_advice_ms",
  formulation: "reveal.formulation_ms",
  food_guidance: "reveal.food_guidance_ms",
  food_gap_guidance: "reveal.food_gap_guidance_ms",
  product_matching: "reveal.product_matching_ms",
  product_matching_dispatch: "reveal.product_matching_dispatch_ms",
  result_preparation: "reveal.result_preparation_ms",
  result_application: "reveal.result_application_ms",
  failure_application: "reveal.failure_application_ms"
} as const satisfies Record<string, ServiceMetric>;
type RevealStage = keyof typeof stageMetrics;

const executionStages: Readonly<Record<string, RevealStage | undefined>> = {
  analyze_healthscore: "healthscore_advice",
  generate_example_supplement_guidance: "formulation",
  generate_supplement_guidance: "formulation",
  generate_food_guidance: "food_guidance",
  generate_food_gap_guidance: "food_gap_guidance",
  generate_product_recommendations: "product_matching"
};

export type RevealTimingContext = {
  planId?: string | null;
  taskId?: string;
  taskType?: string;
  attempt?: number;
  retryAttempt?: number;
  revision?: number;
  resultReused?: boolean;
  resultSuperseded?: boolean;
};

function enabled() {
  return !["0", "false"].includes(process.env.REVEAL_TIMING_ENABLED?.trim().toLowerCase() ?? "");
}

/** Explicit allowlist: callers may hold clinical data, but only IDs/numbers/flags leave here. */
function fields(context: RevealTimingContext) {
  const result: Record<string, string | number | boolean> = {};
  for (const key of ["planId", "taskId"] as const) {
    const value = context[key];
    if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) result[key] = value;
  }
  if (context.taskType && Object.hasOwn(executionStages, context.taskType)) result.taskType = context.taskType;
  for (const key of ["attempt", "retryAttempt", "revision"] as const) {
    const value = context[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) result[key] = value;
  }
  for (const key of ["resultReused", "resultSuperseded"] as const) {
    if (typeof context[key] === "boolean") result[key] = context[key];
  }
  return result;
}

export function revealTaskContext(task: Pick<TaskRecord, "id" | "planId" | "taskType" | "attempts" | "retryAttempt" | "payload">): RevealTimingContext {
  const payload = task.payload && typeof task.payload === "object" ? task.payload as Record<string, unknown> : {};
  const generation = payload.generation && typeof payload.generation === "object" ? payload.generation as Record<string, unknown> : {};
  return { taskId: task.id, planId: task.planId, taskType: task.taskType, attempt: task.attempts,
    retryAttempt: task.retryAttempt, revision: typeof generation.revision === "number" ? generation.revision : undefined };
}

function start(stage: RevealStage, context: RevealTimingContext) {
  try {
    if (!enabled()) return () => {};
    const started = performance.now();
    return (outcome: "completed" | "failed") => {
      // Observability must never change the calculation's return value or exception.
      try {
        const durationMs = Math.round((performance.now() - started) * 100) / 100;
        if (!Number.isFinite(durationMs) || durationMs < 0) return;
        recordServiceMetric(stageMetrics[stage], durationMs);
        if (outcome === "failed") recordServiceMetric("reveal.stage_failed");
        log.info("reveal_stage", { ...fields(context), stage, outcome, durationMs });
      } catch { /* Keep telemetry failures outside the assessment pipeline. */ }
    };
  } catch { return () => {}; }
}

export async function timeRevealStage<T>(stage: RevealStage, context: RevealTimingContext, work: () => Promise<T>): Promise<T> {
  const finish = start(stage, context);
  try {
    const result = await work();
    finish("completed");
    return result;
  } catch (error) {
    finish("failed");
    throw error;
  }
}

export function timeRevealStageSync<T>(stage: RevealStage, context: RevealTimingContext, work: () => T): T {
  const finish = start(stage, context);
  try {
    const result = work();
    finish("completed");
    return result;
  } catch (error) {
    finish("failed");
    throw error;
  }
}

export function timeRevealTaskStage<T>(stage: RevealStage, context: RevealTimingContext, work: () => Promise<T>): Promise<T> {
  return context.taskType && Object.hasOwn(executionStages, context.taskType) ? timeRevealStage(stage, context, work) : work();
}

export function timeRevealTaskExecution<T>(context: RevealTimingContext, work: () => Promise<T>): Promise<T> {
  const stage = context.taskType && Object.hasOwn(executionStages, context.taskType) ? executionStages[context.taskType] : undefined;
  return stage ? timeRevealStage(stage, context, work) : work();
}

type TimedTask = Pick<TaskRecord, "id" | "planId" | "taskType" | "attempts" | "retryAttempt" | "payload" | "createdAt" | "startedAt" | "scheduledFor" | "completedAt" | "updatedAt" | "status">;

function timestamp(value: string | null) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** DB timestamps give task age, not CPU time. See docs/reveal-calculation-timing.md. */
export function recordRevealTaskTerminal(task: TimedTask) {
  try {
    if (!enabled() || !Object.hasOwn(executionStages, task.taskType) || !["completed", "failed", "cancelled", "skipped"].includes(task.status)) return;
    // Failure finalization sets updated_at, but intentionally leaves completed_at null.
    const terminalTimestampSource = task.completedAt ? "completedAt" : "updatedAt";
    const created = timestamp(task.createdAt), started = timestamp(task.startedAt), terminal = timestamp(task[terminalTimestampSource]), scheduled = timestamp(task.scheduledFor);
    if (created === null || terminal === null || terminal < created) return;
    const durations: Record<string, number> = { taskAgeMs: terminal - created };
    recordServiceMetric("reveal.task_age_ms", durations.taskAgeMs);
    if (started !== null && started >= created && terminal >= started) {
      // started_at is coalesced on reservation, so retries can retain the FIRST start.
      durations.firstReservationToTerminalMs = terminal - started;
      recordServiceMetric("reveal.first_reservation_to_terminal_ms", durations.firstReservationToTerminalMs);
      if (task.attempts === 1 && scheduled !== null && scheduled <= started) {
        durations.scheduledDelayMs = Math.max(0, scheduled - created);
        durations.queueAndDependencyWaitMs = started - Math.max(created, scheduled);
        recordServiceMetric("reveal.queue_and_dependency_wait_ms", durations.queueAndDependencyWaitMs);
      }
    }
    log.info("reveal_task_terminal", { ...fields(revealTaskContext(task)), outcome: task.status,
      terminalTimestampSource, terminalAt: new Date(terminal).toISOString(), ...durations });
  } catch { /* Completion and failure handling must not depend on telemetry. */ }
}
