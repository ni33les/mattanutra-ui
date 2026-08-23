import type postgres from "postgres";
import { createLogger } from "@/lib/logger";
import { getSql, getWorkerSql } from "@/lib/db";
import {
  signalTaskQueue,
  waitForTaskQueueChange,
  waitForTaskQueueWork,
  type TaskQueueSignal
} from "@/lib/task-queue-signal";

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
}
