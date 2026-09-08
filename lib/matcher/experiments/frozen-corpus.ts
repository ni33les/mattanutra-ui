import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { catalogueRecordFingerprint, catalogueCorrectionState, type CatalogueCorrection } from "../../catalogue-corrections.ts";
import { supplementSafetyHeadsFingerprint, supplementSafetyCorrectionState, type SupplementSafetyHead, type SupplementSafetyCorrectionReceipt } from "../../supplement-safety-reference-corrections.ts";
import { catalogueSnapshotId } from "../../agentic/catalogue/freeze.ts";
import { snapshotFacts, toCatalogueProduct } from "../../agentic/catalogue/live.ts";
import { buildContributionIndex } from "../../agentic/catalogue/live-supplements.ts";
import { toMatcherProduct } from "../../agentic/plan/to-matcher-product.ts";
import { toCanonicalRequest } from "../../agentic/plan/matching.ts";
import { parseProductAdministration } from "../../product-administration.ts";
import { parseAdminLimitDose } from "../safety-ceilings.ts";
import { publicSupplementId } from "../../agentic/contract/ids.ts";
import { SAFETY_LIMIT_LIFE_STAGES, SAFETY_SOURCE_SCOPES } from "../types.ts";
import type { SafetyCeiling, SafetyLimitLifeStage, SafetySourceScope } from "../types.ts";
import type { CatalogueSnapshot } from "../../agentic/catalogue/types.ts";
import type { CanonicalPlanState, PlanRequest } from "../../agentic/plan/types.ts";
import type { ProductCandidateFact } from "../../product-recommendation-types.ts";
import type { ExperimentCase } from "./corpus-types.ts";

export type AnnaEnvironment = "dev" | "uat";
type MutableHead = { -readonly [K in keyof SupplementSafetyHead]: SupplementSafetyHead[K] };
export type FrozenAnnaInput = {
  formatVersion: 1;
  environment: AnnaEnvironment;
  request: PlanRequest;
  baseline: {
    catalogueId: string; catalogue: CatalogueSnapshot;
    productRecords: Record<string, unknown>[]; factRecords: Record<string, unknown>[];
    referenceVersions: MutableHead[]; referenceNames: Record<string, string>;
  };
  catalogueCorrections: CatalogueCorrection[];
  appliedCatalogue: { correctionId: string; current: Record<string, unknown>; fingerprint: string; receipts: Record<string, unknown>[] }[];
  reviewedProducts: { id: string; title: string; administration: unknown }[];
  references: { correctionId: string; heads: MutableHead[]; receipt: SupplementSafetyCorrectionReceipt }[];
  provenance: Record<string, unknown> & { baselineCatalogueFingerprint: string; referenceEpoch: number };
};

const fixtureDirectory = new URL("../../../test/fixtures/matcher-experiments/", import.meta.url);
const fingerprint = catalogueRecordFingerprint;
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
function requireEqual(actual: unknown, expected: unknown, reason: string): void {
  if (fingerprint(actual) !== fingerprint(expected)) throw new Error(reason);
}
function requireCondition(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}

/** File-byte pinning precedes parsing; all operational evidence is already preserved locally. */
export async function loadFrozenAnnaInput(environment: AnnaEnvironment): Promise<FrozenAnnaInput> {
  requireCondition(environment === "dev" || environment === "uat", "Unknown frozen environment");
  const manifest = JSON.parse(await readFile(new URL("manifest.json", fixtureDirectory), "utf8")) as {
    formatVersion: number; files: Record<AnnaEnvironment, { filename: string; sha256: string }>;
  };
  requireCondition(manifest.formatVersion === 1, "Unsupported frozen corpus manifest");
  const descriptor = manifest.files[environment];
  requireCondition(descriptor.filename === `anna-${environment}.json`, "Unexpected frozen fixture path");
  const bytes = await readFile(new URL(descriptor.filename, fixtureDirectory));
  requireCondition(sha256(bytes) === descriptor.sha256, `Frozen ${environment} fixture fingerprint changed`);
  const input = JSON.parse(bytes.toString("utf8")) as FrozenAnnaInput;
  requireCondition(input.formatVersion === 1 && input.environment === environment, "Frozen fixture environment mismatch");
  return input;
}

