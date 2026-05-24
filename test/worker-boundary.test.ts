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

describe("external worker boundaries", () => {
  it("does not wake an internal task worker from app routes", async () => {
    const appFiles = await filesUnder("app");

    for (const file of appFiles) {
      const source = await readFile(file, "utf8");

      assert.equal(
        source.includes("kickTaskWorker"),
        false,
        `${file} must not import or call kickTaskWorker`
      );
      assert.equal(
        source.includes("kickCronWorker"),
        false,
        `${file} must not use worker-style cron queue naming`
      );
    }
  });

  it("keeps worker runtime out of platform internals", async () => {
    const workerFiles = await filesUnder("workers");
    const forbidden = [
      "../app/",
      "../lib/db",
      "../lib/task-result-applier",
      "../lib/task-service"
    ];

    for (const file of workerFiles) {
      const source = await readFile(file, "utf8");

      for (const pattern of forbidden) {
        assert.equal(
          source.includes(pattern),
          false,
          `${file} must not import ${pattern}`
        );
      }
    }
  });

  it("keeps worker:all registered as real agents, not an aggregate runtime", async () => {
    const source = await readFile("workers/runner.ts", "utf8");

    assert.equal(
      source.includes("MattaNutra External Worker"),
      false,
      "worker:all must not register a fake aggregate agent"
    );
    assert.equal(
      source.includes("allProfile"),
      false,
      "worker:all must run the real agent profiles directly"
    );
    assert.match(
      source,
      /runSupervisedAgentLoop\(\s*profileMode,\s*config,\s*slotIndex,\s*concurrency,/,
      "worker:all must supervise each real agent profile independently"
    );
    assert.match(
      source,
      /workerConcurrency\(profileMode\)/,
      "worker:all must apply real per-profile concurrency slots"
    );
    assert.match(
      source,
      /WORKER_PROFILE_MODES[\s\S]*"advisor"[\s\S]*"formulation"[\s\S]*"healthscore"[\s\S]*"products"/,
      "worker:all must include every active customer task profile"
    );
    assert.match(
      source,
      /formulation:\s*agentProfile\("formulationWorker",\s*\[[\s\S]*"generate_supplement_guidance"[\s\S]*\]\)/,
      "formulation workers must explicitly claim formulation tasks"
    );
    assert.match(
      source,
      /healthscore:\s*agentProfile\("healthScoreEngine",\s*\[\s*"analyze_healthscore"\s*\]\)/,
      "healthscore workers must explicitly claim healthscore tasks"
    );
    assert.match(
      source,
      /WORKER_\$\{[a-zA-Z]+\.toUpperCase\(\)\}_CONCURRENCY/,
      "workers must allow profile-specific concurrency overrides"
    );
    assert.equal(
      source.includes("Promise.all(modes.map((profileMode) => runAgentLoop"),
      false,
      "worker:all must not allow one crashed agent loop to stop every agent"
    );
    assert.match(
      source,
      /task lease renewal/,
      "agent task lease renewals must be retried and logged"
    );
  });

  it("loads local env before starting platform workers", async () => {
    const platformSource = await readFile("scripts/start-platform.mjs", "utf8");
    const runnerSource = await readFile("workers/runner.ts", "utf8");

    assert.match(
      platformSource,
      /nextEnv\.loadEnvConfig\(process\.cwd\(\)\)/,
      "start:platform must load .env.local before checking WORKER_API_TOKEN and spawning workers"
    );
    assert.match(
      runnerSource,
      /nextEnv\.loadEnvConfig\(process\.cwd\(\)\)/,
      "direct worker commands must load .env.local before registering with the worker API"
    );
  });

  it("keeps reservation constrained by the registered worker session", async () => {
    const source = await readFile("lib/task-service.ts", "utf8");
    const alertsSource = await readFile("lib/admin-technical.ts", "utf8");

    assert.match(
      source,
      /registeredTaskTypes/,
      "task reservation must retain the worker session task type envelope"
    );
    assert.match(
      source,
      /reserveCapabilities/,
      "task reservation must retain the worker session capability envelope"
    );
    assert.match(
      source,
      /tasks\.required_capabilities <@ \$\{reserveCapabilities\}::text\[\]/,
      "task reservation must match tasks against session-scoped capabilities"
    );
    assert.match(
      alertsSource,
      /tasks\.required_capabilities <@ worker_sessions\.capabilities[\s\S]*and tasks\.required_capabilities <@ agents\.capabilities/,
      "worker availability alerts must use the same session-plus-agent capability envelope"
    );
    assert.match(
      source,
      /leaseSeconds: 180/,
      "default worker leases should release crashed sessions quickly"
    );
    assert.equal(
      /ensureWorkerSessionSchema[\s\S]*alter table public\.worker_sessions/.test(source),
      false,
      "worker startup must not run owner-only worker_sessions schema migrations"
    );
    assert.equal(
      /ensureWorkerSessionSchema[\s\S]*create table if not exists public\.worker_sessions/.test(source),
      false,
      "worker startup must not create worker_sessions at runtime"
    );
  });

  it("keeps interactive worker pickup on a fast reserve poll", async () => {
    const source = await readFile("app/api/tasks/reserve/route.ts", "utf8");
    const visibilityEventsSource = await readFile(
      "app/api/admin/visibility/events/route.ts",
      "utf8"
    );
    const adminSseSource = await readFile("lib/admin-sse.ts", "utf8");
    const taskWorkerSource = await readFile("lib/task-worker.ts", "utf8");
    const serviceSource = await readFile("lib/task-service.ts", "utf8");
    const runnerSource = await readFile("workers/runner.ts", "utf8");

    assert.match(
      source,
      /INTERACTIVE_TASK_TYPES[\s\S]*analyze_healthscore[\s\S]*generate_supplement_guidance/,
      "blocking UI task types must be on the interactive reserve path"
    );
    assert.match(
      source,
      /INTERACTIVE_TASK_TYPES[\s\S]*generate_product_recommendations/,
      "product matching must be on the interactive reserve path because the refine page waits for it"
    );
    assert.match(
      source,
      /waitForTaskQueueChange/,
      "long-polling workers should wake immediately when the task queue changes"
    );
    assert.match(
      source,
      /buildTaskWorkItem[\s\S]*failTask[\s\S]*continue;/,
      "a malformed reserved task should be failed and skipped without turning reserve into a worker-visible 500"
    );
    assert.match(
      serviceSource,
      /notifyTaskQueueChanged\(\)/,
      "task creation should notify waiting workers without constant DB polling"
    );
    assert.match(
      visibilityEventsSource,
      /waitForSnapshotSignal: waitForTaskQueueChange/,
      "admin task visibility should refresh when the queue changes, not wait for the fallback snapshot interval"
    );
    assert.match(
      adminSseSource,
      /waitForSnapshotSignal/,
      "admin SSE streams should support event-driven refreshes"
    );
    assert.equal(
      /await client\.heartbeat\(\{[\s\S]*status: "polling"[\s\S]*reserved = await client\.reserve/.test(runnerSource),
      false,
      "workers should not send a redundant polling heartbeat before every reserve call"
    );
    assert.match(
      source,
      /INTERACTIVE_RESERVE_POLL_INTERVAL_MS = 1_000/,
      "interactive fallback polling should keep user-visible tasks responsive"
    );
    assert.equal(
      /INTERACTIVE_TASK_TYPES[\s\S]*generate_example_supplement_guidance/.test(source),
      false,
      "free example nutrition plan tasks must stay off the interactive path because they do not block UX"
    );
    assert.match(
      taskWorkerSource,
      /exampleFormulation: 150/,
      "free example formulation must remain a low-value background task"
    );
    assert.equal(
      /exampleFoodGuidance|generate_example_food_guidance|generate_food_guidance/.test(taskWorkerSource),
      false,
      "food guidance tasks must stay out of the active customer worker chain"
    );
  });

  it("uses supplement guidance task names in active runtime code", async () => {
    const activeFiles = [
      ...(await filesUnder("app")),
      ...(await filesUnder("components")),
      ...(await filesUnder("lib")),
      ...(await filesUnder("workers")),
      "package.json"
    ];
    const oldTaskTypes = [
      "generate_formulation",
      "generate_example_formulation"
    ];

    for (const file of activeFiles) {
      const source = await readFile(file, "utf8");

      for (const taskType of oldTaskTypes) {
        assert.equal(
          source.includes(taskType),
          false,
          `${file} must use the supplement guidance task type name instead of ${taskType}`
        );
      }
    }

    const schemaSource = await readFile("db-schema.sql", "utf8");

    for (const taskType of oldTaskTypes) {
      assert.equal(
        schemaSource.includes(taskType),
        false,
        `db-schema.sql should not keep legacy ${taskType} compatibility rewrites`
      );
    }
  });

  it("does not leave assessments queued when successful formulation work is reused", async () => {
    const source = await readFile("lib/task-worker.ts", "utf8");

    assert.match(
      source,
      /SUCCESSFUL_TASK_REUSE_STATUSES/,
      "formulation enqueueing must explicitly handle reused successful tasks"
    );
    assert.match(
      source,
      /status = \$\{formulationReady \? "ready" : "failed"\}::public\.assessment_status/,
      "reused successful supplement plan work must resolve the assessment instead of leaving it queued"
    );
  });

  it("refreshes paid nutrition readiness after overlapping completion transactions commit", async () => {
    const source = await readFile("lib/task-result-applier.ts", "utf8");

    assert.match(
      source,
      /refreshPaidNutritionReadinessAfterCommit/,
      "paid supplement completion must re-check readiness after commit"
    );
    assert.match(
      source,
      /post_commit_readiness_refresh/,
      "post-commit readiness repair should be visible in task events"
    );
    assert.match(
      source,
      /formulation_completion[\s\S]*queueProductRecommendationsForReadyPlan/,
      "product recommendations should be queued immediately once paid supplement guidance is ready"
    );
  });

  it("keeps checkout pre-generation hidden until paid selection is adopted", async () => {
    const taskWorker = await readFile("lib/task-worker.ts", "utf8");
    const workItems = await readFile("lib/task-work-items.ts", "utf8");
    const applier = await readFile("lib/task-result-applier.ts", "utf8");

    assert.match(
      taskWorker,
      /PAYMENT_CHECKOUT_PREGENERATION_SOURCE/,
      "checkout pre-generation should use a distinct task source"
    );
    assert.match(
      workItems,
      /!isCheckoutPregeneration[\s\S]*assessment_status_projection_update/,
      "checkout pre-generation formulation tasks must not mark unpaid assessments preparing"
    );
    assert.match(
      applier,
      /isCheckoutPregeneration[\s\S]*return;/,
      "checkout pre-generation completion must leave customer visibility gated until payment adoption"
    );
  });

  it("keeps worker execution modules free of static platform imports", async () => {
    const workerExecutionFiles = [
      "lib/finance-ledger.ts",
      "lib/formulation-analysis.ts",
      "lib/health-score-analysis.ts",
      "lib/smtp-email.ts",
      "lib/task-execution.ts"
    ];
    const forbiddenStaticImports = [
      /from\s+["']@\/lib\/db["']/,
      /from\s+["']\.\/db(?:\.ts)?["']/,
      /from\s+["']next\//,
      /from\s+["']@\/lib\/task-result-applier["']/,
      /from\s+["']@\/lib\/task-service["']/
    ];

    for (const file of workerExecutionFiles) {
      const source = await readFile(file, "utf8");

      for (const pattern of forbiddenStaticImports) {
        assert.equal(
          pattern.test(source),
          false,
          `${file} must not statically import platform-only code`
        );
      }
    }
  });
});
