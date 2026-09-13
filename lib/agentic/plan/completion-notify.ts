import type postgres from "postgres";
import { deferUntilDatabaseCommit } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { signalPlanOperationChange, type PlanOperationChange } from "@/lib/agentic/plan/completion-signals";

const log = createLogger("plan.completion");
/** notificationSql is the root pool, not the completed transaction. */
export function notifyPlanOperationChanged(change: PlanOperationChange, notificationSql: postgres.Sql) {
  if (deferUntilDatabaseCommit(() => notifyPlanOperationChanged(change, notificationSql))) return;
  signalPlanOperationChange(change);
  const payload = JSON.stringify({ kind: "plan_operation_changed", ...change });
  void notificationSql`select pg_notify(${"mattanutra_tasks"}, ${payload})`.catch(error => {
    log.warn("completion_notify_failed", { message: error instanceof Error ? error.message : "unknown" });
  });
}