function latestHeads(versions: readonly SupplementSafetyHead[]): SupplementSafetyHead[] {
  const heads = new Map<string, SupplementSafetyHead>();
  const seen = new Set<string>();
  for (const row of versions) {
    requireCondition(Number.isSafeInteger(row.version) && row.version > 0, "Invalid reference version");
    const key = `${row.supplementId}:${row.lifeStage}:${row.sourceScope}`;
    const versionKey = `${key}:${row.version}`;
    requireCondition(!seen.has(versionKey), "Duplicate reference version identity");
    seen.add(versionKey);
    if (!heads.has(key) || heads.get(key)!.version < row.version) heads.set(key, row);
  }
  return [...heads.values()].sort((a, b) => `${a.supplementId}:${a.lifeStage}:${a.sourceScope}`.localeCompare(`${b.supplementId}:${b.lifeStage}:${b.sourceScope}`));
}

function correctedReferences(input: FrozenAnnaInput) {
  requireCondition(input.references.length === 6 && new Set(input.references.map(row => row.receipt.supplementId)).size === 6, "Expected six distinct reference corrections");
  let heads = latestHeads(input.baseline.referenceVersions);
  let beforeCount = 0, changedCount = 0;
  for (const row of input.references) {
    const receipt = row.receipt, correction = receipt.manifest;
    requireCondition(receipt.environment === input.environment && correction.environment === input.environment && row.correctionId === receipt.correctionId && receipt.correctionId === correction.correctionId && receipt.supplementId === correction.supplementId && receipt.manifestId === correction.manifestId, "Reference receipt identity mismatch");
    const before = heads.filter(head => head.supplementId === correction.supplementId);
    requireCondition(supplementSafetyCorrectionState(correction, before, null) === "pending", "Reference before state is not the reviewed baseline");
    requireEqual(before, [...receipt.beforeHeads].sort((a,b) => `${a.supplementId}:${a.lifeStage}:${a.sourceScope}`.localeCompare(`${b.supplementId}:${b.lifeStage}:${b.sourceScope}`)), "Reference before-head relationship changed");
    requireCondition(supplementSafetyHeadsFingerprint(before) === receipt.beforeHeadsFingerprint, "Reference before fingerprint mismatch");
    requireEqual(row.heads, receipt.afterHeads, "Reference after-head receipt mismatch");
    requireCondition(supplementSafetyCorrectionState(correction, row.heads, receipt) === "already_applied", "Reference after state is not the applied receipt");
    const byBand = new Map(before.map(head => [`${head.lifeStage}:${head.sourceScope}`, head]));
    const changedBands = new Set(correction.changes.map(change => `${change.lifeStage}:${change.sourceScope}`));
    requireCondition(row.heads.length === new Set([...byBand.keys(), ...changedBands]).size, "Reference correction lost or duplicated a scope");
    for (const change of correction.changes) {
      const previous = byBand.get(`${change.lifeStage}:${change.sourceScope}`);
      const actual = row.heads.find(head => head.lifeStage === change.lifeStage && head.sourceScope === change.sourceScope);
      requireCondition(actual && actual.supplementId === correction.supplementId && actual.version === (previous?.version ?? 0) + 1 && actual.id !== previous?.id, "Reference append identity/version mismatch");
      requireEqual({ ...actual, id: undefined, version: undefined }, {
        supplementId: correction.supplementId, lifeStage: change.lifeStage, sourceScope: change.sourceScope,
        maxAmount: change.maxAmount, maxUnit: change.maxUnit, confidence: change.confidence,
        safetyFlags: [...new Set(change.safetyFlags)].sort(), safetyNotes: change.safetyNotes,
        sourceUrl: change.sourceUrl ?? null, basisRationale: change.basisRationale ?? null,
        id: undefined, version: undefined
      }, "Reference correction business fields changed");
    }
    for (const previous of before.filter(head => !changedBands.has(`${head.lifeStage}:${head.sourceScope}`))) {
      requireEqual(row.heads.find(head => head.lifeStage === previous.lifeStage && head.sourceScope === previous.sourceScope), previous, "Reference correction changed an unreviewed band");
    }
    heads = [...heads.filter(head => head.supplementId !== correction.supplementId), ...row.heads];
    beforeCount += before.length; changedCount += correction.changes.length;
  }
  requireCondition(beforeCount === 18 && changedCount === 31, "Unexpected reviewed reference correction coverage");
  heads.sort((a,b) => `${a.supplementId}:${a.lifeStage}:${a.sourceScope}`.localeCompare(`${b.supplementId}:${b.lifeStage}:${b.sourceScope}`));
  const ceilings: SafetyCeiling[] = [];
  for (const head of heads) {
    // Null remains a head until projection. Never select an older positive row.
    if (head.maxAmount === null) continue;
    const dose = parseAdminLimitDose(head.maxAmount, head.maxUnit);
    if (!dose || !(SAFETY_LIMIT_LIFE_STAGES as readonly string[]).includes(head.lifeStage) || !(SAFETY_SOURCE_SCOPES as readonly string[]).includes(head.sourceScope)) continue;
    const name = input.baseline.referenceNames[head.supplementId];
    requireCondition(name, "Reference supplement identity is missing from the preserved snapshot");
    const ceiling: SafetyCeiling = {
      bandId: head.id, bandVersion: head.version, name, subjectId: head.supplementId,
      lifeStage: head.lifeStage as SafetyLimitLifeStage, sourceScope: head.sourceScope as SafetySourceScope,
      maxAmount: dose.amount, maxUnit: dose.unit,
      referenceConfidence: head.confidence === "high" || head.confidence === "moderate" ? head.confidence : "low",
      basisRationale: head.basisRationale, ...(head.sourceUrl?.trim() ? { authorityUrl: head.sourceUrl.trim() } : {})
    };
    ceilings.push(ceiling, { ...ceiling, subjectId: publicSupplementId(head.supplementId) });
  }
  return { ceilings, heads };
}

