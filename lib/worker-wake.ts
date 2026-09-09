import { createLogger } from "@/lib/logger";
import { getWorkerSql, getSql } from "@/lib/db";
import type { TaskQueueSignal } from "@/lib/task-queue-signal";

const wakeLog = createLogger("worker.wake");
const WAKE_TIMEOUT_MS = 1_500;

const dispatchWake = coalescedWorkerWake(sendRegisteredWorkerWakes);
export function pingRegisteredWorkerWakes(signal: TaskQueueSignal) { return dispatchWake(signal); }

async function sendRegisteredWorkerWakes(signal: TaskQueueSignal) {
  const taskType = signal.taskType.trim();

  if (!taskType) {
    return;
  }

  const sql = getWorkerSql() ?? getSql();

  if (!sql) {
    return;
  }

  const rows = await sql<Array<{ wake_url: string }>>`
    select distinct trim(both from metadata ->> 'wakeUrl') as wake_url
    from public.worker_sessions
    where status in ('idle', 'polling', 'working')
      and last_seen_at > now() - interval '5 minutes'
      and coalesce(metadata ->> 'wakeUrl', '') <> ''
      and ${taskType} = any(task_types)
  `;
  const urls = [
    ...new Set(rows.map((row) => row.wake_url).filter((url) => url.length > 0))
  ];

  if (urls.length === 0) {
    return;
  }

  await Promise.allSettled(
    chooseWorkerWakeUrls(urls, signal).map((url) =>
      pingWakeUrl(url, signal).catch((error) => {
        wakeLog.warn("worker_wake_failed", {
          message: error instanceof Error ? error.message : "unknown",
          url
        });
      })
    )
  );
}

async function pingWakeUrl(url: string, signal: TaskQueueSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WAKE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      body: JSON.stringify({
        taskId: signal.taskId ?? null,
        taskType: signal.taskType
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`wake ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** One bounded burst per task type; notifications remain a hint, DB leases own work. */
export function coalescedWorkerWake(deliver: (signal: TaskQueueSignal) => Promise<void>) {
  const pending = new Map<string, { next: TaskQueueSignal | null; active?: TaskQueueSignal; promise: Promise<void> }>();
  return (signal: TaskQueueSignal): Promise<void> => {
    const key = signal.taskType.trim(); if (!key) return Promise.resolve();
    const existing = pending.get(key);
    if (existing) {
      if (existing.active?.taskId === signal.taskId && existing.active) return existing.promise;
      existing.next = existing.next && existing.next.taskId !== signal.taskId ? { taskType: key } : { ...signal, taskType: key };
      return existing.promise;
    }
    if (pending.size >= 256) return Promise.resolve(); // Periodic durable discovery remains authoritative.
    const entry: { next: TaskQueueSignal | null; active?: TaskQueueSignal; promise: Promise<void> } = { next: { ...signal, taskType: key } as TaskQueueSignal | null, promise: Promise.resolve() };
    entry.promise = Promise.resolve().then(async () => {
      while (entry.next) { const next = entry.next; entry.next = null; entry.active = next; await deliver(next); entry.active = undefined; }
    }).finally(() => pending.delete(key));
    pending.set(key, entry); return entry.promise;
  };
}


let wakeOffset = 0;
/** One known task needs one nudge. Batch/unknown counts retain recovery fan-out. */
export function chooseWorkerWakeUrls(urls: string[], signal: TaskQueueSignal): string[] {
  if (!signal.taskId || urls.length < 2) return urls;
  const ordered = [...urls].sort();
  const chosen = ordered[wakeOffset % ordered.length]; wakeOffset = (wakeOffset + 1) % 1_000_000;
  return [chosen];
}
