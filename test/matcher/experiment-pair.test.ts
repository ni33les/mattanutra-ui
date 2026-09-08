import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main as verifyPairCommand, verifyComparisonPair } from "../../scripts/verify-matcher-comparison-pair.mjs";
import { canonicalJSON, fingerprint } from "../../lib/matcher/experiments/search.ts";
import { profileDefinition, resolveProfile } from "../../lib/matcher/experiments/profiles.ts";

const ids = ["anna-dev-create", "anna-dev-revise", "anna-uat-create", "anna-uat-revise"];
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
async function save(root: string, file: string, value: unknown) { await writeFile(join(root, file), canonicalJSON(value) + "\n"); }
async function artifacts(root: string, prefix = ""): Promise<{ file: string; sha256: string }[]> {
  const result: { file: string; sha256: string }[] = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await artifacts(root, file));
    else if (!["manifest.json", "latency.json", "failure.json"].includes(file)) result.push({ file, sha256: sha(await readFile(join(root, file))) });
  }
  return result.sort((a, b) => a.file.localeCompare(b.file));
}
/** Complete four-anchor evidence layout, deliberately tiny; no matcher search runs. */
async function fixture(root: string, elapsed: number) {
  await mkdir(root, { recursive: true });
  const profile = resolveProfile("baseline");
  const files = [{ file: "controlled-source.ts", sha256: sha("fixed source") }];
  const source = { commit: "a".repeat(40), files, sourceSha256: fingerprint(files) };
  await save(root, "source-before.json", source);
  await save(root, "profiles.json", [{ ...profileDefinition(profile), version: profile.version, hash: profile.hash }]);
  const cases = [], inputs = [];
  for (const id of ids) {
    const directory = `cases/${id}`; await mkdir(join(root, directory), { recursive: true });
    const input = { id, kind: "catalogue", request: { targets: [{ subjectId: "a", amount: 100, unit: "mg" }], currency: "THB" }, catalog: { catalogueVersion: "controlled", products: [{ productId: "p", unitPriceMinor: 100 }] }, provenance: { controlledReceiptFixture: true } };
    inputs.push(input); await save(root, `${directory}/input.json`, input);
    const candidate = { signature: "seller|seller:p:x1", sellerId: "seller", doses: [{ productId: "p", sellerId: "seller", variantId: "seller:p:x1", servingsPerDay: 1, ratio: { num: "1", den: "1" } }], exposure: [["a", "100000000"]], delivered: [["a", "100000000"]], productCount: 1, dailyPills: 1, priceMinor: 100, unknownProductIds: [] };
    const loser = { ...candidate, signature: 'seller|seller:p:x2', doses: [{ ...candidate.doses[0], variantId: 'seller:p:x2', servingsPerDay: 2, ratio: { num: '2', den: '1' } }], dailyPills: 2, exposure: [['a', '200000000']], delivered: [['a', '200000000']] };
    const candidates = [candidate, loser];
    const poolHash = fingerprint(candidates.map(row => ({ signature: row.signature, exposure: row.exposure, pills: row.dailyPills, price: row.priceMinor })));
    await writeFile(join(root, `${directory}/pool.jsonl`), candidates.map(canonicalJSON).join('\n') + '\n');
    const metrics = { signature: candidate.signature, productIds: ["p"], sellerId: "seller", productCount: 1, dailyPills: 1, priceMinor: 100 };
    const baseline = { selected: { ...metrics, variantIds: ["seller:p:x1"] }, searchSummary: { complete: false, expansionAttempts: 1, expansionBudget: 1 } };
    await save(root, `${directory}/baseline-result.json`, baseline);
    const score = { profile: { id: profile.id, version: profile.version, hash: profile.hash }, complete: true, total: "0", nutrientTotal: "0", preferenceTotal: "0", components: { targetUnder: "0", targetOver: "0", continued: "0", safety: "0" }, perTarget: [], perContinuedDose: [], perLimit: [], preferences: [], missingComponents: [], nutrientEvidenceComplete: true, uncertaintyNotes: [] };
    await writeFile(join(root, `${directory}/${profile.id}-cross-scores.jsonl`), candidates.map((row, index) => canonicalJSON({ signature: row.signature, profileId: profile.id, profileHash: profile.hash, total: { numerator: String(index), denominator: '1' }, nutrientTotal: { numerator: String(index), denominator: '1' }, preferenceTotal: { numerator: '0', denominator: '1' }, complete: true, nutrientEvidenceComplete: true, missingComponents: [] })).join('\n') + '\n');
    const row = { id, kind: "catalogue", baseline: metrics,
      provenance: { effort: "standard", catalogueFingerprint: fingerprint(input.catalog), requestFingerprint: fingerprint(input.request), baselineIdentity: fingerprint(baseline), poolHash, poolSize: 2 },
      profiles: [{ profileId: profile.id, profileHash: profile.hash, fullSearch: { metrics, score, searchSummary: { complete: false, expansionAttempts: 1, expansionBudget: 1 }, purchaseFallback: metrics, incompleteCandidates: { count: 0, examples: [] } }, commonPool: { metrics, score, poolHash, poolSize: 2, complete: false, purchaseFallback: metrics, incompleteCandidates: { count: 0, examples: [] } }, sensitivity: [] }] };
    cases.push(row); await save(root, `${directory}/comparison.json`, row);
  }
  const report = { title: "Controlled receipt fixture", sourceCommit: source.commit, provenance: { sourceSha256: source.sourceSha256, corpus: "anna", effort: "standard", network: "disabled", productionDefault: "unchanged" }, cases };
  await save(root, "report.json", report);
  await save(root, "summary.json", { scope: "Observed factual differences", results: cases.map(row => ({ caseId: row.id, kind: row.kind, profileId: profile.id, fullSearch: "unchanged", commonPool: "unchanged" })) });
  await writeFile(join(root, "report.html"), "<!doctype html><title>Controlled comparison</title>");
  await writeFile(join(root, "report.csv"), '"case_id","kind","profile_id"\r\n');
  await save(root, "latency.json", { descriptiveOnly: true, cases: ids.map(caseId => ({ caseId, elapsedMs: elapsed })) });
  await save(root, "manifest.json", { version: "matcher-comparison-evidence-1", passed: true, sourceUnchanged: true, sourceBefore: source, sourceAfter: source, cases: 4, profiles: 1, comparisons: 4, corpusFingerprint: fingerprint(inputs), resultFingerprint: fingerprint(report), effort: "standard", artifacts: await artifacts(root) });
}
async function pair() {
  const root = await mkdtemp(join(tmpdir(), "matcher-pair-proof-"));
  const left = join(root, "left"), right = join(root, "right");
  await fixture(left, 1); await fixture(right, 9);
  return { root, left, right };
}

