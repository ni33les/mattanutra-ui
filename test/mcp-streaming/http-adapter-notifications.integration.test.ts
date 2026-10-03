import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { isolatedDatabasePreflight } from '../../scripts/run-full-test-suite.mjs';
import { isolatedValidationEnvironment } from '../../scripts/run-dev-advisory-validation.mjs';

assert.ok(process.env.TEST_DB_URL, 'Isolated PostgreSQL is required, never skip');
assert.deepEqual(isolatedDatabasePreflight(process.env), []);
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.notEqual(url.port, '5432');
assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/);

test('STREAM-HTTP-notify actual isolated adapter observes external completion and closes its listener', async () => {
  // The full gate's Next candidate may retain connections to TEST_DB_URL. Never
  // clone that active database or terminate its clients. Bootstrap our own empty
  // database using the existing maintained schema and fixture utility instead.
  const name = `mattanutra_lock_review_ax_http_${randomUUID().replaceAll('-', '')}`;
  const adminUrl = new URL(url); adminUrl.pathname = '/postgres';
  const admin = postgres(adminUrl.href, { max: 1, prepare: false, connection: { statement_timeout: '30000ms' } });
  const fixtureUrl = new URL(url); fixtureUrl.pathname = `/${name}`;
  const sql = postgres(fixtureUrl.href, { max: 1, prepare: false });
  const applicationName = `mattanutra-http-notify-${process.pid}`;
  const env: NodeJS.ProcessEnv = { ...isolatedValidationEnvironment({ ...process.env, TEST_DB_URL: fixtureUrl.href, DB_URL: fixtureUrl.href }),
    DB_LISTEN_URL: fixtureUrl.href, DB_LISTEN_APPLICATION_NAME: applicationName };
  delete env.NODE_TEST_CONTEXT;
  let child: ChildProcess | undefined, created = false, exited = false;
  let childError: Error | undefined;
  let exit: Promise<void> = Promise.resolve();
  const kill = (signal: NodeJS.Signals) => {
    if (child?.pid) { try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal); } catch { /* exited */ } }
  };
  const messages: Array<{ type?: string; ready?: boolean; operationId?: string }> = [];
  const waiters = new Set<() => void>();
  function until(predicate: () => boolean, timeoutMs: number, label: string) {
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        if (childError) { clearTimeout(timer); waiters.delete(check); reject(childError); }
        else if (predicate()) { clearTimeout(timer); waiters.delete(check); resolve(); }
        else if (exited) { clearTimeout(timer); waiters.delete(check); reject(new Error(`${label}: child exited`)); }
      };
      const timer = setTimeout(() => { waiters.delete(check); reject(new Error(label)); }, timeoutMs);
      waiters.add(check); check();
    });
  }
  try {
    await admin.unsafe(`create database ${name} template template0`); created = true;
    execFileSync(process.execPath, ['scripts/prepare-matcher-test-db.mjs'], { env, stdio: ['ignore', 'ignore', 'inherit'], timeout: 120_000 });
    child = fork('scripts/serve-matcher-test-http.ts', [], {
      execArgv: ['--experimental-strip-types', '--import', './scripts/register-ts-path-loader.mjs',
        '--import', './scripts/register-matcher-http-loader.mjs', '--import', './test/mcp-streaming/http-adapter-notification-probe.mjs'],
      env, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'inherit', 'ipc']
    });
    exit = new Promise<void>(resolve => {
      const complete = () => { exited = true; for (const check of waiters) check(); resolve(); };
      child!.once('exit', complete);
      child!.once('error', error => { childError = error; complete(); });
    });
    child.on('message', message => { messages.push(message as typeof messages[number]); for (const check of waiters) check(); });
    await until(() => messages.some(message => message.ready), 60_000, 'Isolated HTTP adapter startup failed');
    const operationId = randomUUID();
    child.send({ type: 'observe-completion', operationId });
    await until(() => messages.some(message => message.type === 'completion-observer-ready'), 3000, 'Observer was not registered');
    await sql`select pg_notify('mattanutra_tasks', ${JSON.stringify({ kind: 'plan_operation_changed', operationId, version: 1 })})`;
    await until(() => messages.some(message => message.type === 'completion-observed' && message.operationId === operationId),
      3000, 'HTTP adapter did not receive the external completion notification');
    kill('SIGTERM'); kill('SIGINT');
    await until(() => exited, 5000, 'HTTP adapter failed to stop');
    assert.equal(messages.filter(message => message.type === 'completion-observer-closed' && message.operationId === operationId).length, 1, 'Multiple stop signals close each observer once');
    const [row] = await sql`select count(*)::int as count from pg_stat_activity where application_name=${applicationName}`;
    assert.equal(row.count, 0, 'Stopped HTTP adapter must release its LISTEN connection');
  } finally {
    if (child && !exited) { kill('SIGTERM'); await Promise.race([exit, new Promise(resolve => setTimeout(resolve, 5000))]); }
    if (child && !exited) { kill('SIGKILL'); await exit; }
    await sql.end();
    try {
      if (created) {
        // The process exit and PostgreSQL's socket cleanup are asynchronous.
        // Preserve the LISTEN assertion above and wait for our remaining sockets;
        // never terminate other clients to make fixture deletion pass.
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          const [remaining] = await admin`select count(*)::int as count from pg_stat_activity where datname=${name}::name`;
          if (remaining.count === 0) break;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        await admin.unsafe(`drop database ${name}`);
      }
    } finally { await admin.end(); }
  }
});
