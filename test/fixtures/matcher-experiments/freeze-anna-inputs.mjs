/** Offline-only fixture rebuild. Reads preserved files; never imports database or network clients. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(fixtureDir, '../../..');
const baselineDir = process.argv[2];
const releaseDir = process.argv[3];
if (!baselineDir || !releaseDir) throw new Error('Usage: node freeze-anna-inputs.mjs PRESERVED_BASELINE_DIRECTORY PRESERVED_RELEASE_DIRECTORY');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
const fingerprint = value => sha(JSON.stringify(canonical(value)));
const sources = [];
async function read(file, role) {
  const bytes = await readFile(file); sources.push({ role, filename: path.basename(file), sha256: sha(bytes) }); return JSON.parse(bytes);
}
function pick(row, keys) { return Object.fromEntries(keys.filter(k => Object.hasOwn(row, k)).map(k => [k, row[k]])); }
const adminKeys = ['route','physicalUnit','unitsPerServing','doseIncrement','packQuantity','provenance'];
function administration(row) {
  if (row == null) return null;
  const out = pick(row, adminKeys);
  if (out.provenance) out.provenance = pick(out.provenance, ['status','sourceUrl','sourceText','verifiedAt']);
  return out;
}
const factKeys = ['amount','comparableAmount','confidence','source','sourceUrl','sourceText','mappingStatus','itemType','name','normalizedName','servingLabel','supplementId','unit'];
const candidateKeys = ['administration','automatedSafetyPassed','availabilityStatus','availableCountryCodes','brandStatus','currency','facts','id','imageUrl','labelStatus','platform','priceAmount','priceSource','productAudience','productKind','productUrl','region','retailAvailabilityStatus','retailSellableProductId','selectedRetailerName','selectedRetailerOrganisationId','status','title','unitPriceAmount','validation'];
const productKeys = ['audience','candidate','contributionSupplementIds','dailyPills','dietarySource','form','incompleteCommercialFacts','omegaSource','orderable','productId','retailerSku','sellerId','sellerName','source','stockStatus','unitPriceMinor'];
function catalogue(source) {
  return { ...pick(source,['availabilityAsOf','catalogueVersion','runtimeRevision']), products: source.products.map(row => {
    const out=pick(row,productKeys); out.candidate=pick(row.candidate,candidateKeys);
    out.candidate.administration=administration(row.candidate.administration);
    out.candidate.facts=row.candidate.facts.map(f=>pick(f,factKeys));
    out.candidate.validation=pick(row.candidate.validation,['checkedAt','matchableFactCount','status','reasons','summary']); return out;
  }), supplements:source.supplements.map(row=>pick(row,['acceptedUnits','aliases','name','supplementId','uuid'])) };
}
const headKeys = ['id','supplementId','version','lifeStage','sourceScope','maxAmount','maxUnit','confidence','safetyFlags','safetyNotes','sourceUrl','basisRationale'];
function catalogueCorrection(row) {
  const out=pick(row,['correctionId','entityTable','entityId','before','after','beforeFingerprint','afterFingerprint','evidence']);
  const keys=row.entityTable==='products'?['id','administration']:['id','product_id','amount','unit','name','normalized_name','serving_label','supplement_id','confidence','source','source_url','source_text'];
  out.before=pick(row.before,keys);out.after=pick(row.after,keys);
  if(row.entityTable==='products'){out.before.administration=administration(out.before.administration);out.after.administration=administration(out.after.administration);}
  out.evidence=pick(row.evidence,['sourceUrl','checkedAt','summary']);
  if(fingerprint(out)!==fingerprint(row)) throw new Error('Catalogue correction contains fields outside the privacy allowlist');
  return out;
}
function referenceReceipt(row) {
  const out=pick(row,['environment','correctionId','manifestId','supplementId','manifestSha256','beforeHeadsFingerprint','afterHeadsFingerprint','beforeHeads','afterHeads','manifest']);
  out.beforeHeads=row.beforeHeads.map(h=>pick(h,headKeys));out.afterHeads=row.afterHeads.map(h=>pick(h,headKeys));
  out.manifest=pick(row.manifest,['environment','manifestId','correctionId','supplementId','expectedHeadsFingerprint','changes','evidence']);
  out.manifest.changes=row.manifest.changes.map(c=>pick(c,['lifeStage','sourceScope','maxAmount','maxUnit','confidence','safetyFlags','safetyNotes','sourceUrl','basisRationale']));
  out.manifest.evidence=pick(row.manifest.evidence,['scopeLimitation','uncertainty','originalAdultAmount','originalHeads','adultEquivalent','reference','authority','sourceScope','checkedAt','reviewMethod','sourceUrl','originalUnits']);
  if(out.manifest.evidence.originalHeads) out.manifest.evidence.originalHeads=out.manifest.evidence.originalHeads.map(h=>pick(h,headKeys));
  if(fingerprint(out)!==fingerprint(row)) throw new Error('Reference receipt contains fields outside the privacy allowlist');
  return out;
}
function rawHead(row) { return { id:row.id,supplementId:row.supplement_id,version:Number(row.version),lifeStage:row.life_stage,sourceScope:row.source_scope,maxAmount:row.max_amount==null?null:Number(row.max_amount),maxUnit:row.max_unit,confidence:row.confidence,safetyFlags:[...(row.safety_flags??[])].sort(),safetyNotes:row.safety_notes,sourceUrl:row.source_url,basisRationale:row.basis_rationale }; }
const historical=await read(path.join(repo,'test/fixtures/anna-v6/dev-baseline.json'),'historical-request');
const request=pick(historical.request,['destinationCountry','locale','optimization','profile','medicationCodes','conditionCodes','currentSupplements','requirements','targets']);
request.profile=pick(request.profile,['ageYears','sex','lifeStage','goals']);
request.requirements=pick(request.requirements,['maxProductCount','maxDailyPills']);
request.targets=request.targets.map(row=>pick(row,['name','amount','unit']));
if (request.currentSupplements.length) throw new Error('Original deidentified case must preserve explicit empty current supplements');
const generated={};
for (const environment of ['dev','uat']) {
  const sourceStart=sources.length;
  const baselineManifest=await read(path.join(baselineDir,`${environment}-manifest.json`),'baseline-manifest');
  const database=await read(path.join(baselineDir,`${environment}-database.json`),'baseline-database');
  const matcher=await read(path.join(baselineDir,`${environment}-matcher.json`),'baseline-matcher');
  if (sources.at(-1).sha256!==baselineManifest.matcherSha256 || sources.at(-2).sha256!==baselineManifest.databaseSha256) throw new Error('Baseline source hash mismatch');
  const corrections=await read(path.join(repo,`data/corrections/anna-v6-2026-09-07/${environment}-catalogue.json`),'catalogue-manifest');
  const references=await read(path.join(repo,`data/corrections/anna-v6-2026-09-07/${environment}-references.json`),'reference-manifest');
  const after=await read(path.join(releaseDir,`${environment}-rollout-2-22bce180`,environment==='dev'?'data-after-apply.json':'reviewed-data-final.json'),'applied-receipt');
  if (after.database!==`mattanutra-${environment}` || after.catalogueEpoch!==99) throw new Error('Unexpected environment/epoch');
  const baselineCatalogue=catalogue(matcher.catalogue);
  if (fingerprint(baselineCatalogue)!==fingerprint(matcher.catalogue)) throw new Error('Allowlist changed a baseline matching field');
  const correctionIds=new Set(corrections.corrections.map(row=>row.entityId));
  const productRecords=database.tables.products.filter(row=>correctionIds.has(row.id)).map(row=>({id:row.id,administration:administration(row.administration)}));
  const factRecords=database.tables.product_facts.filter(row=>correctionIds.has(row.id)).map(row=>pick(row,['id','product_id','name','normalized_name','amount','unit','confidence','source','source_url','source_text','serving_label','supplement_id','item_type']));
  const referenceVersions=database.tables.supplement_safety_limits.map(rawHead);
  const referenceNames=Object.fromEntries(database.tables.supplements.filter(row=>referenceVersions.some(h=>h.supplementId===row.id)).map(row=>[row.id,row.name]));
  for (const row of after.references) {
    const reviewed=references.corrections.find(c=>c.correctionId===row.correctionId);
    if (!reviewed || fingerprint(reviewed)!==row.receipt.manifestSha256 || fingerprint(reviewed)!==fingerprint(row.receipt.manifest)) throw new Error('Reference receipt does not match reviewed manifest');
  }
  const input={formatVersion:1,environment,request,
    baseline:{catalogueId:matcher.catalogueId,catalogue:baselineCatalogue,productRecords,factRecords,referenceVersions,referenceNames},
    catalogueCorrections:corrections.corrections.map(catalogueCorrection),
    appliedCatalogue:after.catalogue.map(row=>({correctionId:row.correctionId,current:row.current,fingerprint:row.fingerprint,receipts:row.receipts.map(receipt=>pick(receipt,['correction_id','manifest_sha256','entity_table','entity_id','before_fingerprint','after_fingerprint']))})),
    reviewedProducts:after.reviewedProducts.map(row=>({id:row.id,title:row.title,administration:administration(row.administration)})),
    references:after.references.map(row=>({correctionId:row.correctionId,heads:row.heads.map(head=>pick(head,headKeys)),receipt:referenceReceipt(row.receipt)})),
    provenance:{inputKind:'reconstructed_corrected_baseline',baselineSourceCommit:baselineManifest.source,correctedSourceCommit:'22bce180e79c01147c95ace332af2211ada90038',baselineCatalogueId:matcher.catalogueId,baselineCatalogueFingerprint:fingerprint(baselineCatalogue),referenceEpoch:after.catalogueEpoch,sources:sources.slice(sourceStart),historicalRequestSha256:sources[0].sha256,privacy:'Opaque case IDs; no customer/contact/commerce records. Original deidentified health context remains sensitive. Only explicit catalogue/reference fields are retained.'}};
  const bytes=JSON.stringify(input,null,2)+'\n';
  const filename=`anna-${environment}.json`; await writeFile(path.join(fixtureDir,filename),bytes); generated[environment]={filename,sha256:sha(bytes)};
}
await writeFile(path.join(fixtureDir,'manifest.json'),JSON.stringify({formatVersion:1,files:generated,originalHistoricalFixtureSha256:sources[0].sha256,sourceArchive:{filename:'implementation-evidence-2026-09-07T13-07-25Z.tar.gz',sha256:'212e478dda464a112776aed80189ee0095a91abb626422dc4a73a58feb5e8107'},scope:'Offline reconstructed corrected baseline; frozen original prices and stock, not a new live catalogue observation.'},null,2)+'\n');
console.log(JSON.stringify(generated));
