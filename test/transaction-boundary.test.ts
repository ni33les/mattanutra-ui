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
    ...prefix.matchAll(
      /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\s*\(/g
    ),
    ...prefix.matchAll(/\basync\s+([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\s*\(/g)
  ].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));

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
    const allowedBegins = new Map<string, readonly string[]>([
      ["lib/prd-live-catalogue-sync.ts", ["runPrdLiveCatalogueSync"]],
      ["lib/db.ts", ["withLocalStatementTimeout", "withDatabaseTransaction"]]
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

      assert.deepEqual(
        actual.sort(),
        [...(allowedBegins.get(file) ?? [])].sort(),
        `${file} has unexpected explicit sql.begin call sites`
      );
    }
  });

  it("keeps result persistence within bounded phases and external effects after commit", async () => {
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
      "result persistence must run between claim and finalization within the bounded database phase"
    );
    assert.match(
      functionBody(source, "failTask"),
      /claimTaskFailureApplication[\s\S]*input\.applyFailure[\s\S]*finalizeTaskFailure[\s\S]*scheduleRetryForFailedTask/,
      "failure persistence precedes finalization and retry scheduling follows it"
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
      /limit\s+\$\{batchLimit\}[\s\S]*for\s+update\s+of\s+tasks\s+skip\s+locked/i,
      "expired reservation release must claim a bounded batch while locking tasks before reservations"
    );
    assert.match(
      claimBody,
      /invalid_active_reservation/,
      "expired reservation release must also clear orphaned active reservations that block queued tasks"
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
    const source = await readFile("lib/communications-dispatch.ts", "utf8");
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

  it("keeps row locks limited to reviewed claim and revision-fencing paths", async () => {
    const { scanLockSites, verifyLockSites } = await import("../scripts/service-efficiency/lock-register.mjs");
    const register = JSON.parse(await readFile("test/service-efficiency/lock-register.json", "utf8"));
    const sites = scanLockSites(process.cwd());
    assert.ok(sites.length > 15, "Lock discovery must include shared consumers and SQL triggers");
    assert.deepEqual(verifyLockSites(sites, register), []);
    for (const owner of ["getOpenOrderForPlanRevision", "getActiveOrderForPlanRevision", "getAssessmentProductPreferences"])
      assert.ok(sites.every(site => site.owner !== owner), `${owner} is an ordinary read and must not lock`);
  });

  it("keeps audited advisory cache refresh scoped, serialized and free of external effects", async () => {
    const source = await readFile("lib/product-advisory-cache-refresh.ts", "utf8");
    const refresh = functionBody(source, "refreshApprovedAdvisoryCaches");
    const readState = functionBody(source, "readState");
    const prepare = functionBody(source, "prepareApprovedAdvisoryCaches");
    const caller = await readFile("scripts/refresh-advisory-product-caches.ts", "utf8");
    assert.match(refresh, /show transaction_isolation[\s\S]*transaction_isolation !== "serializable"[\s\S]*throw new Error/);
    assert.match(refresh, /for \(const row of prepared\.entries\)[\s\S]*for update nowait[\s\S]*insert into public\.catalogue_correction_audit[\s\S]*catalogue_runtime_revision where singleton=true for update/,
      "prepared product mutations precede the final catalogue fence; dry runs do not lock");
    assert.match(refresh, /p is not distinct from jsonb_populate_record[\s\S]*update public\.products[\s\S]*insert into public\.catalogue_correction_audit/,
      "publication compares the exact prepared native row, writes cached validation and appends the prepared audit atomically");
    assert.match(prepare, /manifest\.entries\]\.sort/);
    assert.match(prepare, /readState[\s\S]*afterFingerprint: catalogueRecordFingerprint/);
    const protectedWork = refresh.slice(refresh.indexOf("if (apply && prepared.entries.length)"));
    assert.doesNotMatch(protectedWork, /readState\(|loadProductRows\(|refreshAndPersistProductValidation\(|catalogueRecordFingerprint\(/,
      "fact loading, validation and hash preparation must finish before the writer fence");
    for (const body of [refresh, readState, prepare]) assert.doesNotMatch(body,
      /\b(?:fetch|send\w*Email|queue\w*Email|createTask|flushMatchingCatalogueCaches)\s*\(|\.begin\s*\(/);
    assert.match(readState, /loadProductRows\(productId, \{ sql \}\)/);
    assert.match(caller, /await prepareApprovedAdvisoryCaches\(sql, manifest\)[\s\S]*await transaction\(!apply, tx => refreshApprovedAdvisoryCaches\(tx, manifest, apply, prepared\)\)/,
      "the production caller prepares before opening its mutation transaction");
    assert.match(caller, /sql\.begin\(readOnly \? "isolation level serializable read only" : "isolation level serializable"/);
    assert.match(caller, /SET LOCAL statement_timeout = '15s'; SET LOCAL lock_timeout = '2s'; SET LOCAL idle_in_transaction_session_timeout = '10s'[\s\S]*return work\(tx\)/,
      "the rollout caller must establish statement, lock and idle bounds before any reviewed work");
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

    const runtimeFiles = [
      ...(await filesUnder("app")),
      ...(await filesUnder("lib")),
      ...(await filesUnder("workers"))
    ];

    for (const file of runtimeFiles) {
      const runtimeSource = await readFile(file, "utf8");

      assert.equal(
        /\bpg_advisory(?:_xact)?_lock\s*\(/i.test(runtimeSource),
        false,
        `${file} must not use runtime advisory locks; use statement-atomic writes`
      );
    }
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
      /current_formulation_version = counters\.current_formulation_version \+ 1[\s\S]*insert\s+into\s+public\.formulations/i,
      "formulation versions should bump the plan counter then insert in one statement"
    );
    assert.match(
      helper,
      /current_food_guidance_version = counters\.current_food_guidance_version \+ 1[\s\S]*insert\s+into\s+public\.food_guidance/i,
      "food guidance versions should bump the plan counter then insert in one statement"
    );
  });

  it("keeps assessment version allocation on a single projection row", async () => {
    const helper = functionBody(
      await readFile("lib/domain-versions.ts", "utf8"),
      "appendAssessmentVersion"
    );

    assert.equal(
      helper.includes("sql.begin"),
      false,
      "assessment version writes must not open an explicit app transaction"
    );
    assert.equal(
      /select\s+max\(\s*version\s*\)/i.test(helper),
      false,
      "assessment versions must not allocate by scanning max(version)"
    );
    assert.match(
      helper,
      /current_version = counters\.current_version \+ 1[\s\S]*insert\s+into\s+public\.assessment_versions/i,
      "assessment versions should bump assessment_version_counters then insert in one statement"
    );
  });

  it("keeps reserve claims free of work-item hydrate and nested existence locks", async () => {
    const source = await readFile("lib/task-service.ts", "utf8");
    const reserveBody = functionBody(source, "reserveNextTask");
    const claimBody = functionBody(source, "claimQueuedTaskRow");

    assert.equal(
      reserveBody.includes("buildTaskWorkItem"),
      false,
      "reserveNextTask must not hydrate work items"
    );
    assert.equal(
      reserveBody.includes("enqueueMissingProductRecommendations"),
      false,
      "reserveNextTask must not enqueue missing recommendations"
    );
    assert.match(
      claimBody,
      /for\s+update\s+of\s+tasks\s+skip\s+locked/i,
      "queued task claim must lock only the tasks row"
    );
    assert.equal(
      /not exists \([\s\S]*task_dependencies/i.test(claimBody),
      false,
      "dependency checks must run after the short claim statement"
    );
    assert.doesNotMatch(
      claimBody,
      /started_at = coalesce/,
      "claim must not stamp started_at before dependencies are checked"
    );
    const confirmBody = functionBody(source, "confirmTaskReservation");
    const releaseBody = functionBody(source, "releaseUncommittedClaim");
    assert.match(
      confirmBody,
      /started_at = coalesce\(public\.tasks\.started_at, now\(\)\)/,
      "started_at should be set only after a reservation is confirmed"
    );
    assert.match(
      releaseBody,
      /started_at = null/,
      "blocked claims must clear started_at so matching does not look reserved before formula"
    );
    const blockedBody = functionBody(source, "claimedTaskIsBlocked");
    const peekBody = functionBody(source, "listQueuedTaskHeads");
    assert.match(
      blockedBody,
      /generate_product_recommendations[\s\S]*from public\.formulations/,
      "matching claims must stay blocked until a non-example formula exists even if the dep row is missing"
    );
    assert.match(
      peekBody,
      /generate_product_recommendations[\s\S]*from public\.formulations/,
      "matching peek must not advertise a head until a non-example formula exists"
    );
    const retryBody = functionBody(source, "scheduleRetryForFailedTaskFromRecord");
    assert.match(
      retryBody,
      /dependsOnTaskId[\s\S]*type: "successful"/,
      "matching retries must copy payload.dependsOnTaskId so they stay behind formula"
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

  it("keeps payment state and version writes statement-atomic", async () => {
    const source = await readFile("lib/stripe-payments.ts", "utf8");
    const updateHelper = functionBody(source, "updatePaymentState");
    const insertHelper = functionBody(source, "insertPayment");

    assert.equal(
      /pg_advisory(?:_xact)?_lock\s*\(/i.test(source),
      false,
      "payment versioning must not use runtime advisory locks"
    );
    assert.equal(
      updateHelper.includes("recordPaymentVersion"),
      false,
      "payment updates must not append versions in a separate helper call"
    );
    assert.match(
      updateHelper,
      /with\s+updated_payment\s+as\s*\([\s\S]*update\s+public\.payments[\s\S]*appended_version\s+as\s*\([\s\S]*insert\s+into\s+public\.payment_versions[\s\S]*select\s+updated_payment\.\*/i,
      "payment updates should update the projection and append the version in one SQL statement"
    );
    assert.match(
      insertHelper,
      /with\s+inserted_payment\s+as\s*\([\s\S]*insert\s+into\s+public\.payments[\s\S]*appended_version\s+as\s*\([\s\S]*insert\s+into\s+public\.payment_versions[\s\S]*select\s+inserted_payment\.\*/i,
      "payment creation should insert the projection and initial version in one SQL statement"
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
