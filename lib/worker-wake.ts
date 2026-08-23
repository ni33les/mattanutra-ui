import { createLogger } from "@/lib/logger";
import { getWorkerSql, getSql } from "@/lib/db";
import type { TaskQueueSignal } from "@/lib/task-queue-signal";

const wakeLog = createLogger("worker.wake");
const WAKE_TIMEOUT_MS = 1_500;

export async function pingRegisteredWorkerWakes(signal: TaskQueueSignal) {
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
    urls.map((url) =>
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
