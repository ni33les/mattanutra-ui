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
    const start = service.indexOf("const QUEUED_HEADS_PER_TYPE");
    const peek = service.slice(start, start + 2400);

    assert.match(service, /QUEUED_HEADS_PER_TYPE = 8/);
    assert.match(peek, /partition by task_type/);
    assert.match(peek, /type_rank <= \$\{QUEUED_HEADS_PER_TYPE\}/);
    assert.match(peek, /task_dependencies/);
    assert.match(peek, /dependency_type = 'successful'/);
    assert.doesNotMatch(peek, /for update/i);
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
    assert.match(runner, /maxClaimAttempts = 3/);
    assert.match(runner, /ids\.slice\(0, maxClaimAttempts\)/);
    assert.match(runner, /signaledTypes/);
    assert.match(
      runner,
      /signalTaskQueue\(\{\s*taskType: task\.taskType\s*\}\)/
    );
    assert.doesNotMatch(
      runner.slice(runner.indexOf("async function peekQueuedWork")),
      /signalTaskQueue\(\{[\s\S]*taskId: task\.taskId/
    );
  });

  it("does not wake all workers after a reserve or typeless ping", async () => {
    const service = await readFile("lib/task-service.ts", "utf8");
    const wake = await readFile("lib/worker-wake.ts", "utf8");
    const start = service.indexOf("export async function reserveNextTask");
    const end = service.indexOf("async function claimTaskCompletionApplication");
    const reserve = service.slice(start, end > start ? end : start + 4000);

    assert.doesNotMatch(reserve, /notifyTaskQueueChanged/);
    assert.match(wake, /if \(!taskType\) \{\s*return/);
  });

  it("binds communication schema table names with sql.array", async () => {
    const source = await readFile("lib/communications-shared.ts", "utf8");

    assert.match(
      source,
      /table_name = any\(\$\{textArray\(sql, Object\.keys\(requiredColumns\)\)\}::text\[\]\)/
    );
    assert.doesNotMatch(
      source,
      /table_name = any\(\$\{Object\.keys\(requiredColumns\)\}::text\[\]\)/
    );
  });

  it("listens on the platform and HTTP-pings registered worker wake URLs", async () => {
    const [instrumentation, wake, wakeup] = await Promise.all([
      readFile("instrumentation.ts", "utf8"),
      readFile("lib/worker-wake.ts", "utf8"),
      readFile("lib/task-wakeup.ts", "utf8")
    ]);

    assert.match(instrumentation, /subscribeTaskQueue\(\)/);
    assert.match(instrumentation, /startTaskMaintenanceLoop/);
    assert.match(instrumentation, /keepPlanPathWarm/);
    assert.doesNotMatch(instrumentation, /warmAgenticCatalogue/);
    assert.match(wake, /metadata ->> 'wakeUrl'/);
    assert.match(wake, /method: "POST"/);
    assert.match(wakeup, /pingRegisteredWorkerWakes/);
  });

  it("loads MCP catalogue on the interactive pool, not a second worker pool", async () => {
    const [live, search, readModel, market] = await Promise.all([
      readFile("lib/agentic/catalogue/live.ts", "utf8"),
      readFile("lib/admin-product-search.ts", "utf8"),
      readFile("lib/admin-product-read-model.ts", "utf8"),
      readFile("lib/agentic/catalogue/market.ts", "utf8")
    ]);

    assert.doesNotMatch(live, /getWorkerSql/);
    assert.doesNotMatch(market, /getWorkerSql/);
    assert.match(live, /return getSql\(\)/);
    assert.match(live, /WARM_FAILURE_BACKOFF_MS = 5 \* 60_000/);
    assert.match(live, /code === "57014"/);
    assert.match(search, /loadProductRows\(null, \{ productIds: retailProductIds, sql \}\)/);
    assert.match(readModel, /sql\?: postgres\.Sql/);
    assert.match(readModel, /options\.sql \?\? getSql\(\)/);
  });

  it("does not open a worker pool or warm the catalogue at first-hit", async () => {
    const [db, mcpRoute, rpc, info, lineToken] = await Promise.all([
      readFile("lib/db.ts", "utf8"),
      readFile("app/api/mcp/route.ts", "utf8"),
      readFile("lib/agentic/mcp/rpc.ts", "utf8"),
      readFile("lib/agentic/info.ts", "utf8"),
      readFile("lib/communications-organisation.ts", "utf8")
    ]);
    const listenStart = db.indexOf("export async function prepareListenConnection");
    const listen = db.slice(listenStart, listenStart + 800);
    const tokenStart = lineToken.indexOf(
      "export async function createCustomerLineConnectToken"
    );
    const token = lineToken.slice(tokenStart, tokenStart + 1800);

    assert.match(listen, /const sql = getSql\(\)/);
    assert.doesNotMatch(listen, /getWorkerSql/);
    assert.doesNotMatch(mcpRoute, /warmAgenticCatalogue/);
    assert.doesNotMatch(mcpRoute, /ensureCatalogueSnapshot/);
    assert.doesNotMatch(rpc, /kickCatalogueWarm|warmAgenticCatalogue/);
    assert.doesNotMatch(info, /warmCatalogueSnapshot/);
    assert.doesNotMatch(
      token.slice(0, token.indexOf("from public.assessments")),
      /ensureCommunicationSchema/
    );
  });
});
