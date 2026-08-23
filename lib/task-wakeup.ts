import type postgres from "postgres";
import { createLogger } from "@/lib/logger";
import {
  getListenSql,
  getSql,
  getWorkerSql,
  onListenSqlClose,
  prepareListenConnection
} from "@/lib/db";
import {
  signalTaskQueue,
  waitForTaskQueueChange,
  waitForTaskQueueWork,
  type TaskQueueSignal
} from "@/lib/task-queue-signal";
import { pingRegisteredWorkerWakes } from "@/lib/worker-wake";

export const TASK_QUEUE_CHANNEL = "mattanutra_tasks";

export {
  signalTaskQueue,
  waitForTaskQueueChange,
  waitForTaskQueueWork,
  type TaskQueueSignal
};

const wakeupLog = createLogger("task.wakeup");

export function notifyTaskQueueChanged(
  taskType?: string,
  sql?: postgres.Sql | postgres.TransactionSql,
  taskId?: string
) {
  const payloadType = typeof taskType === "string" ? taskType.trim() : "";
  const payloadId = typeof taskId === "string" ? taskId.trim() : "";
  signalTaskQueue({
    taskType: payloadType,
    ...(payloadId ? { taskId: payloadId } : {})
  });

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
  void pingRegisteredWorkerWakes({
    taskType: payloadType,
    ...(payloadId ? { taskId: payloadId } : {})
  }).catch((error) => {
    wakeupLog.warn("worker_wake_ping_failed", {
      message: error instanceof Error ? error.message : "unknown"
    });
  });
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

export async function subscribeTaskQueue() {
  await prepareListenConnection();
  const sql = getListenSql();

  if (!sql) {
    throw new Error("Database listen connection is not configured");
  }

  let stopped = false;
  let handle: { unlisten(): Promise<void> } | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const onPayload = (payload: string) => {
    const signal = parseTaskQueuePayload(payload);
    signalTaskQueue(signal);
    void pingRegisteredWorkerWakes(signal).catch((error) => {
      wakeupLog.warn("worker_wake_ping_failed", {
        message: error instanceof Error ? error.message : "unknown"
      });
    });
  };

  const listen = async () => {
    if (stopped) {
      return;
    }

    try {
      handle = await sql.listen(TASK_QUEUE_CHANNEL, (payload) => {
        onPayload(typeof payload === "string" ? payload : "");
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
