import type postgres from "postgres";
import { createLogger } from "@/lib/logger";
import { getListenSql, getSql, getWorkerSql, onListenSqlClose } from "@/lib/db";

export const TASK_QUEUE_CHANNEL = "mattanutra_tasks";

const wakeupLog = createLogger("task.wakeup");

const globalTaskWakeup = globalThis as typeof globalThis & {
  mattanutraTaskWakeupWaiters?: Set<(taskType: string) => void>;
};

function taskWakeupWaiters() {
  globalTaskWakeup.mattanutraTaskWakeupWaiters ??= new Set();

  return globalTaskWakeup.mattanutraTaskWakeupWaiters;
}

function wakeTaskQueueWaiters(taskType = "") {
  const waiters = taskWakeupWaiters();

  for (const waiter of waiters) {
    waiter(taskType);
  }
}

export function notifyTaskQueueChanged(
  taskType?: string,
  sql?: postgres.Sql | postgres.TransactionSql
) {
  const payload = typeof taskType === "string" ? taskType.trim() : "";
  wakeTaskQueueWaiters(payload);

  const db = sql ?? getWorkerSql() ?? getSql();

  if (!db) {
    return;
  }

  void db`select pg_notify(${TASK_QUEUE_CHANNEL}, ${payload})`.catch((error) => {
    wakeupLog.warn("task_queue_notify_failed", {
      message: error instanceof Error ? error.message : "unknown"
    });
  });
}

export function waitForTaskQueueChange(
  timeoutMs: number,
  taskTypes?: readonly string[]
) {
  if (timeoutMs <= 0) {
    return Promise.resolve(false);
  }

  const accepted = new Set(
    (taskTypes ?? []).filter((taskType) => taskType.trim().length > 0)
  );

  return new Promise<boolean>((resolve) => {
    const waiters = taskWakeupWaiters();
    const complete = (changed: boolean) => {
      clearTimeout(timeout);
      waiters.delete(onWakeup);
      resolve(changed);
    };
    const onWakeup = (taskType: string) => {
      if (accepted.size === 0 || !taskType || accepted.has(taskType)) {
        complete(true);
      }
    };
    const timeout = setTimeout(() => complete(false), timeoutMs);

    waiters.add(onWakeup);
  });
}

export async function subscribeTaskQueue() {
  const sql = getListenSql();

  if (!sql) {
    throw new Error("Database listen connection is not configured");
  }

  let stopped = false;
  let handle: { unlisten(): Promise<void> } | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const listen = async () => {
    if (stopped) {
      return;
    }

    try {
      handle = await sql.listen(TASK_QUEUE_CHANNEL, (payload) => {
        wakeTaskQueueWaiters(typeof payload === "string" ? payload : "");
      });
      wakeupLog.info("task_queue_listening", { channel: TASK_QUEUE_CHANNEL });
    } catch (error) {
      wakeupLog.warn("task_queue_listen_failed", {
        message: error instanceof Error ? error.message : "unknown"
      });
      scheduleReconnect();
    }
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) {
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void listen();
    }, 1_000);
    reconnectTimer.unref?.();
  };

  const stopClose = onListenSqlClose(() => {
    handle = null;
    scheduleReconnect();
  });

  await listen();

  return async () => {
    stopped = true;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    stopClose();
    await handle?.unlisten().catch(() => null);
  };
}
