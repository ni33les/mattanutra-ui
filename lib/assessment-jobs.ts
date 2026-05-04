type JobStatus = "queued" | "preparing" | "ready";
type StepState = "active" | "complete" | "pending";

export type AssessmentPlan = "free" | "optimised" | "pro";

type AssessmentJob = {
  createdAt: number;
  formulationMs: number;
  id: string;
  initialQueue: number;
  plan: AssessmentPlan;
  queueMs: number;
};

export type AssessmentJobSnapshot = {
  jobId: string;
  plan: AssessmentPlan;
  queuePosition: number;
  status: JobStatus;
  steps: Array<{
    id: "sent" | "preparing" | "ready";
    state: StepState;
  }>;
};

const globalJobs = globalThis as typeof globalThis & {
  healthspanAssessmentJobs?: Map<string, AssessmentJob>;
};

const jobs = globalJobs.healthspanAssessmentJobs ?? new Map<string, AssessmentJob>();
globalJobs.healthspanAssessmentJobs = jobs;

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function normalizeAssessmentPlan(plan: unknown): AssessmentPlan {
  if (plan === "pro") {
    return "pro";
  }

  if (
    plan === "optimised" ||
    plan === "optimized" ||
    plan === "optimal-precision"
  ) {
    return "optimised";
  }

  return "free";
}

function pruneJobs() {
  const staleBefore = Date.now() - 1000 * 60 * 30;

  for (const [id, job] of jobs.entries()) {
    if (job.createdAt < staleBefore) {
      jobs.delete(id);
    }
  }
}

export function createAssessmentJob(plan: unknown = "free") {
  pruneJobs();

  const id = crypto.randomUUID();
  const job: AssessmentJob = {
    createdAt: Date.now(),
    formulationMs: randomInt(4500, 7500),
    id,
    initialQueue: randomInt(3, 8),
    plan: normalizeAssessmentPlan(plan),
    queueMs: randomInt(3500, 6500)
  };

  jobs.set(id, job);

  return getAssessmentJobSnapshot(id);
}

export function getAssessmentJobSnapshot(id: string): AssessmentJobSnapshot | null {
  const job = jobs.get(id);

  if (!job) {
    return null;
  }

  const elapsed = Date.now() - job.createdAt;
  const readyAt = job.queueMs + job.formulationMs;
  const status: JobStatus =
    elapsed >= readyAt ? "ready" : elapsed >= job.queueMs ? "preparing" : "queued";
  const queueProgress = Math.min(1, elapsed / job.queueMs);
  const queuePosition =
    status === "queued"
      ? Math.max(1, Math.ceil(job.initialQueue * (1 - queueProgress)))
      : 0;

  return {
    jobId: id,
    plan: job.plan ?? "free",
    queuePosition,
    status,
    steps: [
      { id: "sent", state: "complete" },
      {
        id: "preparing",
        state: status === "ready" ? "complete" : "active"
      },
      {
        id: "ready",
        state: status === "ready" ? "complete" : "pending"
      }
    ]
  };
}
