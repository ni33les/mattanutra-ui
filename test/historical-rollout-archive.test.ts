import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";

const baseline = JSON.parse(readFileSync("test/code-quality/historical-rollout-baseline.json", "utf8")) as {
  originals: Array<{ path: string; bytes: number; sha256: string; offset: number }>;
  schema: { path: string; bytes: number; sha256: string; offset: number };
  taskDefinitions: Array<{ table: string; sha256: string }>;
};
const archivePath = "db-rollout/archive/2026-05-23.sql.gz";
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

test("historical rollout archive preserves every original byte with deterministic metadata", () => {
  const compressed = readFileSync(archivePath);
  assert.equal(compressed.readUInt32LE(4), 0, "gzip must not embed generation time");
  const restored = gunzipSync(compressed);
  for (const file of baseline.originals) {
    const content = restored.subarray(file.offset, file.offset + file.bytes);
    assert.equal(content.length, file.bytes, file.path);
    assert.equal(sha(content), file.sha256, file.path);
  }
  assert.equal(restored.length, baseline.originals[0].bytes);
});

test("active historical schema and isolated task definitions retain the frozen dump bytes", () => {
  const schema = readFileSync(baseline.schema.path);
  assert.equal(schema.length, baseline.schema.bytes);
  assert.equal(sha(schema), baseline.schema.sha256);
  for (const expected of baseline.taskDefinitions) {
    const definition = schema.toString("utf8").match(new RegExp(`CREATE TABLE public\\.${expected.table} \\([\\s\\S]*?\\n\\);`));
    assert.ok(definition, expected.table);
    assert.equal(sha(definition[0]), expected.sha256, expected.table);
  }
  const bootstrap = readFileSync("test/mcp-7-2-2/prepare-postgres.mjs", "utf8");
  assert.ok(bootstrap.includes(baseline.schema.path));
  assert.doesNotMatch(bootstrap, /readFileSync\("db-rollout\/db-rollout\.sql"/);
});

test("offline CLI restores all original paths and refuses to overwrite different bytes", () => {
  const directory = mkdtempSync(join(tmpdir(), "historical-rollout-restore-"));
  try {
    const command = ["scripts/historical-rollout.mjs", "restore", "--output", directory];
    execFileSync(process.execPath, command, { stdio: "pipe" });
    for (const expected of baseline.originals) {
      const restored = readFileSync(join(directory, expected.path));
      assert.equal(restored.length, expected.bytes, expected.path);
      assert.equal(sha(restored), expected.sha256, expected.path);
    }
    execFileSync(process.execPath, command, { stdio: "pipe" });
    const existing = join(directory, baseline.originals[0].path);
    writeFileSync(existing, "existing backup must survive");
    assert.throws(() => execFileSync(process.execPath, command, { stdio: "pipe" }));
    assert.equal(readFileSync(existing, "utf8"), "existing backup must survive");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("archive reader rejects a valid gzip containing unverified replacement bytes", async () => {
  const { readHistoricalRolloutArchive } = await import("../scripts/historical-rollout.mjs");
  const directory = mkdtempSync(join(tmpdir(), "historical-rollout-corrupt-"));
  try {
    const replacement = join(directory, "replacement.sql.gz");
    writeFileSync(replacement, gzipSync("valid gzip, wrong rollout"));
    assert.throws(() => readHistoricalRolloutArchive(replacement), /checksum|size/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("archived raw copies leave the checkout while the live payment seed remains unchanged", () => {
  for (const expected of baseline.originals) {
    if (expected.path === "db-rollout/db-data-10-platform-seed.sql") {
      assert.equal(sha(readFileSync(expected.path)), expected.sha256);
    } else {
      assert.equal(existsSync(expected.path), false, expected.path);
    }
  }
});
