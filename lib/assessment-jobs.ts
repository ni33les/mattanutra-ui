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

const jobIdPrefix = "hs";

function encodePlanCode(plan: AssessmentPlan) {
  if (plan === "pro") {
    return "p";
  }

  if (plan === "optimised") {
    return "o";
  }

  return "f";
}

function decodePlanCode(code: string): AssessmentPlan | null {
  if (code === "p") {
    return "pro";
  }

  if (code === "o") {
    return "optimised";
  }

  if (code === "f") {
    return "free";
  }

  return null;
}

function encodeNumber(value: number) {
  return Math.round(value).toString(36);
}

function decodeNumber(value: string) {
  const parsed = Number.parseInt(value, 36);
  return Number.isFinite(parsed) ? parsed : null;
}

function createPortableJobId(job: Omit<AssessmentJob, "id">) {
  const randomId = crypto.randomUUID().replaceAll("-", "");

  return [
    jobIdPrefix,
    randomId,
    encodeNumber(job.createdAt),
    encodePlanCode(job.plan),
    encodeNumber(job.initialQueue),
    encodeNumber(job.queueMs),
    encodeNumber(job.formulationMs)
  ].join("_");
}

function decodePortableJobId(id: string): AssessmentJob | null {
  const [prefix, randomId, createdAtRaw, planRaw, queueRaw, queueMsRaw, formulationMsRaw] =
    id.split("_");

  if (prefix !== jobIdPrefix || !/^[a-f0-9]{32}$/.test(randomId ?? "")) {
    return null;
  }

  const createdAt = decodeNumber(createdAtRaw ?? "");
  const initialQueue = decodeNumber(queueRaw ?? "");
  const queueMs = decodeNumber(queueMsRaw ?? "");
  const formulationMs = decodeNumber(formulationMsRaw ?? "");
  const plan = decodePlanCode(planRaw ?? "");

  if (
    createdAt === null ||
    initialQueue === null ||
    queueMs === null ||
    formulationMs === null ||
    !plan
  ) {
    return null;
  }

  return {
    createdAt,
    formulationMs,
    id,
    initialQueue,
    plan,
    queueMs
  };
}

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

  const portableJob: Omit<AssessmentJob, "id"> = {
    createdAt: Date.now(),
    formulationMs: randomInt(4500, 7500),
    initialQueue: randomInt(3, 8),
    plan: normalizeAssessmentPlan(plan),
    queueMs: randomInt(3500, 6500)
  };
  const job: AssessmentJob = {
    ...portableJob,
    id: createPortableJobId(portableJob)
  };

  jobs.set(job.id, job);

  return getAssessmentJobSnapshot(job.id);
}

export function getAssessmentJobSnapshot(id: string): AssessmentJobSnapshot | null {
  const job = jobs.get(id) ?? decodePortableJobId(id);

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