/** Pure reconstruction: exact reviewed mutations, preserved seller quotes, no scoring or I/O. */
export function reconstructAnnaSnapshot(input: FrozenAnnaInput) {
  const baseline = input.baseline.catalogue;
  requireCondition(fingerprint(baseline) === input.provenance.baselineCatalogueFingerprint, "Baseline catalogue fingerprint changed");
  requireCondition(baseline.products.length === 154 && new Set(baseline.products.map(p => p.productId)).size === 79, "Expected the complete 154-listing/79-product baseline");
  requireCondition(input.catalogueCorrections.length === 60 && new Set(input.catalogueCorrections.map(c => c.correctionId)).size === 60, "Expected 60 distinct catalogue corrections");
  requireCondition(input.appliedCatalogue.length === 60, "Expected all applied catalogue receipts");
  const productChanges = new Map<string, CatalogueCorrection>();
  const factChanges = new Map<string, { correction: CatalogueCorrection; raw: Record<string, unknown> }[]>();
  for (const correction of input.catalogueCorrections) {
    const rows = correction.entityTable === "products" ? input.baseline.productRecords : input.baseline.factRecords;
    const matches = rows.filter(row => row.id === correction.entityId);
    requireCondition(matches.length === 1, "Catalogue before-record identity missing or duplicated");
    requireCondition(catalogueCorrectionState(correction, matches[0]!) === "pending", "Catalogue before-record is not the reviewed baseline");
    const applied = input.appliedCatalogue.filter(row => row.correctionId === correction.correctionId);
    requireCondition(applied.length === 1 && applied[0]!.fingerprint === correction.afterFingerprint, "Applied catalogue fingerprint mismatch");
    requireEqual(applied[0]!.current, correction.after, "Applied catalogue after-record mismatch");
    requireCondition(applied[0]!.receipts.length === 1, "Expected exactly one catalogue correction receipt");
    requireEqual(applied[0]!.receipts[0], {
      correction_id: correction.correctionId, manifest_sha256: fingerprint({ version: 1, environment: input.environment, corrections: input.catalogueCorrections }), entity_table: correction.entityTable,
      entity_id: correction.entityId, before_fingerprint: correction.beforeFingerprint, after_fingerprint: correction.afterFingerprint
    }, "Catalogue receipt identity/fingerprint mismatch");
    if (correction.entityTable === "products") {
      requireCondition(!productChanges.has(correction.entityId), "Duplicate product correction identity");
      productChanges.set(correction.entityId, correction);
    } else {
      const productId = String(matches[0]!.product_id);
      factChanges.set(productId, [...(factChanges.get(productId) ?? []), { correction, raw: matches[0]! }]);
    }
  }
  requireCondition(productChanges.size === 57 && [...factChanges.values()].flat().length === 3, "Expected 57 administration and three fact corrections");
  const index = buildContributionIndex(baseline.supplements);
  const touchedProducts = new Set<string>(), touchedFacts = new Set<string>();
  const products = baseline.products.map(product => {
    const candidate = { ...structuredClone(product.candidate) };
    const correction = productChanges.get(candidate.id);
    if (correction) {
      requireEqual(candidate.administration, parseProductAdministration(correction.before.administration), "Product before administration differs from matching snapshot");
      candidate.administration = parseProductAdministration(correction.after.administration);
      touchedProducts.add(candidate.id);
    }
    for (const { correction: factCorrection, raw } of factChanges.get(candidate.id) ?? []) {
      const matches = candidate.facts.map((fact, i) => ({ fact, i })).filter(({ fact }) =>
        fact.name === raw.name && fact.unit === raw.unit && fact.amount === Number(raw.amount) && fact.supplementId === raw.supplement_id && fact.normalizedName === raw.normalized_name && fact.confidence === raw.confidence && (fact.sourceUrl ?? null) === (raw.source_url ?? null) && (fact.sourceText ?? null) === (raw.source_text ?? null));
      requireCondition(matches.length === 1, "Exact raw fact before identity is missing or ambiguous in matching snapshot");
      const { fact, i } = matches[0]!;
      const after = { ...raw, ...factCorrection.after };
      const supplement = baseline.supplements.find(row => row.uuid === after.supplement_id);
      requireCondition(supplement, "Corrected fact lost its supplement identity");
      const rebuilt = snapshotFacts([{ ...fact, amount: after.amount, unit: after.unit, name: after.name,
        confidence: after.confidence, source: after.source, sourceUrl: after.source_url, sourceText: after.source_text,
        normalizedName: after.normalized_name, supplementId: after.supplement_id, servingLabel: after.serving_label,
        mappedName: supplement.name, mappedAliases: supplement.aliases }]);
      requireCondition(rebuilt.length === 1 && rebuilt[0]!.mappingStatus === fact.mappingStatus, "Corrected fact mapping relationship changed");
      candidate.facts = candidate.facts.map((row, position) => position === i ? rebuilt[0] as ProductCandidateFact : row);
      touchedFacts.add(factCorrection.entityId);
    }
    if (!correction && !factChanges.has(candidate.id)) return structuredClone(product);
    const rebuilt = toCatalogueProduct(candidate, baseline.supplements, index);
    requireCondition(rebuilt, "Reconstructed catalogue unexpectedly removed a preserved listing");
    requireEqual([rebuilt.productId, rebuilt.sellerId, rebuilt.retailerSku, rebuilt.unitPriceMinor, rebuilt.stockStatus],
      [product.productId, product.sellerId, product.retailerSku, product.unitPriceMinor, product.stockStatus], "Reconstruction changed frozen seller/price/stock identity");
    return rebuilt;
  });
  requireCondition(touchedProducts.size === 57 && touchedFacts.size === 3, "Reviewed corrections did not reach every preserved matching product/fact");
  requireCondition(input.reviewedProducts.length === 79 && new Set(input.reviewedProducts.map(row => row.id)).size === 79, "Expected the full 79-product review");
  for (const row of input.reviewedProducts) {
    const listings = products.filter(product => product.candidate.id === row.id);
    requireCondition(listings.length > 0 && listings.every(product => product.candidate.title === row.title), "Reviewed product identity missing from frozen catalogue");
    for (const product of listings) requireEqual(product.candidate.administration, parseProductAdministration(row.administration), "Reviewed product administration mismatch");
  }
  const { ceilings, heads } = correctedReferences(input);
  requireCondition(input.provenance.referenceEpoch === 99, "Unexpected corrected reference epoch");
  const snapshot: CatalogueSnapshot = { ...baseline, runtimeRevision: 99, catalogueVersion: `${baseline.catalogueVersion}:offline-corrected-${input.environment}`, products };
  return { snapshot, ceilings, provenance: { ...input.provenance, reconstructedCatalogueId: catalogueSnapshotId(snapshot), reconstructedReferenceFingerprint: fingerprint(heads), retiredReferenceHeads: heads.filter(head => head.maxAmount === null).length } };
}

