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
      /runSupervisedAgentLoop\(profileMode, config\)/,
      "worker:all must supervise each real agent profile independently"
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
