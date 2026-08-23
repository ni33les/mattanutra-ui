import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import { AGENTIC_PUBLIC_TOOLS } from "../lib/agentic/contract/index.ts";

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

const NETWORK_IN_TXN =
  /\b(?:fetch|axios|got|node-fetch|undici)\s*\(|new\s+Stripe\b|from\s+["']stripe["']|sendEmail|nodemailer|@sendgrid|resend\(|openai|createCompletion|chat\.completions/i;

describe("consistency r1 regression guards", () => {
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

  it("keeps algae_only as its own requirements flag, not a catalogue skip", async () => {
    const planCopy = await readFile(
      "lib/agentic/contract/instructions.ts",
      "utf8"
    );
    const qaPack = await readFile("test/agentic-qa-pack.test.ts", "utf8");

    assert.match(planCopy, /algae_only remains its own flag/);
    assert.match(qaPack, /omega3SourcePreference:\s*"algae_only"/);
    assert.doesNotMatch(
      planCopy,
      /algae_only[\s\S]{0,80}skip live|fixture-skip/
    );
  });

  it("sets statement, lock, and idle-in-transaction timeouts on the interactive pool", async () => {
    const db = await readFile("lib/db.ts", "utf8");

    assert.match(db, /DEFAULT_DB_STATEMENT_TIMEOUT_MS = 15_000/);
    assert.match(db, /DEFAULT_DB_LOCK_TIMEOUT_MS = 2_000/);
    assert.match(db, /DEFAULT_DB_IDLE_IN_TXN_TIMEOUT_MS = 10_000/);
    assert.match(db, /connection\.statement_timeout = String\(statementTimeoutMs\)/);
    assert.match(db, /connection\.lock_timeout = String\(lockTimeoutMs\)/);
    assert.match(
      db,
      /connection\.idle_in_transaction_session_timeout = String\(idleInTxnTimeoutMs\)/
    );
    assert.match(db, /pool_initialized/);
  });

  it("logs MCP tool duration with a correlation id", async () => {
    const route = await readFile("app/api/mcp/route.ts", "utf8");

    assert.match(route, /requestCorrelationId\(request\)/);
    assert.match(route, /mcp\.tool_completed/);
    assert.match(route, /durationMs/);
    assert.match(route, /correlationId/);
  });

  it("forbids network, AI, email, and Stripe inside sql.begin / store.transaction bodies", async () => {
    const files = [
      ...(await filesUnder("lib")),
      ...(await filesUnder("app")),
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
          NETWORK_IN_TXN.test(body),
          false,
          `${file} must not call network/AI/email/Stripe inside an open DB transaction`
        );
      }
    }
  });

  it("forbids table-level locks on interactive runtime paths", async () => {
    const files = [
      ...(await filesUnder("app")),
      ...(await filesUnder("lib")),
      ...(await filesUnder("workers"))
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");

      assert.equal(
        /\block\s+table\b/i.test(source),
        false,
        `${file} must not take table-level locks on interactive paths`
      );
    }
  });

  it("keeps unscoped first-create on ensureCatalogueSnapshot, not inline fixture SKUs", async () => {
    const planService = await readFile("lib/agentic/plan/service.ts", "utf8");
    const live = await readFile("lib/agentic/catalogue/live.ts", "utf8");
    const snapshot = await readFile("lib/agentic/catalogue/snapshot.ts", "utf8");

    assert.match(
      planService,
      /hasFullRequest\(input\.payload\) \|\| !input\.payload\.planHandle/
    );
    assert.match(planService, /ensureCatalogueSnapshot\(/);
    assert.doesNotMatch(planService, /fixtureSnapshot\(/);
    assert.doesNotMatch(planService, /FIXTURE_SUPPLEMENTS/);
    assert.match(live, /getLiveSaleEligibleRetailerCandidateSets/);
    assert.doesNotMatch(snapshot, /fixture-skip/);
  });

  it("keeps explicit QA fixture keys off the unscoped first-create path", async () => {
    const qaPack = await readFile("test/agentic-qa-pack.test.ts", "utf8");
    const planService = await readFile("lib/agentic/plan/service.ts", "utf8");

    assert.match(qaPack, /qa-a7-fixture-0000001/);
    assert.match(qaPack, /qa-a10-fixture-000001/);
    assert.doesNotMatch(planService, /qa-a7-fixture|qa-a10-fixture/);
  });
});
