import type { HealthScoreResult } from "@/lib/health-score";

type AssessmentStatus = "failed" | "queued" | "preparing" | "ready";
type StepState = "active" | "complete" | "failed" | "pending";
type AssessmentStepId =
  | "assessment"
  | "score"
  | "results";

export type AssessmentPlan = "precision" | "pro";

export const DEFAULT_ASSESSMENT_PLAN: AssessmentPlan = "precision";

export type AssessmentSnapshot = {
  healthScore?: HealthScoreResult;
  planId: string;
  plan: AssessmentPlan;
  queuePosition: number;
  status: AssessmentStatus;
  steps: Array<{
    id: AssessmentStepId;
    state: StepState;
  }>;
};

type AssessmentSnapshotInput = Readonly<{
  healthScore?: HealthScoreResult;
  plan?: unknown;
  planId?: string;
  queuePosition?: number | null;
  status?: AssessmentStatus;
}>;

export function isAssessmentPlan(plan: unknown): plan is AssessmentPlan {
  if (plan === "pro") {
    return true;
  }

  if (plan === "precision") {
    return true;
  }

  return false;
}

export function normalizeAssessmentPlan(plan: unknown): AssessmentPlan {
  return isAssessmentPlan(plan) ? plan : DEFAULT_ASSESSMENT_PLAN;
}

export function buildAssessmentSteps(
  status: AssessmentStatus
): AssessmentSnapshot["steps"] {
  const isReady = status === "ready";
  const hasFailed = status === "failed";

  return [
    { id: "assessment", state: "complete" },
    { id: "score", state: isReady ? "complete" : hasFailed ? "failed" : "active" },
    {
      id: "results",
      state: isReady ? "complete" : "pending"
    }
  ] satisfies AssessmentSnapshot["steps"];
}

export function buildHealthScoreAnalysisSteps(
  status: AssessmentStatus
): AssessmentSnapshot["steps"] {
  return buildAssessmentSteps(status);
}

export function createAssessmentSnapshot({
  healthScore,
  plan,
  planId = crypto.randomUUID(),
  queuePosition,
  status = "queued"
}: AssessmentSnapshotInput = {}): AssessmentSnapshot {
  const normalizedQueuePosition =
    status === "queued" ? Math.max(1, queuePosition ?? 1) : 0;

  return {
    ...(healthScore ? { healthScore } : {}),
    plan: normalizeAssessmentPlan(plan),
    planId,
    queuePosition: normalizedQueuePosition,
    status,
    steps: buildAssessmentSteps(status)
  } satisfies AssessmentSnapshot;
}

export function createHealthScoreAnalysisSnapshot({
  healthScore,
  plan,
  planId,
  status
}: Readonly<{
  healthScore: HealthScoreResult;
  plan?: unknown;
  planId: string;
  status: AssessmentStatus;
}>): AssessmentSnapshot {
  return {
    healthScore,
    plan: normalizeAssessmentPlan(plan),
    planId,
    queuePosition: 0,
    status,
    steps: buildHealthScoreAnalysisSteps(status)
  } satisfies AssessmentSnapshot;
}
