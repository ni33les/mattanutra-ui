import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { AGENTIC_PUBLIC_TOOLS } from "../lib/agentic/contract/index.ts";

describe("consistency r4 regression guards", () => {
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
    const qaPack = await readFile("test/agentic-qa-pack.test.ts", "utf8");

    assert.match(planCopy, /algae_only remains its own flag/);
    assert.match(qaPack, /omega3SourcePreference:\s*"algae_only"/);
  });

  it("notifies the task queue over pg_notify and listens off the query pools", async () => {
    const [wakeup, db] = await Promise.all([
      readFile("lib/task-wakeup.ts", "utf8"),
      readFile("lib/db.ts", "utf8")
    ]);

    assert.match(wakeup, /TASK_QUEUE_CHANNEL = "mattanutra_tasks"/);
    assert.match(wakeup, /pg_notify\(\$\{TASK_QUEUE_CHANNEL\}/);
    assert.match(wakeup, /subscribeTaskQueue/);
    assert.match(wakeup, /pingRegisteredWorkerWakes/);
    assert.match(wakeup, /sql\.listen\(/);
    assert.match(db, /export function getListenSql\(/);
  });

  it("keeps reserve as a single check-and-return claim", async () => {
    const reserve = await readFile("app/api/tasks/reserve/route.ts", "utf8");

    assert.match(reserve, /await reserveNextTask\(/);
    assert.doesNotMatch(reserve, /waitForTaskQueueChange/);
    assert.doesNotMatch(reserve, /heartbeatWorkerSession/);
    assert.doesNotMatch(reserve, /waitSeconds/);
    assert.doesNotMatch(reserve, /INTERACTIVE_RESERVE_POLL_INTERVAL_MS/);
    assert.doesNotMatch(reserve, /while\s*\(\s*true\s*\)/);
    assert.match(reserve, /return openClawJson\(\{\s*task: null\s*\}\)/);
  });

  it("waits in the worker process on LISTEN or 24s peek, not a tight empty loop", async () => {
    const runner = await readFile("workers/runner.ts", "utf8");

    assert.match(runner, /DEFAULT_POLL_WAIT_SECONDS = 24/);
    assert.doesNotMatch(runner, /subscribeTaskQueue/);
    assert.doesNotMatch(runner, /task-wakeup/);
    assert.match(runner, /from "\.\.\/lib\/task-queue-signal\.ts"/);
    assert.match(runner, /waitForTaskQueueWork/);
    assert.match(runner, /client\.queued\(\)/);
    assert.match(runner, /startQueuedPeekLoop/);
    assert.match(runner, /claimNext/);
    assert.match(runner, /client\.queued\(\)/);
    assert.match(
      runner,
      /if \(!work\) \{\s*continue/
    );
  });

  it("does not import the listen connection from interactive request paths", async () => {
    const files = [
      "lib/assessment-store.ts",
      "lib/bpm.ts",
      "app/api/mcp/route.ts",
      "app/[locale]/nutrition/reveal/page.tsx",
      "app/api/assessment/[planId]/formulation/route.ts",
      "app/api/assessment/[planId]/line-connect/route.ts"
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");

      assert.doesNotMatch(
        source,
        /getListenSql/,
        `${file} must not open the LISTEN connection`
      );
    }
  });

  it("keeps admin visibility on in-process waitForTaskQueueChange", async () => {
    const events = await readFile(
      "app/api/admin/visibility/events/route.ts",
      "utf8"
    );

    assert.match(events, /waitForSnapshotSignal: waitForTaskQueueChange/);
  });
});
