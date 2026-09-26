import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, totalmem } from "node:os";
import { compareBenchmarkRuns, verifyBenchmarkOverheads } from "./benchmark-proof.mjs";
import { scopedBenchmarkCommand } from "./runtime-resources.mjs";

const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
export function benchmarkEnvironment(env, root) {
  const source = git(root, "rev-parse", "HEAD");
  return { ...env, ...Object.fromEntries(["AGENTIC_BUILD_ID", "AGENTIC_WORKER_VERSION", "WORKER_VERSION", "COMMIT_SHA", "COMMIT_HASH"].map(key => [key, source])) };
}
export function benchmarkControl(env) {
  const control = env.EFFICIENCY_CONTROL_WORKTREE, releaseBase = env.EFFICIENCY_CONTROL_COMMIT;
  assert.ok(control && /^[a-f0-9]{40}$/.test(releaseBase ?? ""), "Explicit benchmark control worktree and commit are required");
  assert.equal(git(control, "rev-parse", "HEAD"), releaseBase); assert.equal(git(control, "status", "--porcelain"), "");
  return { control, releaseBase };
}
export async function benchmarkServices(output, env, inventory) {
  const { control, releaseBase } = benchmarkControl(env);
  mkdirSync(output, { recursive: false, mode: 0o700 });
  const runs = [];
  for (const run of ["a", "b"]) {
    const results = { control: [], candidate: [] };
    for (const id of inventory) for (const [label, cwd] of [["control", control], ["candidate", process.cwd()]]) {
      const name = `${run}-${id}-${label}`, file = resolve(output, `${name}.json`), fd = openSync(resolve(output, `${name}.log`), "wx", 0o600);
      const code = await new Promise((done, reject) => {
        const launch = scopedBenchmarkCommand(name, [process.execPath,"--experimental-strip-types", "--import", resolve(cwd, "scripts/register-ts-path-loader.mjs"),
          "--import", resolve(cwd, "test/helpers/offline-network.mjs"), resolve("scripts/service-efficiency/benchmark-worker.mjs"), id, file]);
        const child = spawn(launch.command, launch.args, {
          cwd, env: { ...benchmarkEnvironment(env, cwd), NODE_OPTIONS: "", EFFICIENCY_RESOURCE_BOUND:"uat" }, detached: true, stdio: ["ignore", fd, fd] });
        const cancel = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* exited */ } };
        const timer = setTimeout(cancel, 200_000);
        process.once("SIGTERM", cancel); process.once("SIGINT", cancel);
        child.on("error", reject); child.on("close", code => { clearTimeout(timer); process.removeListener("SIGTERM", cancel); process.removeListener("SIGINT", cancel); done(code); });
      }).finally(() => closeSync(fd));
      assert.equal(code, 0, `Benchmark ${name} failed; inspect its immutable log`);
      results[label].push(JSON.parse(readFileSync(file, "utf8"))); console.log(JSON.stringify({ benchmark: name, passed: true }));
    }
    const comparison = compareBenchmarkRuns(results.control, results.candidate, inventory);
    verifyBenchmarkOverheads(comparison.rows);
    runs.push({ run, comparison });
  }
  assert.deepEqual(runs[0].comparison.rows.map(row => [row.id, row.semanticSha256]), runs[1].comparison.rows.map(row => [row.id, row.semanticSha256]), "Non-latency results differ across repeated benchmarks");
  const report = { version: 1, passed: true, reproducible: true, controlCommit: releaseBase, candidateCommit: git(process.cwd(), "rev-parse", "HEAD"),
    hardware: { cpus: cpus().map(row => row.model), totalMemoryBytes: totalmem(), node: process.version,
      runtimeBudget:{cpu:1,memoryBytes:2147483648,swapBytes:0},scope:"Worker and harness process including matcher threads; platform HTTP process is verified separately during deployment" },
    measurements: "Process CPU/RSS includes worker threads. IPC bytes are V8-equivalent measurement bytes; checkpoint bytes are actual encoded payload bytes. Instrumentation serialization time is reported separately. SQL counts and returned JSON bytes are attributed to awaited poll requests; background fixture setup is excluded. Queue timing runs from ThreadPool admission to postMessage; execution includes reply/checkpoint transfer. No clinical input or fixture changes.",
    normalization: "Only generated plan handles, assessment IDs and opaque result versions are removed from read comparisons. Matching results and search work counts are exact. Timing/memory diagnostics are separate.", runs };
  writeFileSync(resolve(output, "comparison.json"), JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  const rows = runs.flatMap(run => run.comparison.rows.map(row => [run.run, row.id, row.control.wallMs, row.candidate.wallMs,
    row.control.cpuMs, row.candidate.cpuMs, row.control.maxRssBytes, row.candidate.maxRssBytes,
    row.control.inputBytes, row.candidate.inputBytes, row.control.checkpointBytes, row.candidate.checkpointBytes,
    row.control.warm?.rowBytes ?? "", row.candidate.warm?.rowBytes ?? "", row.control.queue.p95Ms, row.candidate.queue.p95Ms]));
  const headers = ["run", "workload", "control_ms", "candidate_ms", "control_cpu_ms", "candidate_cpu_ms", "control_peak_rss", "candidate_peak_rss", "control_ipc_bytes", "candidate_ipc_bytes", "control_checkpoint_bytes", "candidate_checkpoint_bytes", "control_warm_db_bytes", "candidate_warm_db_bytes", "control_queue_p95_ms", "candidate_queue_p95_ms"];
  writeFileSync(resolve(output, "comparison.csv"), [headers, ...rows].map(row => row.join(",")).join("\n") + "\n", { flag: "wx" });
  writeFileSync(resolve(output, "report.html"), `<!doctype html><meta charset="utf-8"><title>Service efficiency comparison</title><style>body{font:16px system-ui;margin:32px}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #ccc}th{position:sticky;top:0;background:#eee}</style><h1>Service efficiency</h1><p>Exact semantic equality across both runs. Control ${report.controlCommit}; candidate ${report.candidateCommit}. Scoped evidence only. Timing is descriptive and each existing functional deadline remains enforced.</p><p>${report.measurements}</p><div style="overflow:auto"><table><tr>${headers.map(value => `<th>${value}</th>`).join("")}</tr>${rows.map(row => `<tr>${row.map(value => `<td>${typeof value === "number" ? value.toFixed(2) : value}</td>`).join("")}</tr>`).join("")}</table></div>`, { flag: "wx" });
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inventory = process.argv.slice(3); assert.ok(inventory.length);
  await benchmarkServices(resolve(process.argv[2]), process.env, inventory);
}
