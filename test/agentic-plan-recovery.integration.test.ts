import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { closeSqlPool, getSql } from "../lib/db.ts";
import { createPostgresStore } from "../lib/agentic/store/postgres.ts";
import type { PlanResult } from "../lib/agentic/plan/types.ts";

type Message = { kind: string; message?: string; result?: Record<string, unknown> };
const databaseUrl = process.env.TEST_DB_URL;
const principals: string[] = [];
const jobs: Array<{ child: ChildProcess; exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }> }> = [];

function launch(mode: string, principal: string, key: string) {
  const child = fork(fileURLToPath(new URL("./helpers/plan-recovery-process.ts", import.meta.url)), [mode, principal, key], {
    execArgv: ["--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs"],
    env: { ...process.env, DB_URL: databaseUrl, DB_POOL_MAX: "2", DB_WORKER_POOL_MAX: "2" },
    stdio: ["ignore", "ignore", "pipe", "ipc"]
  });
  let stderr = "";
  child.stderr?.on("data", chunk => { stderr = (stderr + chunk).slice(-12_000); });
  const messages: Message[] = [];
  const listeners = new Set<() => void>();
  child.on("message", (message: Message) => { messages.push(message); for (const notify of listeners) notify(); });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
  jobs.push({ child, exited });
  async function waitFor(kind: string): Promise<Message> {
    let timer: ReturnType<typeof setTimeout>;
    let notify!: () => void;
    try {
      return await Promise.race([
        new Promise<Message>((resolve, reject) => {
          notify = () => {
            const error = messages.find(item => item.kind === "error");
            if (error) reject(new Error(error.message));
            const found = messages.find(item => item.kind === kind);
            if (found) resolve(found);
          };
          listeners.add(notify); notify();
        }),
        exited.then(() => {
          const found = messages.find(item => item.kind === kind);
          if (found) return found;
          throw new Error(`process exited before ${kind}: ${stderr}`);
        }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`process timed out before ${kind}: ${stderr}`)), 12_000); })
      ]);
    } finally { clearTimeout(timer!); listeners.delete(notify); }
  }
  return { child, exited, waitFor };
}

describe("MCP plan recovery across PostgreSQL processes", { timeout: 45_000 }, () => {
  before(() => {
    assert.ok(databaseUrl, "Isolated PostgreSQL is mandatory; recovery tests never skip");
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1");
    assert.match(url.pathname, /^\/mattanutra_lock_review/);
    process.env.DB_URL = databaseUrl;
  });
  after(async () => {
    for (const { child } of jobs) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await Promise.all(jobs.map(job => job.exited));
    const store = createPostgresStore(getSql()!);
    for (const principal of principals) await store.deletePrincipalScope(principal);
    await closeSqlPool();
  });

  for (const point of ["before_match", "before_commit"]) {
    it(`recovers after process death ${point}, with concurrent retries committing one result`, async () => {
      const principal = `qa-v3:lock-review:recovery:${randomUUID()}`;
      const key = `recovery-process-${randomUUID()}`;
      principals.push(principal);
      const store = createPostgresStore(getSql()!);
      const interrupted = launch(point, principal, key);
      await interrupted.waitFor("paused");
      const ids = await store.listPlanIdsByPrincipal(principal);
      assert.equal(ids.length, 1);
      const pending = await store.getPlanRevision(ids[0]!, 1);
      assert.equal(pending?.status, "processing");
      assert.equal((pending?.result as PlanResult).pendingInput?.request.targets[0]?.name, "Vitamin D3");
      assert.equal((pending?.result as PlanResult).pendingInput?.request.targets[0]?.supplementId, undefined);
      interrupted.child.kill("SIGKILL");
      assert.equal((await interrupted.exited).signal, "SIGKILL");
      const operation = await store.getActivePlanOperation(ids[0]!); assert.ok(operation);
      assert.equal(operation.status, "running");
      // A controlled expired lease exercises recovery without sleeping for 60s
      // or extending the operation's unchanged overall deadline.
      const expired = { ...operation, leaseExpiresAt: new Date(Date.now() - 1).toISOString(), version: operation.version + 1 };
      assert.equal(await store.updatePlanOperation(expired, operation.version), true);

      const left = launch("retry", principal, key), right = launch("retry", principal, key);
      await Promise.all([left.waitFor("ready"), right.waitFor("ready")]);
      left.child.send("go"); right.child.send("go");
      const [a, b] = await Promise.all([left.waitFor("result"), right.waitFor("result")]);
      assert.equal(a.result?.status, "ready", JSON.stringify(a));
      assert.equal(a.result?.revision, 1);
      assert.deepEqual(b.result, a.result);
      assert.equal((await left.exited).code, 0);
      assert.equal((await right.exited).code, 0);
      assert.deepEqual(await store.listPlanIdsByPrincipal(principal), ids);
      const ready = await store.getPlanRevision(ids[0]!, 1);
      assert.equal(ready?.status, "ready");
      assert.equal((ready?.result as PlanResult).pendingInput, undefined);
      const receipt = await store.getIdempotency("plan", `dev:mattanutra:${principal}`, key);
      assert.deepEqual(JSON.parse(receipt!.responseJson), a.result);
      const [counts] = await getSql()!`select
        (select count(*)::int from public.agentic_plan_revisions where plan_id = ${ids[0]}::uuid) as revisions,
        (select count(*)::int from public.agentic_orders where plan_id = ${ids[0]}::uuid) as orders`;
      assert.deepEqual({ ...counts }, { revisions: 1, orders: 0 });
    });
  }
});
