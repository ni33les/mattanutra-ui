import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { AGENTIC_PUBLIC_TOOLS } from "../lib/agentic/contract/index.ts";

function extractBalancedCalls(source: string, marker: RegExp) {
  const bodies: string[] = [];

  for (const match of source.matchAll(marker)) {
    const open = source.indexOf("{", match.index ?? 0);

    if (open < 0) {
      continue;
    }

    let depth = 0;

    for (let index = open; index < source.length; index += 1) {
      const char = source[index];

      if (char === "{") {
        depth += 1;
      }

      if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          bodies.push(source.slice(open + 1, index));
          break;
        }
      }
    }
  }

  return bodies;
}

describe("consistency r3 regression guards", () => {
  it("keeps the public MCP tools including evidence", () => {
    assert.deepEqual([...AGENTIC_PUBLIC_TOOLS], [
      "info",
      "plan",
      "execute",
      "order",
      "support",
      "feedback",
      "evidence"
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

  it("splits interactive and worker postgres pools", async () => {
    const db = await readFile("lib/db.ts", "utf8");

    assert.match(db, /export function getSql\(/);
    assert.match(db, /export function getWorkerSql\(/);
    assert.match(db, /DEFAULT_DB_POOL_MAX = 6/);
    assert.match(db, /DEFAULT_DB_WORKER_POOL_MAX = 6/);
    assert.match(db, /MAX_DB_POOL_MAX = 8/);
    assert.match(db, /mattanutra-web/);
    assert.match(db, /mattanutra-worker/);
    assert.match(db, /DB_WORKER_POOL_MAX/);
    assert.match(db, /getOrCreateSqlPool\("interactive"\)/);
    assert.match(db, /getOrCreateSqlPool\("worker"\)/);
    assert.match(db, /process\.env\.DB_POOL_ROLE === "worker"/);
    assert.doesNotMatch(db, /Math\.min\(dbPoolMax\(\),\s*4\)/);
    assert.doesNotMatch(
      db,
      /Array\.from\(\{\s*length:\s*n\s*\},\s*\(\)\s*=>\s*sql`/
    );
  });

  it("keeps keep-alive to one interactive connection", async () => {
    const db = await readFile("lib/db.ts", "utf8");

    assert.match(db, /DB_KEEP_ALIVE_CONNECTIONS = 1/);
    assert.match(
      db,
      /Array\.from\(\{\s*length:\s*DB_KEEP_ALIVE_CONNECTIONS\s*\},\s*\(\)\s*=>\s*sql`select 1`/
    );
    assert.match(
      db,
      /export async function keepDatabaseWarm\(\) \{\s*const sql = getSql\(\)/
    );
    assert.doesNotMatch(
      db,
      /keepDatabaseWarm[\s\S]{0,400}getWorkerSql\(/
    );
  });

  it("routes task service onto the worker pool", async () => {
    const [service, agents, reserve, complete, fail] = await Promise.all([
      readFile("lib/task-service.ts", "utf8"),
      readFile("lib/task-service-agents.ts", "utf8"),
      readFile("app/api/tasks/reserve/route.ts", "utf8"),
      readFile("app/api/tasks/[id]/complete/route.ts", "utf8"),
      readFile("app/api/tasks/[id]/fail/route.ts", "utf8")
    ]);

    for (const source of [service, agents]) {
      assert.match(source, /getWorkerSql\(\)\s*\?\?\s*getSql\(\)/);
    }

    assert.match(service, /withSingleQueuedTaskClaim/);

    const taskWorker = await readFile("lib/task-worker.ts", "utf8");
    const sweepLoop = await readFile("lib/task-sweep-loop.ts", "utf8");
    assert.doesNotMatch(
      sweepLoop,
      /enqueueMissingProductRecommendationsForReadyPlans/
    );
    assert.match(
      taskWorker,
      /enqueueMissingProductRecommendationsForReadyPlans[\s\S]{0,200}getWorkerSql\(\) \?\? getSql\(\)/
    );
    assert.match(reserve, /sql: getWorkerSql\(\) \?\? undefined/);
    assert.match(complete, /sql: getWorkerSql\(\) \?\? undefined/);
    assert.match(fail, /sql: getWorkerSql\(\) \?\? undefined/);

    const accessPrincipal = await readFile("lib/access-principal.ts", "utf8");
    assert.match(
      accessPrincipal,
      /allowLegacy === "worker"[\s\S]*getWorkerSql\(\) \?\? getSql\(\)/
    );
    assert.match(accessPrincipal, /CREDENTIAL_USE_TOUCH_MS = 60_000/);
  });

  it("does not import the worker pool from interactive request paths", async () => {
    const files = [
      "lib/assessment-store.ts",
      "lib/bpm.ts",
      "app/api/mcp/route.ts",
      "app/[locale]/nutrition/reveal/page.tsx",
      "app/api/assessment/[planId]/formulation/route.ts",
      "app/api/assessment/[planId]/journey/route.ts",
      "app/api/assessment/[planId]/line-connect/route.ts",
      "lib/nutrition-journey-read.ts",
      "lib/agentic/catalogue/live.ts",
      "lib/agentic/catalogue/market.ts"
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");

      assert.doesNotMatch(
        source,
        /getWorkerSql/,
        `${file} must stay on the interactive pool`
      );
    }
  });

  it("does not wait or open a SQL transaction on reserve", async () => {
    const reserve = await readFile("app/api/tasks/reserve/route.ts", "utf8");
    const beginBodies = extractBalancedCalls(reserve, /\bsql\.begin\s*\(/g);

    assert.equal(beginBodies.length, 0, "reserve must not open sql.begin");
    assert.doesNotMatch(reserve, /waitForTaskQueueChange/);
    assert.doesNotMatch(reserve, /INTERACTIVE_RESERVE_POLL_INTERVAL_MS/);
    assert.doesNotMatch(reserve, /while\s*\(\s*true\s*\)/);
  });
});
