import { seedMatcherReferenceFixtures } from "./seed-matcher-reference-fixtures.mjs";
/** Bootstrap a fresh isolated CI database using existing schemas and controlled fixtures. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import postgres from 'postgres';
import { prepareLockFixtures } from './service-efficiency/prepare-lock-fixtures.mjs';
import { seedPublicMatcherFixtures } from './seed-matcher-public-fixtures.mjs';
const url = new URL(process.env.TEST_DB_URL);
assert.equal(url.hostname, '127.0.0.1'); assert.notEqual(url.port, '5432'); assert.match(url.pathname, /^\/mattanutra_lock_review_ax_/);
const sql = postgres(url.href, { max: 1, prepare: false });
try {
  const [row] = await sql`select count(*)::int n from information_schema.tables where table_schema='public'`;
  assert.equal(row.n, 0, 'Bootstrap requires a fresh empty isolated database');
  await sql.unsafe(readFileSync('db-schema.sql', 'utf8'));
  const env = { ...process.env, NODE_ENV: 'test', MATTANUTRA_ENV: 'dev', DB_URL: url.href, DB_WORKER_URL: url.href, DB_ALLOW_DIRECT_CONNECTION: 'true' };
  for (const script of ['apply-locale-schema', 'apply-product-administration-schema', 'apply-agentic-commerce-schema', 'apply-web-funnel-schema', 'apply-matcher-v5-runtime-schema', 'apply-service-efficiency-schema']) {
    execFileSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/register-ts-path-loader.mjs', `scripts/${script}.ts`], { env, stdio: 'inherit' });
  }
  await prepareLockFixtures(sql, url.href);
  await seedMatcherReferenceFixtures(sql, url.href);
  await sql.begin(tx => seedPublicMatcherFixtures(tx));
} finally { await sql.end(); }
