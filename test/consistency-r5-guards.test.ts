import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { AGENTIC_PUBLIC_TOOLS } from "../lib/agentic/contract/index.ts";

describe("consistency r5 regression guards", () => {
  it("keeps the six MCP tools unchanged", () => {
    assert.deepEqual([...AGENTIC_PUBLIC_TOOLS], [
      "info",
      "plan",
      "execute",
      "order",
      "support",
      "feedback"
    ]);
  });

  it("keeps algae_only as its own requirements flag", async () => {
    const planCopy = await readFile(
      "lib/agentic/contract/instructions.ts",
      "utf8"
    );

    assert.match(planCopy, /algae_only remains its own flag/);
  });

  it("peeks queued work with one unlocked query", async () => {
    const [service, route] = await Promise.all([
      readFile("lib/task-service.ts", "utf8"),
      readFile("app/api/tasks/queued/route.ts", "utf8")
    ]);
    const start = service.indexOf("export async function listQueuedTaskHeads");
    const peek = service.slice(start, start + 900);

    assert.match(peek, /limit 50/);
    assert.doesNotMatch(peek, /for update/i);
    assert.doesNotMatch(peek, /distinct on/i);
    assert.match(route, /requireWorkerAccess/);
    assert.match(route, /listQueuedTaskHeads\(\)/);
  });

  it("claims a peeked row by primary key, not a locked queue walk", async () => {
    const service = await readFile("lib/task-service.ts", "utf8");
    const start = service.indexOf("async function claimQueuedTaskById");
    const claim = service.slice(start, start + 1200);

    assert.match(claim, /where id = \$\{input\.taskId\}::uuid/);
    assert.doesNotMatch(claim, /for update/i);
    assert.match(service, /requestedTaskId\s*\n\s*\? await claimQueuedTaskById/);
  });

  it("keeps HTTP reserve usable without a taskId for remote callers", async () => {
    const reserve = await readFile("app/api/tasks/reserve/route.ts", "utf8");

    assert.match(reserve, /taskId: textValue\(body\.taskId\) \|\| null/);
    assert.match(reserve, /await reserveNextTask\(/);
  });

  it("fans out from a shared HTTP peek so remote runners do not need Postgres", async () => {
    const runner = await readFile("workers/runner.ts", "utf8");

    assert.match(runner, /drainQueue/);
    assert.match(runner, /startQueuedPeekLoop/);
    assert.match(runner, /client\.queued\(\)/);
    assert.match(runner, /signalTaskQueue/);
    assert.match(runner, /WORKER_API_BASE_URL/);
    assert.match(runner, /from "\.\.\/lib\/task-queue-signal\.ts"/);
    assert.match(runner, /startWorkerWakeServer/);
    assert.match(runner, /wakeUrl/);
    assert.doesNotMatch(runner, /from "\.\.\/lib\/db/);
    assert.doesNotMatch(runner, /subscribeTaskQueue|getListenSql/);
  });

  it("listens on the platform and HTTP-pings registered worker wake URLs", async () => {
    const [instrumentation, wake, wakeup] = await Promise.all([
      readFile("instrumentation.ts", "utf8"),
      readFile("lib/worker-wake.ts", "utf8"),
      readFile("lib/task-wakeup.ts", "utf8")
    ]);

    assert.match(instrumentation, /subscribeTaskQueue\(\)/);
    assert.match(wake, /metadata ->> 'wakeUrl'/);
    assert.match(wake, /method: "POST"/);
    assert.match(wakeup, /pingRegisteredWorkerWakes/);
  });
});
