import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { it } from "node:test";
import { pathToFileURL } from "node:url";
import { runBatch } from "../scripts/run-full-test-suite.mjs";

function childEnvironment() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

it("QUALITY-SPEED-01 plain TypeScript delegates without loading the TSX compiler", () => {
  const directory = mkdtempSync(join(tmpdir(), "lazy-compiler-proof-"));
  try {
    const fixture = join(directory, "typed.tsx");
    writeFileSync(fixture, "export const value: number = 42;\n");
    const source = `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      const require = createRequire(import.meta.url);
      const compiler = require.resolve('typescript');
      assert.equal(Boolean(require.cache[compiler]), false);
      const loader = await import('./scripts/ts-path-loader.mjs');
      assert.equal(Boolean(require.cache[compiler]), false, 'Loading the path resolver must not initialize the TSX compiler');
      const context = { format: 'module' }, expected = { format: 'module', source: 'export const value = 1;' };
      let delegated = 0;
      assert.equal(await loader.load('file:///fixture.ts', context, async (url, actual) => {
        delegated++; assert.equal(url, 'file:///fixture.ts'); assert.equal(actual, context); return expected;
      }), expected);
      assert.equal(delegated, 1);
      assert.equal(Boolean(require.cache[compiler]), false);
      const transformed = await loader.load(${JSON.stringify(pathToFileURL(fixture).href)}, {}, () => { throw Error('TSX must be transformed'); });
      assert.equal(transformed.format, 'module'); assert.equal(transformed.shortCircuit, true);
      assert.ok(require.cache[compiler], 'The compiler is required when a TSX module loads');
      const value = await import('data:text/javascript,' + encodeURIComponent(transformed.source));
      assert.equal(value.value, 42);
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
      env: childEnvironment(), encoding: "utf8", timeout: 15_000
    });
    assert.equal(result.status, 0, `${result.error ?? result.signal ?? ""}\n${result.stderr}\n${result.stdout}`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("QUALITY-SPEED-02 registered TSX loading preserves aliases and independent Node test processes", () => {
  const directory = mkdtempSync(join(tmpdir(), "loader-process-isolation-"));
  try {
    writeFileSync(join(directory, "counter.tsx"), "let count: number = 0; export const next = (): number => ++count;\n");
    const files = ["first", "second"].map(name => {
      const file = join(directory, `${name}.test.ts`);
      writeFileSync(file, `import assert from 'node:assert/strict'; import test from 'node:test';
        import { next } from './counter.tsx'; import { fromDecimal, serialize } from '@/lib/matcher/rational';
        test('${name} owns its module state', () => { assert.equal(next(), 1); assert.deepEqual(serialize(fromDecimal('0.1')), {numerator:'1',denominator:'10'}); });\n`);
      return file;
    });
    const result = spawnSync(process.execPath, ["--test", "--test-concurrency=2", "--experimental-strip-types", "--import", "./scripts/register-ts-path-loader.mjs", ...files], {
      env: childEnvironment(), encoding: "utf8", timeout: 15_000
    });
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /# tests 2\b/);
    assert.match(result.stdout, /# pass 2\b/);
    assert.match(result.stdout, /# skipped 0\b/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("QUALITY-SPEED-03 successful and failed batches retain timing separately from semantic equality", async () => {
  const directory = mkdtempSync(join(tmpdir(), "test-timing-sidecar-"));
  try {
    const evidence = join(directory, "evidence");
    mkdirSync(evidence);
    for (const passed of [true, false]) {
      const name = passed ? "success" : "failure", label = `node-timing-${name}`;
      const file = join(directory, `${name}.test.mjs`);
      writeFileSync(file, `import assert from 'node:assert/strict'; import test from 'node:test'; test('${name} retains its outcome', () => { assert.equal(1, ${passed ? 1 : 2}); });\n`);
      const result = await runBatch(label, ["--test", relative(process.cwd(), file)], childEnvironment(), evidence);
      assert.equal(result.passed, passed);
      const rows = (suffix: string) => readFileSync(join(evidence, `${label}-${suffix}.jsonl`), "utf8").trim().split("\n").map(line => JSON.parse(line));
      const semantics = rows("events"), timings = rows("timings");
      assert.equal(timings.length, semantics.length);
      for (const [index, timed] of timings.entries()) {
        const { durationMs, ...identity } = timed;
        assert.ok(Number.isFinite(durationMs) && durationMs >= 0);
        assert.deepEqual(identity, semantics[index]);
        assert.equal("durationMs" in semantics[index], false);
      }
      assert.ok(result.timing.elapsedMs > 0);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
