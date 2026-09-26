import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../db-rollout/archive/2026-05-23.manifest.json", import.meta.url), "utf8"));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function verify(bytes, expected, label) {
  if (bytes.length !== expected.bytes) throw new Error(`Size mismatch: ${label}`);
  if (sha256(bytes) !== expected.sha256) throw new Error(`Checksum mismatch: ${label}`);
}

/** Read-only, offline verification of the archive and every original member. */
export function readHistoricalRolloutArchive(archivePath = resolve(root, manifest.archive.path)) {
  const compressed = readFileSync(archivePath);
  verify(compressed, manifest.archive, "compressed rollout");
  const original = gunzipSync(compressed, { maxOutputLength: manifest.originals[0].bytes });
  for (const file of [...manifest.originals, manifest.schema]) {
    if (!Number.isSafeInteger(file.offset) || file.offset < 0 || file.offset + file.bytes > original.length) {
      throw new Error(`Invalid archive range: ${file.path}`);
    }
    verify(original.subarray(file.offset, file.offset + file.bytes), file, file.path);
  }
  return original;
}

/** Restore originals without executing SQL or replacing a different backup. */
export function restoreHistoricalRollout(outputDirectory) {
  if (typeof outputDirectory !== "string" || !outputDirectory.trim()) throw new Error("An explicit output directory is required");
  const destination = resolve(outputDirectory);
  const fromRoot = relative(root, destination);
  if (!fromRoot || (!fromRoot.startsWith("../") && fromRoot !== "..")) {
    throw new Error("Restore outside the checkout so historical SQL cannot enter active schema discovery");
  }
  const original = readHistoricalRolloutArchive();
  const outputs = manifest.originals.map(file => {
    const target = resolve(destination, file.path);
    const withinDestination = relative(destination, target);
    if (withinDestination.startsWith("../") || withinDestination === "..") throw new Error(`Invalid restore path: ${file.path}`);
    if (existsSync(target)) verify(readFileSync(target), file, `existing backup ${file.path}`);
    return { file, target };
  });
  for (const { file, target } of outputs) {
    if (existsSync(target)) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, original.subarray(file.offset, file.offset + file.bytes), { flag: "wx" });
  }
  return { outputDirectory: destination, files: outputs.map(({ file }) => file.path) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, flag, output, ...extra] = process.argv.slice(2);
    if (command === "verify" && flag === undefined) {
      const original = readHistoricalRolloutArchive();
      console.log(JSON.stringify({ verified: true, originalBytes: original.length, files: manifest.originals.length }));
    } else if (command === "restore" && flag === "--output" && output && extra.length === 0) {
      console.log(JSON.stringify(restoreHistoricalRollout(output)));
    } else {
      throw new Error("Usage: node scripts/historical-rollout.mjs verify | restore --output /absolute/directory");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
