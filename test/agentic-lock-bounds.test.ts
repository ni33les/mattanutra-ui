import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  CLIENT_READ_DEADLINE_MS,
  SERVICE_INTERNAL_DEADLINE_MS
} from "../lib/agentic/qa/service-clock.ts";

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

const ADVISORY_LOCK = /\bpg_advisory(?:_xact)?_lock\s*\(/i;
const NESTED_POOL = /\b(?:commitFunnelEvent|getSql)\s*\(|\bpg_advisory(?:_xact)?_lock\s*\(/i;
const ALLOWED_TRY_LOCK = new Set(["lib/prd-live-catalogue-sync.ts"]);

describe("request-path lock bounds", () => {
  it("LOCK-RED-01 runtime advisory locks are try-lock batch jobs only", async () => {
    const files = [
      ...(await filesUnder("app")),
      ...(await filesUnder("lib")),
      ...(await filesUnder("workers"))
    ];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (ALLOWED_TRY_LOCK.has(file)) {
        assert.match(source, /pg_try_advisory_lock/);
        assert.equal(/\bpg_advisory_lock\s*\(/i.test(source), false, file);
        continue;
      }
      assert.equal(ADVISORY_LOCK.test(source), false, file);
    }
  });

  it("LOCK-RED-02 open transactions must not acquire a second pool session", async () => {
    const files = [
      ...(await filesUnder("app")),
      ...(await filesUnder("lib")),
      ...(await filesUnder("workers"))
    ];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      const bodies = [
        ...extractBalancedCalls(source, /\.transaction\s*\(\s*async\s*\(/g),
        ...extractBalancedCalls(source, /\bsql\.begin\s*\(/g)
      ];
      for (const body of bodies) {
        assert.equal(
          NESTED_POOL.test(body),
          false,
          `${file} must not call commitFunnelEvent/getSql/advisory lock inside an open DB transaction`
        );
      }
    }
  });

  it("LOCK-RED-03 every pooled connection gets 15s/2s/10s caps", async () => {
    const db = await readFile("lib/db.ts", "utf8");
    assert.match(db, /DEFAULT_DB_STATEMENT_TIMEOUT_MS = 15_000/);
    assert.match(db, /DEFAULT_DB_LOCK_TIMEOUT_MS = 2_000/);
    assert.match(db, /DEFAULT_DB_IDLE_IN_TXN_TIMEOUT_MS = 10_000/);
    assert.doesNotMatch(db, /connection:\s*\{[^}]*statement_timeout/);
    assert.match(
      db,
      /set_config\('statement_timeout'[\s\S]*true\)[\s\S]*set_config\('lock_timeout'[\s\S]*true\)[\s\S]*set_config\('idle_in_transaction_session_timeout'[\s\S]*true\)/
    );
    assert.equal(SERVICE_INTERNAL_DEADLINE_MS, 60_000);
    assert.equal(CLIENT_READ_DEADLINE_MS, 90_000);
    assert.equal(SERVICE_INTERNAL_DEADLINE_MS < CLIENT_READ_DEADLINE_MS, true);
  });

  it("LOCK-RED-04 slow-query logs stay above catalogue noise and do not dump siblings on the interactive pool", async () => {
    const db = await readFile("lib/db.ts", "utf8");
    const slow = /SLOW_QUERY_LOG_MS = ([0-9_]+)/.exec(db);
    assert.ok(slow, "missing SLOW_QUERY_LOG_MS");
    assert.equal(Number(slow[1].replaceAll("_", "")) >= 1_000, true, slow[1]);
    assert.doesNotMatch(db, /void dumpSlowQuerySiblings\(/);
    assert.doesNotMatch(db, /console\.info\("Database notice"/);
  });
});
