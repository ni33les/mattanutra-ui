import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);

      return entry.isDirectory() ? filesUnder(path) : [path];
    })
  );

  return files.flat().filter((file) => /\.(ts|tsx)$/.test(file));
}

function enclosingFunctionName(source: string, index: number) {
  const prefix = source.slice(0, index);
  const matches = [
    ...prefix.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g)
  ];

  return matches.at(-1)?.[1] ?? "(unknown)";
}

function functionBody(source: string, functionName: string) {
  const signature = new RegExp(
    `(?:export\\s+)?(?:async\\s+)?function\\s+${functionName}\\s*\\(`
  );
  const match = signature.exec(source);

  assert.ok(match, `${functionName} was not found`);

  const bodyMatch = /\)\s*(?::[^{]+)?\{/.exec(source.slice(match.index));

  assert.ok(bodyMatch, `${functionName} has no body`);

  const bodyStart =
    match.index + bodyMatch.index + bodyMatch[0].lastIndexOf("{");

  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(bodyStart + 1, index);
      }
    }
  }

  throw new Error(`${functionName} body was not closed`);
}

describe("database transaction boundaries", () => {
  it("keeps explicit transactions limited to deliberate claim/lease paths", async () => {
    const allowedTransactions = new Map<string, readonly string[]>([
      ["lib/communications.ts", ["retryCommunicationMessage"]],
      [
        "lib/task-service.ts",
        [
          "retryFailedTask",
          "releaseExpiredReservations",
          "scheduleRetryForFailedTask",
          "reserveNextTask",
          "claimTaskCompletionApplication",
          "finalizeTaskCompletion",
          "renewTaskLease",
          "claimTaskFailureApplication",
          "finalizeTaskFailure"
        ]
      ]
    ]);
    const files = [
      ...(await filesUnder("app")),
      ...(await filesUnder("lib")),
      ...(await filesUnder("workers"))
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      const actual = [...source.matchAll(/\bsql\.begin\s*\(/g)].map((match) =>
        enclosingFunctionName(source, match.index ?? 0)
      );
      const allowed = [...(allowedTransactions.get(file) ?? [])];

      assert.deepEqual(
        actual.sort(),
        allowed.sort(),
        `${file} has unexpected explicit sql.begin call sites`
      );
    }
  });

  it("keeps task result appliers outside task finalization transactions", async () => {
    const source = await readFile("lib/task-service.ts", "utf8");

    for (const functionName of [
      "claimTaskCompletionApplication",
      "finalizeTaskCompletion"
    ]) {
      assert.equal(
        functionBody(source, functionName).includes("applyResult"),
        false,
        `${functionName} must not run completion side effects inside a transaction`
      );
    }

    for (const functionName of [
      "claimTaskFailureApplication",
      "finalizeTaskFailure",
      "claimExpiredReservationsInTransaction"
    ]) {
      assert.equal(
        functionBody(source, functionName).includes("applyFailure"),
        false,
        `${functionName} must not run failure side effects inside a transaction`
      );
      assert.equal(
        functionBody(source, functionName).includes("scheduleRetryForFailedTask"),
        false,
        `${functionName} must not schedule retries inside a task-lock transaction`
      );
    }

    assert.match(
      functionBody(source, "completeTask"),
      /claimTaskCompletionApplication[\s\S]*input\.applyResult[\s\S]*finalizeTaskCompletion/,
      "completion side effects must run between the short claim and finalization transactions"
    );
    assert.match(
      functionBody(source, "failTask"),
      /claimTaskFailureApplication[\s\S]*input\.applyFailure[\s\S]*finalizeTaskFailure[\s\S]*scheduleRetryForFailedTask/,
      "failure side effects and retry scheduling must run outside the task-lock transaction"
    );
    assert.match(
      functionBody(source, "releaseExpiredReservations"),
      /claimExpiredReservationsInTransaction[\s\S]*applyExpiredReservationFailure[\s\S]*updateExpiredFailureResultPayload[\s\S]*scheduleRetryForFailedTask/,
      "expired lease failure side effects and retry scheduling must run after the short expiry claim transaction"
    );
  });

  it("keeps communication retry preparation outside the message claim transaction", async () => {
    const source = await readFile("lib/communications.ts", "utf8");
    const claimBody = functionBody(source, "claimCommunicationRetry");
    const retryBody = functionBody(source, "retryCommunicationMessage");

    for (const sideEffect of [
      "ensurePlanIdentityInTransaction",
      "seedKnownPlanChannelsInTransaction",
      "selectBestCommunicationChannel"
    ]) {
      assert.equal(
        claimBody.includes(sideEffect),
        false,
        `claimCommunicationRetry must not run ${sideEffect} while holding the message row lock`
      );
    }

    assert.match(
      retryBody,
      /ensurePlanIdentityInTransaction[\s\S]*seedKnownPlanChannelsInTransaction[\s\S]*selectBestCommunicationChannel[\s\S]*sql\.begin[\s\S]*claimCommunicationRetry/,
      "communication retry should prepare identity/channels before the short claim transaction"
    );
  });

  it("keeps row locks limited to short atomic claim paths", async () => {
    const allowedRowLocks = new Map<string, readonly string[]>([
      ["lib/communications.ts", ["claimCommunicationRetry"]],
      [
        "lib/task-service.ts",
        [
          "activeReservationInTransaction",
          "retryFailedTask",
          "claimExpiredReservationsInTransaction",
          "scheduleRetryForFailedTask",
          "reserveNextTask",
          "claimTaskCompletionApplication",
          "renewTaskLease",
          "claimTaskFailureApplication"
        ]
      ],
      ["lib/task-worker.ts", ["claimDueCronActions"]]
    ]);
    const files = [
      ...(await filesUnder("app")),
      ...(await filesUnder("lib")),
      ...(await filesUnder("workers"))
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      const actual = [
        ...source.matchAll(/\bfor\s+update(?:\s+skip\s+locked)?\b/gi)
      ].map((match) => enclosingFunctionName(source, match.index ?? 0));
      const allowed = [...(allowedRowLocks.get(file) ?? [])];

      assert.deepEqual(
        actual.sort(),
        allowed.sort(),
        `${file} has unexpected row-locking query sites`
      );
    }
  });

  it("keeps advisory locks limited to task dependency cycle protection", async () => {
    const source = await readFile("db-schema.sql", "utf8");
    const advisoryLocks = source.match(/\bpg_advisory_xact_lock\s*\(/g) ?? [];

    assert.equal(
      advisoryLocks.length,
      1,
      "db-schema.sql must not add advisory locks without an explicit boundary review"
    );
    assert.match(
      source,
      /create or replace function public\.prevent_task_dependency_cycle\(\)[\s\S]*pg_advisory_xact_lock/,
      "the only advisory lock should guard task dependency cycle checks"
    );
  });

  it("keeps runtime code from mutating database schema", async () => {
    const forbiddenDdl = /\b(?:create\s+table\s+if\s+not\s+exists|alter\s+table|create\s+index\s+if\s+not\s+exists|alter\s+type|create\s+type)\b/i;
    const files = [
      ...(await filesUnder("app")),
      ...(await filesUnder("lib")),
      ...(await filesUnder("workers"))
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");

      assert.equal(
        forbiddenDdl.test(source),
        false,
        `${file} must not run schema DDL at runtime; apply db-schema.sql instead`
      );
    }
  });
});
