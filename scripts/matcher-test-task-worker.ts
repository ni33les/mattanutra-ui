/** Isolated acceptance executor. Uses production registration, reservation,
 * execution and completion; never runs in the HTTP request process. */
import "../test/helpers/offline-network.mjs";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isolatedValidationEnvironment } from "./run-dev-advisory-validation.mjs";
import { assertReleaseManifestReady } from "../lib/agentic/release-manifest.ts";
import { registerWorkerSession, heartbeatWorkerSession } from "../lib/task-service-agents.ts";
import { reserveNextTask, completeTask, failTask } from "../lib/task-service.ts";
import { buildTaskWorkItem } from "../lib/task-work-items.ts";
import { executeTaskWorkItem } from "../lib/task-execution.ts";
import { applyTaskCompletionResult, prepareTaskCompletionResult } from "../lib/task-result-applier.ts";
import { SYSTEM_AGENTS } from "../lib/system-agents.ts";
import { closeSqlPool } from "../lib/db.ts";

isolatedValidationEnvironment(process.env);
const identity = assertReleaseManifestReady();
const agent = { ...SYSTEM_AGENTS.productMatcher, id: randomUUID(), name: `Isolated MCP matcher ${process.pid}`, metadata: { isolatedAcceptance: true } };
const controller = new AbortController();
const sessions: Awaited<ReturnType<typeof registerWorkerSession>>[] = [];
for (const slot of [0, 1]) sessions.push(await registerWorkerSession({ agent,
  instanceId: `${process.pid}:${slot}`, concurrency: 1, taskTypes: ["match_agentic_plan"], workerVersion: identity.buildId }));
const active = new Map<string, string>();
const heartbeat = setInterval(() => {
  void Promise.all(sessions.map(({ session }) => heartbeatWorkerSession({ agentId: agent.id, workerSessionId: session.id,
    status: active.has(session.id) ? "working" : "idle", currentTaskId: active.get(session.id) }))).catch(error => { console.error(error); controller.abort(error); });
}, 15_000);
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => controller.abort());
process.send?.({ ready: true, workerSessionId: sessions[0].session.id, workerSessionIds: sessions.map(row => row.session.id), buildId: identity.buildId });
try {
  await Promise.all(sessions.map(async ({ session }) => {
    while (!controller.signal.aborted) {
      const reserved = await reserveNextTask({ agent, workerSessionId: session.id, taskTypes: ["match_agentic_plan"], leaseSeconds: 180 });
      if (!reserved) { await delay(100, undefined, { signal: controller.signal }).catch(() => {}); continue; }
      const ownership = { taskId: reserved.task.id, reservationId: reserved.reservationId, workerSessionId: session.id, agentId: agent.id };
      active.set(session.id, reserved.task.id);
      try {
        const work = await buildTaskWorkItem(reserved.task);
        const resultPayload = await executeTaskWorkItem(work, { signal: controller.signal });
        const task = await completeTask({ ...ownership, resultPayload,
          prepareResult: prepareTaskCompletionResult,
          applyResult: context => applyTaskCompletionResult({ ...context, taskId: reserved.task.id }) });
        console.log(JSON.stringify({ taskId: task.id, operationId: (reserved.task.payload as { operationId?: string }).operationId, status: task.status, workerSessionId: session.id }));
      } catch (error) {
        console.error(error);
        await failTask({ ...ownership, errorMessage: error instanceof Error ? error.message : String(error) });
      } finally { active.delete(session.id); }
    }
  }));
} finally {
  clearInterval(heartbeat);
  await Promise.all(sessions.map(({ session }) => heartbeatWorkerSession({ agentId: agent.id, workerSessionId: session.id, status: "offline" })));
  await closeSqlPool();
}
