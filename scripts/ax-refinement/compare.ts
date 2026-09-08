import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { serialize } from "node:v8";
import { resolve } from "node:path";
import { loadFrozenAnnaInput, reconstructAnnaSnapshot } from "../../lib/matcher/experiments/frozen-corpus.ts";
import { correctedAxSnapshot } from "../../lib/agentic/catalogue/ax-corrections.ts";
import { normalizePlanRequest } from "../../lib/agentic/plan/normalize.ts";
import { toCanonicalRequest } from "../../lib/agentic/plan/matching.ts";
import { toMatcherProduct } from "../../lib/agentic/plan/to-matcher-product.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
import type { PlanRequest } from "../../lib/agentic/plan/types.ts";
import { catalogueRecordFingerprint } from "../../lib/catalogue-corrections.ts";
import { setMatcherSafetyCeilings } from "../../lib/matcher/safety-ceilings.ts";

const args = process.argv.slice(2), arg = (name: string) => args[args.indexOf(name) + 1];
const output = resolve(arg("--output")), control = resolve(arg("--control"));
assert.ok(args.includes("--output") && args.includes("--control"));
mkdirSync(output, { recursive: false });
const profiles = JSON.parse(readFileSync("test/fixtures/ax-refinement/six-profiles.json", "utf8")) as { id: string; request: PlanRequest }[];
const corrections = JSON.parse(readFileSync("test/fixtures/ax-refinement/dev-corrections.json", "utf8"));
async function run(root: string, input: unknown): Promise<Record<string, any>> {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", "--import", `${root}/scripts/register-ts-path-loader.mjs`, resolve("scripts/ax-refinement/compare-worker.mjs"), root], {
      cwd: root, env: { PATH: process.env.PATH, NODE_ENV: "test", NODE_OPTIONS: "--max-old-space-size=2200" }, stdio: ["pipe", "pipe", "pipe"] });
    let text = "", error = ""; const timer = setTimeout(() => child.kill("SIGKILL"), 90_000);
    child.stdout.on("data", bytes => { text += bytes; }); child.stderr.on("data", bytes => { error += bytes; });
    child.on("error", reject); child.on("close", code => { clearTimeout(timer); if (code !== 0) reject(new Error(`Comparison failed: ${error.slice(-2000)}`)); else { try { done(JSON.parse(text)); } catch (e) { reject(e); } } });
    child.stdin.end(serialize(input));
  });
}
const rows = [];
for (const environment of ["dev", "uat"] as const) {
  const raw = await loadFrozenAnnaInput(environment), baseline = reconstructAnnaSnapshot(raw);
  setMatcherSafetyCeilings(baseline.ceilings, { runtimeRevision: 99, fingerprint: String(baseline.provenance.reconstructedReferenceFingerprint) });
  const snapshot = environment === "dev" ? correctedAxSnapshot(baseline.snapshot, corrections).snapshot : baseline.snapshot;
  const cases = [
    { id: `Anna-${environment}-create`, request: raw.request },
    { id: `Anna-${environment}-objective-revision`, request: { ...raw.request, optimization: "lowest_cost" as const } },
    ...(environment === "dev" ? profiles : [])
  ];
  for (const item of cases) {
    const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), request: item.request, snapshot });
    assert.ok("state" in normalized, JSON.stringify(normalized));
    const request = toCanonicalRequest(normalized.state); assert.ok(!("error" in request));
    const input = { request, catalog: { catalogueVersion: snapshot.catalogueVersion, countryCode: "TH", products: snapshot.products.map(toMatcherProduct) },
      ceilings: baseline.ceilings, referenceIdentity: { runtimeRevision: 99, fingerprint: String(baseline.provenance.reconstructedReferenceFingerprint) } };
    const old = await run(control, input), candidate = await run(process.cwd(), input);
    assert.ok(old.search.expansionAttempts <= 8000 && candidate.search.expansionAttempts <= 8000);
    assert.deepEqual(input.request.safetyCeilings, baseline.ceilings, "Both runs must carry the frozen reference content in their canonical request");
    const same = JSON.stringify(old.selected) === JSON.stringify(candidate.selected);
    const present = old.explored.includes(candidate.selectedKey);
    const sameBasket = candidate.selectedKey && old.explored.some((key: string) => key.slice(key.indexOf("|") + 1) === candidate.selectedKey.slice(candidate.selectedKey.indexOf("|") + 1));
    const classification = same ? "unchanged" : present ? "explored_by_both_different_selection" : sameBasket ? "commercial_tie_lost" : "never_explored_by_control";
    const row = { id: item.id, environment, inputIdentity: createHash("sha256").update(serialize(input.request)).digest("hex"), catalogueIdentity: catalogueRecordFingerprint(snapshot),
      classification, controlBasketExploredByCandidate: candidate.explored.includes(old.selectedKey), control: { ...old, explored: undefined }, candidate: { ...candidate, explored: undefined },
      differences: { doseLoss: candidate.selected.doseFit.total - old.selected.doseFit.total, priceMinor: candidate.selected.priceMinor - old.selected.priceMinor,
        pills: candidate.selected.pills == null || old.selected.pills == null ? null : candidate.selected.pills - old.selected.pills } };
    rows.push(row); console.log(JSON.stringify({ id: item.id, classification, ...row.differences }));
  }
}
writeFileSync(resolve(output, "comparison.json"), JSON.stringify({ version: 1, controlCommit: "6baeab0e175109411585f833cbd34c12f4ca0775", budget: 8000,
  inputs: "reconstructed corrected baselines; identical canonical requests and catalogue for both implementations", rows }, null, 2), { flag: "wx" });
writeFileSync(resolve(output, "report.md"), `# Linear matcher discovery comparison\n\nIdentical frozen inputs and 8,000-attempt budgets. The larger experimental union is not treated as an optimum. Clinical reference content and linear scoring are unchanged.\n\n| Case | Discovery classification | Dose loss delta | First-order goods delta (minor THB) | Known pill delta |\n|---|---|---:|---:|---:|\n${rows.map(row => `| ${row.id} | ${row.classification} | ${row.differences.doseLoss} | ${row.differences.priceMinor} | ${row.differences.pills ?? "unknown"} |`).join("\n")}\n\nDose loss, price and convenience are separate comparisons. This report makes no universal percentage-quality claim. Review the exact basket, advice, priority and coverage in comparison.json before interpreting any cheaper result. Original six-profile outputs remain unavailable; this is a fresh paired control execution.\n`, { flag: "wx" });
