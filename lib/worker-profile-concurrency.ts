import { matcherCpuSlotCount } from "@/lib/matcher-cpu-admission";
import type { WorkerProfileMode } from "@/lib/worker-agent-credentials";

function bounded(value: string | undefined, fallback: number) {
  const parsed=Number(value);
  return Math.min(Number.isInteger(parsed) && parsed > 0 ? parsed : fallback,8);
}

export function workerProfileConcurrency(mode: WorkerProfileMode, env: Readonly<Record<string,string|undefined>> = process.env) {
  // Matching has one productive admission budget. An independent profile limit
  // must not leave a CPU slot idle while durable work waits in the database.
  if (mode === "products") return matcherCpuSlotCount(env);
  return bounded(env[`WORKER_${mode.toUpperCase()}_CONCURRENCY`],bounded(env.WORKER_CONCURRENCY,1));
}
