import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { it } from "node:test";

const collectorUrl = new URL("../scripts/dev-cycle-utils.mjs", import.meta.url).href;

it("PREP-COLLECT-01 all-test discovery includes nested MCP and matcher tests exactly once", () => {
  const directory = mkdtempSync(join(tmpdir(), "mcp-discovery-"));
  const expected = [
    "test/agentic/value/slice0-harness.test.ts",
    "test/agentic/value/slice1-intent.test.ts",
    "test/matcher/safety.test.ts",
    "test/root.test.ts"
  ];
  try {
    for (const file of [...expected, "test/agentic/value/harness.ts", "test/README.md"]) {
      mkdirSync(dirname(join(directory, file)), { recursive: true });
      writeFileSync(join(directory, file), "");
    }
    const actual = JSON.parse(execFileSync(process.execPath, [
      "--input-type=module", "-e",
      `const { allTestFiles } = await import(${JSON.stringify(collectorUrl)}); process.stdout.write(JSON.stringify(allTestFiles()));`
    ], { cwd: directory, encoding: "utf8" }));
    assert.deepEqual(actual, expected);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
