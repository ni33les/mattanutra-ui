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

it("QUALITY-DISC-01 discovery includes JavaScript and TypeScript test extensions without collecting helpers or browser specs", () => {
  const directory = mkdtempSync(join(tmpdir(), "mixed-test-discovery-"));
  const expected = ["cjs", "cts", "js", "jsx", "mjs", "mts", "ts", "tsx"]
    .map(extension => `test/nested/example.test.${extension}`).sort();
  try {
    for (const file of [...expected, "test/nested/helper.mjs", "test/nested/example.spec.ts", "test/nested/example.test.ts.map"]) {
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

function changedSelection(file: string) {
  const output = execFileSync(process.execPath, ["scripts/run-tests.mjs", "changed", "--dry-run"], {
    encoding: "utf8", env: { ...process.env, DEV_CYCLE_CHANGED_FILES: file }
  });
  const selected = output.split("[test] Selected tests:")[1] ?? "";
  return { output, files: [...selected.matchAll(/^  - (.+)$/gm)].map(match => match[1]) };
}

it("QUALITY-DISC-02 a changed JavaScript test selects that maintained test directly", () => {
  const file = "test/delight-price-completion.test.mjs";
  const selected = changedSelection(file).files;
  assert.equal(selected.length, 1);
  assert.deepEqual(selected, [file]);
});

it("QUALITY-DISC-03 shared matcher and plan changes select their maintained consumers before generic filename rules", async () => {
  const { fullTestInventory } = await import("../scripts/run-full-test-suite.mjs");
  const maintained = fullTestInventory().mcp;
  for (const file of ["lib/matcher/search.ts", "lib/agentic/plan/service.ts", "lib/product-recommendations.ts", "workers/product-matcher.ts", "workers/product-matcher-pool.ts", "app/api/mcp/route.ts"]) {
    const selected = changedSelection(file);
    assert.equal(selected.output.includes("Broad or unknown change"), false, file);
    for (const consumer of maintained) assert.ok(selected.files.includes(consumer), `${file} omitted ${consumer}`);
    assert.equal(new Set(selected.files).size, selected.files.length, `${file} selected duplicate files`);
  }
});

it("QUALITY-DISC-07 an unknown shared source change retains the complete fallback", async () => {
  const { allTestFiles } = await import("../scripts/dev-cycle-utils.mjs");
  const selected = changedSelection("lib/new-runtime-domain.ts");
  assert.equal(selected.output.includes("Broad or unknown change"), true);
  assert.deepEqual(selected.files, allTestFiles());
});
