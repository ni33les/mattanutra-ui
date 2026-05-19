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
  it("keeps runtime code free of explicit app-level transactions", async () => {
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

      assert.deepEqual(
        actual.sort(),
        [],
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
      "claimExpiredReservationsBatch"
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
      /claimExpiredReservationsBatch[\s\S]*applyExpiredReservationFailure[\s\S]*updateExpiredFailureResultPayload[\s\S]*scheduleRetryForFailedTask/,
      "expired lease failure side effects and retry scheduling must run after the short expiry claim transaction"
    );
  });

  it("keeps expired reservation sweeps bounded inside the single claim statement", async () => {
    const source = await readFile("lib/task-service.ts", "utf8");
    const claimBody = functionBody(source, "claimExpiredReservationsBatch");

    assert.match(
      claimBody,
      /limit\s+\$\{batchLimit\}[\s\S]*for\s+update\s+skip\s+locked/i,
      "expired reservation release must claim a bounded batch while holding row locks"
    );
  });

  it("keeps common task lifecycle transitions out of explicit app transactions", async () => {
    const source = await readFile("lib/task-service.ts", "utf8");

    for (const functionName of [
      "releaseExpiredReservations",
      "reserveNextTask",
      "claimTaskCompletionApplication",
      "finalizeTaskCompletion",
      "renewTaskLease",
      "claimTaskFailureApplication",
      "finalizeTaskFailure",
      "retryFailedTask",
      "scheduleRetryForFailedTask"
    ]) {
      assert.equal(
        functionBody(source, functionName).includes("sql.begin"),
        false,
        `${functionName} should use single SQL statements plus eventual follow-up work, not an explicit app transaction`
      );
    }
  });

  it("keeps communication retry transaction-free", async () => {
    const source = await readFile("lib/communications.ts", "utf8");
    const claimBody = functionBody(source, "claimCommunicationRetry");
    const retryBody = functionBody(source, "retryCommunicationMessage");

    for (const sideEffect of [
      "ensurePlanIdentity",
      "seedKnownPlanChannels",
      "selectBestCommunicationChannel"
    ]) {
      assert.equal(
        claimBody.includes(sideEffect),
        false,
        `claimCommunicationRetry must not run ${sideEffect} during the atomic message status update`
      );
    }

    assert.match(
      retryBody,
      /ensurePlanIdentity[\s\S]*seedKnownPlanChannels[\s\S]*selectBestCommunicationChannel[\s\S]*claimCommunicationRetry/,
      "communication retry should prepare identity/channels before the atomic status update"
    );
    assert.equal(
      retryBody.includes("sql.begin"),
      false,
      "communication retry must not open an explicit app transaction"
    );
  });

  it("keeps row locks limited to short atomic claim paths", async () => {
    const allowedRowLocks = new Map<string, readonly string[]>([
      [
        "lib/task-service.ts",
        [
          "claimExpiredReservationsBatch",
          "reserveNextTask"
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

  it("keeps supplement safety limits append-only in runtime code", async () => {
    const files = [
      ...(await filesUnder("app")),
      ...(await filesUnder("lib")),
      ...(await filesUnder("workers"))
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");

      assert.equal(
        /\bupdate\s+public\.supplement_safety_limits\b/i.test(source),
        false,
        `${file} must append a new supplement safety limit version instead of updating history`
      );
    }

    const helper = await readFile(
      "lib/supplement-safety-limit-versions.ts",
      "utf8"
    );

    assert.match(
      helper,
      /insert\s+into\s+public\.supplement_safety_limits[\s\S]*coalesce\(max\(version\),\s*0\)\s*\+\s*1/i,
      "supplement safety limit changes should allocate a new version in one insert statement"
    );
  });

  it("keeps generated plan version allocation inside insert statements", async () => {
    const applier = await readFile("lib/task-result-applier.ts", "utf8");
    const reviewQueue = await readFile("lib/admin-review-queue.ts", "utf8");
    const helper = await readFile("lib/plan-version-writes.ts", "utf8");

    assert.equal(
      /select\s+coalesce\(max\(version\),\s*0\)\s+\+\s+1\s+as\s+version/i.test(applier),
      false,
      "task result appliers must not allocate formulation or food versions in a separate select"
    );
    assert.equal(
      /select\s+coalesce\(max\(version\),\s*0\)\s+\+\s+1\s+as\s+version/i.test(reviewQueue),
      false,
      "admin review decisions must not allocate formulation or food versions in a separate select"
    );
    assert.match(
      helper,
      /insert\s+into\s+public\.formulations[\s\S]*coalesce\(max\(version\),\s*0\)\s+\+\s+1/i,
      "formulation versions should be allocated by the insert statement"
    );
    assert.match(
      helper,
      /insert\s+into\s+public\.food_guidance[\s\S]*coalesce\(max\(version\),\s*0\)\s+\+\s+1/i,
      "food guidance versions should be allocated by the insert statement"
    );
  });

  it("keeps product version writes transaction-free and statement-atomic", async () => {
    const source = await readFile("lib/admin-products.ts", "utf8");
    const helper = functionBody(source, "recordProductVersion");

    assert.equal(
      helper.includes("sql.begin"),
      false,
      "product version writes must not open an explicit app transaction"
    );
    assert.equal(
      /max\s*\(\s*product_versions\.version\s*\)/i.test(helper),
      false,
      "product version writes should not allocate versions by scanning max(version)"
    );
    assert.match(
      helper,
      /with\s+next_product\s+as\s*\([\s\S]*update\s+public\.products[\s\S]*current_version\s*=\s*coalesce\(current_version,\s*0\)\s*\+\s*1[\s\S]*insert\s+into\s+public\.product_versions/i,
      "product version writes should increment the current projection and append the version in one SQL statement"
    );
  });

  it("keeps product fact replacement transaction-free and statement-atomic", async () => {
    const source = await readFile("lib/admin-products.ts", "utf8");
    const helper = functionBody(source, "replaceProductFacts");

    assert.equal(
      helper.includes("sql.begin"),
      false,
      "product fact replacement must not open an explicit app transaction"
    );
    assert.equal(
      /for\s*\(\s*const\s+fact\s+of\s+facts\s*\)/.test(helper),
      false,
      "product fact replacement should not hold many per-fact statements"
    );
    assert.match(
      helper,
      /with\s+deleted\s+as\s*\([\s\S]*delete\s+from\s+public\.product_facts[\s\S]*jsonb_to_recordset[\s\S]*insert\s+into\s+public\.product_facts/i,
      "product fact replacement should delete and insert facts in one SQL statement"
    );
  });
});