// The production normalizer consults market discovery. Run it without inherited
// credentials and with transport disabled, using its existing TH fallback.
const normalizeScript = `
import net from 'node:net'; import tls from 'node:tls';
const denied=()=>{throw new Error('Offline corpus forbids network access')};
net.Socket.prototype.connect=denied; tls.connect=denied; globalThis.fetch=denied;
let text=''; for await (const chunk of process.stdin) text+=chunk;
const {normalizePlanRequest}=await import(process.argv[1]);
const jobs=JSON.parse(text); const states=[];
for(const job of jobs){
 const config={activeMarkets:['TH'],buildId:'offline-corpus',capabilitySecret:'synthetic-offline-unused',checkoutTtlMs:900000,continuation:'polling_only',planTtlMs:604800000,environment:'dev',internalQaHarness:true,paymentProvider:'mock',siteUrl:'https://offline.invalid',thailandRetailerAdapter:'mock_thailand',userAccountRequired:false};
 const result=await normalizePlanRequest({config,request:job.request,snapshot:job.snapshot});
 if('error' in result) throw new Error('Frozen request normalization failed: '+JSON.stringify(result));
 states.push(result.state);
}
process.stdout.write(JSON.stringify(states));
`;
async function normalizeOffline(jobs: { request: PlanRequest; snapshot: CatalogueSnapshot }[]): Promise<CanonicalPlanState[]> {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", "--import", fileURLToPath(new URL("../../../scripts/register-ts-path-loader.mjs", import.meta.url)), "--input-type=module", "-e", normalizeScript, new URL("../../agentic/plan/normalize.ts", import.meta.url).href], {
      cwd: root, env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", LANG: "C.UTF-8", TZ: "UTC", NODE_NO_WARNINGS: "1" }, stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
    child.stdout.on("data", chunk => { stdout += String(chunk); });
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Offline request normalization failed (${code}): ${stderr.slice(-3000)}`));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error("Offline normalizer did not return complete structured states")); }
    });
    child.stdin.on("error", error => reject(error));
    child.stdin.end(JSON.stringify(jobs));
  });
}

export async function loadAnnaCases(): Promise<ExperimentCase[]> {
  const environments: AnnaEnvironment[] = ["dev", "uat"];
  const inputs = await Promise.all(environments.map(loadFrozenAnnaInput));
  const jobs = inputs.flatMap(input => {
    const reconstructed = reconstructAnnaSnapshot(input);
    return (["lowest_cost", "best_coverage"] as const).map(optimization => ({ input, ...reconstructed, request: { ...input.request, optimization } }));
  });
  const states = await normalizeOffline(jobs);
  requireCondition(states.length === jobs.length, "Offline normalizer omitted a case");
  return jobs.map((job, i) => {
    const request = toCanonicalRequest(states[i]!);
    requireCondition(!("error" in request), "Frozen request failed canonical conversion");
    return {
      id: `anna-${job.input.environment}-${i % 2 === 0 ? "create" : "revise"}`, kind: "catalogue",
      request: { ...request, safetyCeilings: job.ceilings },
      catalog: { availabilityAsOf: job.snapshot.availabilityAsOf, catalogueVersion: job.provenance.reconstructedCatalogueId, products: job.snapshot.products.map(toMatcherProduct) },
      provenance: { ...job.provenance, environment: job.input.environment, requestRevision: i % 2, normalizationNetwork: "disabled" }
    };
  });
}
