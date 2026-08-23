import type postgres from "postgres";
import { createLogger } from "@/lib/logger";
import {
  getListenSql,
  getSql,
  getWorkerSql,
  onListenSqlClose,
  prepareListenConnection
} from "@/lib/db";

export const TASK_QUEUE_CHANNEL = "mattanutra_tasks";

export type TaskQueueSignal = Readonly<{
  taskId?: string;
  taskType: string;
}>;

const wakeupLog = createLogger("task.wakeup");

const globalTaskWakeup = globalThis as typeof globalThis & {
  mattanutraTaskQueuePending?: TaskQueueSignal[];
  mattanutraTaskWakeupWaiters?: Set<(signal: TaskQueueSignal) => void>;
};

function taskWakeupWaiters() {
  globalTaskWakeup.mattanutraTaskWakeupWaiters ??= new Set();

  return globalTaskWakeup.mattanutraTaskWakeupWaiters;
}

function parseTaskQueuePayload(payload: string): TaskQueueSignal {
  const text = payload.trim();

  if (text.startsWith("{")) {
    try {
      const json = JSON.parse(text) as {
        taskId?: unknown;
        taskType?: unknown;
      };
      const taskType =
        typeof json.taskType === "string" ? json.taskType.trim() : "";
      const taskId = typeof json.taskId === "string" ? json.taskId.trim() : "";

      return {
        taskType,
        ...(taskId ? { taskId } : {})
      };
    } catch {
      return { taskType: text };
    }
  }

  return { taskType: text };
}

function pendingTaskQueueSignals() {
  globalTaskWakeup.mattanutraTaskQueuePending ??= [];

  return globalTaskWakeup.mattanutraTaskQueuePending;
}

export function signalTaskQueue(signal: TaskQueueSignal) {
  const waiters = taskWakeupWaiters();

  if (waiters.size === 0) {
    if (signal.taskType) {
      pendingTaskQueueSignals().push(signal);
    }

    return;
  }

  for (const waiter of waiters) {
    waiter(signal);
  }
}

export function notifyTaskQueueChanged(
  taskType?: string,
  sql?: postgres.Sql | postgres.TransactionSql,
  taskId?: string
) {
  const payloadType = typeof taskType === "string" ? taskType.trim() : "";
  const payloadId = typeof taskId === "string" ? taskId.trim() : "";
  const signal: TaskQueueSignal = {
    taskType: payloadType,
    ...(payloadId ? { taskId: payloadId } : {})
  };
  signalTaskQueue(signal);

  const db = sql ?? getWorkerSql() ?? getSql();

  if (!db) {
    return;
  }

  const payload = JSON.stringify({
    taskId: payloadId || null,
    taskType: payloadType
  });

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
    const onWakeup = (signal: TaskQueueSignal) => {
      if (
        accepted.size === 0 ||
        !signal.taskType ||
        accepted.has(signal.taskType)
      ) {
        complete(true);
      }
    };
    const timeout = setTimeout(() => complete(false), timeoutMs);

    waiters.add(onWakeup);
  });
}

export function waitForTaskQueueWork(
  timeoutMs: number,
  taskTypes: readonly string[]
) {
  const accepted = new Set(
    taskTypes.filter((taskType) => taskType.trim().length > 0)
  );
  const pending = pendingTaskQueueSignals();
  const pendingIndex = pending.findIndex((signal) =>
    Boolean(signal.taskType && accepted.has(signal.taskType))
  );

  if (pendingIndex >= 0) {
    const [signal] = pending.splice(pendingIndex, 1);

    return Promise.resolve(signal ?? null);
  }

  return new Promise<TaskQueueSignal | null>((resolve) => {
    const waiters = taskWakeupWaiters();
    const complete = (signal: TaskQueueSignal | null) => {
      clearTimeout(timeout);
      waiters.delete(onWakeup);
      resolve(signal);
    };
    const onWakeup = (signal: TaskQueueSignal) => {
      if (signal.taskType && accepted.has(signal.taskType)) {
        complete(signal);
      }
    };
    const timeout = setTimeout(() => complete(null), timeoutMs);

    waiters.add(onWakeup);
  });
}

export async function subscribeTaskQueue() {
  await prepareListenConnection();
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
        signalTaskQueue(
          parseTaskQueuePayload(typeof payload === "string" ? payload : "")
        );
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