test("EXP-PAIR-01 complete evidence pairs despite different latency; bounded search stays explicitly incomplete", async () => {
  const dirs = await pair();
  try {
    const result = await verifyComparisonPair(dirs.left, dirs.right);
    assert.equal(result.passed, true); assert.equal(result.cases, 4); assert.equal(result.profiles, 1);
    assert.deepEqual(result.excluded, ["latency.json"]);
    assert.ok(result.evidenceFiles.some((row: { file: string }) => row.file.endsWith("/pool.jsonl")));
    assert.ok(result.evidenceFiles.some((row: { file: string }) => row.file === "manifest.json"));
    assert.match(result.resultFingerprint, /^[a-f0-9]{64}$/);
  } finally { await rm(dirs.root, { recursive: true, force: true }); }
});

test("EXP-PAIR-02 rejects changed loser dose evidence and missing or extra artifacts", async () => {
  for (const mutation of ["dose", "missing", "extra"] as const) {
    const dirs = await pair();
    try {
      const path = join(dirs.right, `cases/${ids[0]}/pool.jsonl`);
      if (mutation === "dose") {
        const rows = (await readFile(path, "utf8")).trim().split("\n").map(line => JSON.parse(line)); rows[1].doses[0].servingsPerDay = 3; await writeFile(path, rows.map(row => JSON.stringify(row)).join("\n") + "\n");
      } else if (mutation === "missing") await rm(path);
      else await writeFile(join(dirs.right, "unreviewed.json"), "{}\n");
      await assert.rejects(verifyComparisonPair(dirs.left, dirs.right), /artifact|evidence|inventory|fingerprint/i);
    } finally { await rm(dirs.root, { recursive: true, force: true }); }
  }
});

test("EXP-PAIR-03 matching incomplete or failed manifests cannot manufacture a passing pair", async () => {
  for (const mutation of ["failed", "count", "source", "cross-scores"] as const) {
    const dirs = await pair();
    try {
      for (const root of [dirs.left, dirs.right]) {
        const file = join(root, "manifest.json"), manifest = JSON.parse(await readFile(file, "utf8"));
        if (mutation === "failed") await save(root, "failure.json", { passed: false });
        if (mutation === "count") manifest.cases = 3;
        if (mutation === "source") manifest.sourceAfter.sourceSha256 = "b".repeat(64);
        if (mutation === "cross-scores") {
          const profile = resolveProfile("baseline"); await writeFile(join(root, `cases/${ids[0]}/${profile.id}-cross-scores.jsonl`), "");
          manifest.artifacts = await artifacts(root);
        }
        await writeFile(file, canonicalJSON(manifest) + "\n");
      }
      await assert.rejects(verifyComparisonPair(dirs.left, dirs.right), /failed|failure|count|source|complete|empty|inventory/i);
    } finally { await rm(dirs.root, { recursive: true, force: true }); }
  }
});

test("EXP-PAIR-04 non-latency bytes remain meaningful after rehashing; CLI preserves input evidence", async () => {
  const dirs = await pair();
  try {
    await assert.rejects(verifyPairCommand([dirs.left, dirs.right, "--output", "relative.json"]), /ABSOLUTE/);
    await assert.rejects(verifyPairCommand([dirs.left, dirs.right, "--output", join(dirs.left, "pair.json")]), /outside both/);
    await assert.rejects(verifyComparisonPair(dirs.left, dirs.left), /distinct/);
    await writeFile(join(dirs.right, "report.html"), "<!doctype html><title>Changed report</title>");
    const manifest = JSON.parse(await readFile(join(dirs.right, "manifest.json"), "utf8"));
    manifest.artifacts = await artifacts(dirs.right);
    await save(dirs.right, "manifest.json", manifest);
    await assert.rejects(verifyComparisonPair(dirs.left, dirs.right), /artifact bytes differ/);
  } finally { await rm(dirs.root, { recursive: true, force: true }); }
});
