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
      /WORKER_RUN_ID = randomUUID\(\)/,
      "worker sessions must carry a run id so sibling deployments do not share session identity"
    );
    assert.match(
      source,
      /return `\$\{base\}:\$\{WORKER_RUN_ID\}:\$\{mode\}\$\{slotSuffix\}`/,
      "worker instance ids must be unique per process run during rolling deploys"
    );
    assert.match(
      source,
      /metadata: \{[\s\S]*profileMode: mode[\s\S]*runId: WORKER_RUN_ID/,
      "worker registration must send profile metadata for freshness reconciliation"
    );
    assert.match(
      source,
      /WORKER_PROFILE_MODES[\s\S]*"advisor"[\s\S]*"food"[\s\S]*"formulation"[\s\S]*"healthscore"[\s\S]*"products"/,
      "worker:all must include every active customer task profile"
    );
    assert.match(
      source,
      /food:\s*agentProfile\("foodGuidanceWorker",\s*\[\s*"generate_food_gap_guidance"\s*\]\)/,
      "food workers must explicitly claim the post-product food gap task"
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
      "start:platform must load .env.local before checking profile agent keys and spawning workers"
    );
    assert.match(
      runnerSource,
      /nextEnv\.loadEnvConfig\(process\.cwd\(\)\)/,
      "direct worker commands must load .env.local before registering with the worker API"
    );
    assert.doesNotMatch(
      `${platformSource}\n${runnerSource}`,
      /WORKER_API_TOKEN/,
      "worker runtime startup must not fall back to the legacy shared worker token"
    );
    assert.match(
      runnerSource,
      /WORKER_\$\{mode\.toUpperCase\(\)\}_AGENT_API_KEY/,
      "each worker profile must use its own DB-managed agent credential"
    );
    assert.match(
      platformSource,
      /web is running without platform workers/,
      "missing worker credentials must not prevent the web service from booting"
    );
  });

  it("keeps reservation constrained by the registered worker session", async () => {
    const source = await readFile("lib/task-service.ts", "utf8");
    const agentsSource = await readFile("lib/task-service-agents.ts", "utf8");
    const workerSessionSource = `${source}\n${agentsSource}`;
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
      source,
      /join public\.organisations task_organisations[\s\S]*task_organisations\.id = tasks\.organisation_id/,
      "task reservation must join the task organisation before selecting work"
    );
    assert.match(
      source,
      /\$\{accessScope\.role\}::text = 'platform_agent'[\s\S]*task_organisations\.organisation_type = 'platform'/,
      "platform agents must only reserve platform organisation tasks"
    );
    assert.match(
      source,
      /\$\{accessScope\.role\}::text = 'retail_agent'[\s\S]*task_organisations\.organisation_type = 'tenant'[\s\S]*tasks\.organisation_id = \$\{accessScope\.organisationId\}::uuid/,
      "retail agents must only reserve tasks for their own retail organisation"
    );
    assert.match(
      source,
      /organisation_id = \$\{organisationId\}::uuid/,
      "task idempotency lookups must be scoped to the resolved organisation"
    );
    assert.match(
      source,
      /membership_id,\s*worker_session_id/,
      "task reservations must persist the executing membership"
    );
    assert.match(
      agentsSource,
      /on conflict \(membership_id, instance_id\)/,
      "worker sessions must be unique per agent membership and runtime instance"
    );
    assert.match(
      agentsSource,
      /intersectCapabilities\(accessScope\.capabilities, requestedCapabilities\)/,
      "request bodies must not broaden DB-authenticated agent capabilities"
    );
    assert.match(
      alertsSource,
      /tasks\.required_capabilities <@ worker_sessions\.capabilities[\s\S]*and tasks\.required_capabilities <@ agents\.capabilities/,
      "worker availability alerts must use the same session-plus-agent capability envelope"
    );
    assert.match(
      agentsSource,
      /last_seen_at < now\(\) - interval '2 minutes'/,
      "worker registration should only mark genuinely stale sibling sessions offline"
    );
    assert.match(
      agentsSource,
      /status <> 'offline' or \$\{status\} = 'offline'/,
      "offline worker sessions must not be revived by stale heartbeats"
    );
    assert.match(
      agentsSource,
      /leaseSeconds: 180/,
      "default worker leases should release crashed sessions quickly"
    );
    assert.equal(
      /ensureWorkerSessionSchema[\s\S]*alter table public\.worker_sessions/.test(workerSessionSource),
      false,
      "worker startup must not run owner-only worker_sessions schema migrations"
    );
    assert.equal(
      /ensureWorkerSessionSchema[\s\S]*create table if not exists public\.worker_sessions/.test(workerSessionSource),
      false,
      "worker startup must not create worker_sessions at runtime"
    );
  });

  it("keeps interactive worker pickup on a fast reserve poll", async () => {
    const source = await readFile("app/api/tasks/reserve/route.ts", "utf8");
    const completeRouteSource = await readFile(
      "app/api/tasks/[id]/complete/route.ts",
      "utf8"
    );
    const failRouteSource = await readFile(
      "app/api/tasks/[id]/fail/route.ts",
      "utf8"
    );
    const visibilityEventsSource = await readFile(
      "app/api/admin/visibility/events/route.ts",
      "utf8"
    );
    const adminSseSource = await readFile("lib/admin-sse.ts", "utf8");
    const taskWorkerSource = await readFile("lib/task-worker.ts", "utf8");
    const taskResultApplierSource = await readFile(
      "lib/task-result-applier.ts",
      "utf8"
    );
    const serviceSource = await readFile("lib/task-service.ts", "utf8");
    const runnerSource = await readFile("workers/runner.ts", "utf8");

    assert.match(
      source,
      /INTERACTIVE_TASK_TYPES[\s\S]*analyze_healthscore[\s\S]*generate_food_gap_guidance[\s\S]*generate_supplement_guidance/,
      "blocking UI task types must be on the interactive reserve path"
    );
    assert.equal(
      /INTERACTIVE_TASK_TYPES[\s\S]*generate_food_guidance/.test(source),
      false,
      "legacy food guidance must stay off the interactive reserve path"
    );
    assert.match(
      source,
      /INTERACTIVE_TASK_TYPES[\s\S]*generate_product_recommendations/,
      "product matching must be on the interactive reserve path because the reveal page waits for it"
    );
    assert.match(
      source,
      /waitForTaskQueueChange/,
      "long-polling workers should wake immediately when the task queue changes"
    );
    assert.match(source, /eventName: "task_reserved"/);
    assert.match(completeRouteSource, /eventName: "task_completed"/);
    assert.match(failRouteSource, /eventName: "task_failed"/);
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
      serviceSource,
      /initialScheduledFor[\s\S]*hasDependencyInputs[\s\S]*DEPENDENCY_BOOTSTRAP_DELAY_MS/,
      "dependent tasks must not be reservable before dependency rows have been inserted"
    );
    assert.match(
      serviceSource,
      /ensureTaskDependencies\(sql, task\.id, dependencies\)[\s\S]*set scheduled_for = \$\{intendedScheduledFor\}/,
      "dependent tasks should restore their intended schedule only after dependency rows exist"
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
    const assessmentPregenerationSource = taskWorkerSource.slice(
      taskWorkerSource.indexOf("export async function enqueueAssessmentPregenerationTasks"),
      taskWorkerSource.indexOf("export async function enqueueNutritionPlanTasks")
    );
    const paidPlanSource = taskWorkerSource.slice(
      taskWorkerSource.indexOf("export async function enqueueNutritionPlanTasks"),
      taskWorkerSource.indexOf("export async function enqueuePaymentCheckoutPregenerationTasks")
    );
    const checkoutPregenerationSource = taskWorkerSource.slice(
      taskWorkerSource.indexOf("export async function enqueuePaymentCheckoutPregenerationTasks"),
      taskWorkerSource.indexOf("export async function enqueueFormulationTask")
    );
    assert.match(
      assessmentPregenerationSource,
      /enqueueHealthScoreAnalysisTask[\s\S]*generate_supplement_guidance[\s\S]*enqueueProductRecommendationsTask[\s\S]*enqueueFoodGapSupportTask/,
      "assessment capture should prequeue the single HealthScore, supplement, product, and food-gap graph"
    );
    assert.match(
      taskWorkerSource,
      /activeTaskRows[\s\S]*task_type = 'analyze_healthscore'[\s\S]*status in \([\s\S]*'queued'[\s\S]*'reserved'[\s\S]*'waiting_approval'[\s\S]*if \(activeTaskRows\[0\]\) \{[\s\S]*return null;/,
      "HealthScore status polling must not enqueue a second HealthScore while the first AI copy task is still active"
    );
    assert.equal(
      /taskType: "generate_food_guidance"/.test(assessmentPregenerationSource),
      false,
      "assessment capture must not prequeue legacy food guidance"
    );
    assert.match(
      assessmentPregenerationSource,
      /enqueueFoodGapSupportTask\(\{[\s\S]*dependsOnTaskId: productRecommendationTaskId/,
      "assessment capture should queue food-gap support early behind product matching"
    );
    assert.equal(
      /enqueueNutritionReportTask/.test(assessmentPregenerationSource),
      false,
      "assessment capture must not prequeue a separate nutrition report task"
    );
    assert.match(
      paidPlanSource,
      /enqueueProductRecommendationsTask\(\{[\s\S]*dependsOnTaskId: readiness\.formulationReady \? null : formulationTaskId/,
      "paid plan adoption should queue product matching early behind formulation when needed"
    );
    assert.equal(
      /enqueueNutritionReportTask/.test(paidPlanSource),
      false,
      "paid plan adoption must not queue a separate nutrition report task"
    );
    assert.equal(
      /taskType: "generate_food_guidance"/.test(checkoutPregenerationSource),
      false,
      "checkout pre-generation must not queue legacy food guidance"
    );
    assert.equal(
      /enqueueNutritionReportTask/.test(checkoutPregenerationSource),
      false,
      "checkout pre-generation must not queue a separate nutrition report task"
    );
    assert.match(
      taskWorkerSource,
      /dependsOnTaskId: formulationTaskId[\s\S]*parentTaskId: formulationTaskId/,
      "assessment product matching must be queued immediately but depend on supplement generation"
    );
    assert.match(
      taskWorkerSource,
      /dependencies: dependencyTaskId[\s\S]*type: "successful"/,
      "pending product matching must use task dependencies so reservation stays blocked until supplement success"
    );
    assert.match(
      taskWorkerSource,
      /product_recommendation_runs[\s\S]*generated_at >= greatest/,
      "late product-matching enqueue points must not create duplicate runs when current recommendations already exist"
    );
    assert.equal(
      /refreshHealthScoreProductSubtraction[\s\S]*enqueueHealthScoreAnalysisTask/.test(
        taskResultApplierSource
      ),
      false,
      "product readiness must update locked HealthScore subtraction without queuing a second HealthScore AI task"
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

  it("adopts matching pregenerated nutrition outputs without leaving paid plans queued", async () => {
    const source = await readFile("lib/task-worker.ts", "utf8");

    assert.match(
      source,
      /nutritionOutputReadiness\([\s\S]*sql,[\s\S]*planId,[\s\S]*reusableInputHashes[\s\S]*\)/,
      "paid nutrition enqueueing must explicitly check reusable pregenerated outputs"
    );
    assert.match(
      source,
      /const status = nutritionReady \? "ready" : "queued"/,
      "reused supplement output must resolve the paid assessment instead of leaving it queued"
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
      /!isBackgroundPregeneration[\s\S]*assessment_status_projection_update/,
      "background pre-generation formulation tasks must not mark unpaid assessments preparing"
    );
    assert.match(
      applier,
      /isBackgroundPregeneration[\s\S]*return;/,
      "background pre-generation completion must leave customer visibility gated until payment adoption"
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
