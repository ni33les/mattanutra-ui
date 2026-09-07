import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseComparisonArguments, joinCandidatePool, oraclePool, candidateEvidenceIdentity } from '../../lib/matcher/experiments/comparison.ts';
import { resolveProfile } from '../../lib/matcher/experiments/profiles.ts';
import { runExperimentSearch } from '../../lib/matcher/experiments/search.ts';
import { profileDefinition, listProfiles } from '../../lib/matcher/experiments/profiles.ts';
import { syntheticCorpus } from '../../lib/matcher/experiments/synthetic-corpus.ts';
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { catalog, product, request } from './flexible-v5-fixtures.ts';

test('EXP-COMPARE-01 validates explicit profiles, corpus, effort and evidence destination', () => {
  assert.deepEqual(parseComparisonArguments(['--list-profiles']), { listProfiles: true });
  assert.throws(() => parseComparisonArguments(['--profiles','missing','--output','/tmp/exp']), /profile/);
  assert.throws(() => parseComparisonArguments(['--profiles','all','--output','.']), /outside|absolute/);
  assert.throws(() => parseComparisonArguments(['--profiles','all','--output','/tmp/exp','--effort','infinite']), /effort/);
  assert.throws(() => parseComparisonArguments(['--profiles','all','--output','/tmp/exp','--unknown','x']), /unknown/i);
});

test('EXP-COMPARE-02 common-pool identity is independent of profile run order and includes every observed basket', () => {
  const r=request({maxDailyPills:1});const c=catalog([product('exact',{a:100}),product('partial',{a:80},50)]);
  const baseline=runExperimentSearch({request:r,catalog:c,profile:resolveProfile('baseline')});
  const other=runExperimentSearch({request:r,catalog:c,profile:resolveProfile('nutrient-quadratic__preferences-quadratic'),control:baseline});
  const one=joinCandidatePool([baseline,other]),two=joinCandidatePool([other,baseline]);
  assert.equal(one.hash,two.hash);
  assert.equal(one.candidates.length,new Set([...baseline.candidates,...other.candidates].map(row=>row.signature)).size);
  assert.ok(one.candidates.length>2);
  assert.ok(one.candidates.every(row=>!Object.hasOwn(row,'score')),'Shared pools release cached per-profile scores');
  assert.equal(joinCandidatePool([],one.candidates).hash,one.hash,'Unscored inputs preserve the same functional evidence identity');
  assert.equal(joinCandidatePool([],one.candidates).completeness,'bounded_union_of_supplied_candidates','Opaque extra candidates are not an exhaustive-grid proof');
});

test('EXP-COMPARE-03 independent explicit-grid candidates are evaluated with original quantities and prices', () => {
  const r=request();const c=catalog([product('p',{a:100},123)]);
  const result=oraclePool({id:'finite',kind:'synthetic',request:r,catalog:c,provenance:{},oracleFixture:{
    subjectUnits:{a:'mg'},targets:[{subjectId:'a',amount:100,basis:'supplemental',importance:'required'}],intake:[{subjectId:'a',scope:'supplemental',certainty:'known',amount:0},{subjectId:'a',scope:'dietary',certainty:'known',amount:0}],limits:[],
    products:[{productId:'p',sellerId:'seller',priceMinor:123,pillsPerServing:1,doses:[1,2],contributions:{a:100},eligible:true}],
    preferences:{dailyPills:null,productCount:null,priceMinor:null},currency:'THB'
  }},[resolveProfile('baseline')]);
  assert.ok(result.candidates.some(row=>row.state.selectedVariantIds.includes('seller:p:x1')));
  assert.ok(result.candidates.filter(row=>row.state.count>0).every(row=>row.state.price===123));
});

test('EXP-COMPARE-04 verifies independent full grid rankings and preserves core priority when weights are inactive', () => {
  const base=resolveProfile('baseline'),zero=resolveProfile({...profileDefinition(resolveProfile('nutrient-linear__preferences-linear')),id:'comparison-zero-weights',preferenceWeights:{productCount:'0',dailyPills:'0',priceMinor:'0'}});
  for(const input of syntheticCorpus()) {
    const result=oraclePool(input,[...listProfiles(),zero]);
    assert.equal(result.rankings.length,10);
    assert.ok(result.rankings.every(row=>row.passed&&row.actualRankedSignatures.length===row.expectedRankedSignatures.length));
    assert.ok(result.rankings.every(row=>JSON.stringify(row.actualRankedSignatures)===JSON.stringify(row.expectedRankedSignatures)));
    if(input.id.includes('SYN-09')) {
      assert.match(result.rankings.find(row=>row.profileId===base.id)!.actualSelectedSignature!,/core-exact/);
      assert.match(result.rankings.find(row=>row.profileId===zero.id)!.actualSelectedSignature!,/core-exact/);
      assert.match(result.rankings.find(row=>row.profileId==='nutrient-linear__preferences-linear')!.actualSelectedSignature!,/optional-driven/);
    }
  }
});

test('EXP-COMPARE-05 refuses missing or contradictory candidate evidence and oversized explicit grids', () => {
  const input=syntheticCorpus()[0]!,profile=resolveProfile('baseline');
  assert.throws(()=>oraclePool({...input,oracleFixture:undefined},[profile]),/Missing explicit/);
  const f=input.oracleFixture!,p=f.products[0]!;
  assert.throws(()=>oraclePool({...input,oracleFixture:{...f,products:Array.from({length:18},(_,index)=>({...p,productId:`oversized-${index}`}))}},[profile]),/enumeration limit/);
  assert.throws(()=>oraclePool({...input,oracleFixture:{...f,requiredProductIds:['not-in-grid']}},[profile]),/No feasible|empty evidence/);
  assert.throws(()=>joinCandidatePool([]),/evidence|empty/i);
  const run=runExperimentSearch({request:input.request,catalog:input.catalog,profile});
  const candidate=run.candidates.find(row=>row.state.count>0)!;
  assert.throws(()=>joinCandidatePool([run],[{...candidate,state:{...candidate.state,price:candidate.state.price+1}}]),/Contradictory/);
  const traversalOnly={...candidate,state:{...candidate.state,nextGroupIndex:candidate.state.nextGroupIndex+10,selectedVariantIds:[...candidate.state.selectedVariantIds].reverse(),selectedProductIds:[...candidate.state.selectedProductIds??[]].reverse(),exposure:new Map([...candidate.state.exposure].reverse())}};
  assert.equal(candidateEvidenceIdentity(traversalOnly),candidateEvidenceIdentity(candidate));
  assert.equal(joinCandidatePool([run],[traversalOnly]).hash,joinCandidatePool([run]).hash);
  assert.throws(()=>joinCandidatePool([run],[{...candidate,state:{...candidate.state,selectedVariantIds:[...candidate.state.selectedVariantIds,'unrecorded-dose']}}]),/Contradictory/);
});

test('EXP-COMPARE-06 validates custom parameter files, duplicates and symlinked source destinations', () => {
  const directory=mkdtempSync(join(tmpdir(),'matcher-comparison-parameters-'));
  try {
    const definition={...profileDefinition(resolveProfile('baseline')),id:'parameter-test',nutrientAlpha:'0.125',preferenceWeights:{productCount:'0.1',dailyPills:'0.2',priceMinor:'0.3'}};
    const parameters=join(directory,'profile.json');writeFileSync(parameters,JSON.stringify(definition));
    const parsed=parseComparisonArguments(['--profile-file',parameters,'--output',join(directory,'report')]);
    assert.equal(parsed.listProfiles,false);
    if(parsed.listProfiles)throw new Error('Expected selected custom profile');
    assert.equal(parsed.profiles.length,1);assert.equal(parsed.profiles[0]?.nutrientAlpha.num,1n);assert.equal(parsed.profiles[0]?.nutrientAlpha.den,8n);
    assert.equal(parsed.profiles[0]?.preferenceWeight,null);
    writeFileSync(parameters,JSON.stringify([definition,definition]));
    assert.throws(()=>parseComparisonArguments(['--profile-file',parameters,'--output',join(directory,'report')]),/Duplicate/);
    writeFileSync(parameters,JSON.stringify({...definition,nutrientAlpha:'1.1'}));
    assert.throws(()=>parseComparisonArguments(['--profile-file',parameters,'--output',join(directory,'report')]),/between|alpha/i);
    symlinkSync(process.cwd(),join(directory,'checkout-link'));
    assert.throws(()=>parseComparisonArguments(['--output',join(directory,'checkout-link','untracked-evidence')]),/outside/);
    mkdirSync(join(directory,'already-exists'));
    assert.throws(()=>parseComparisonArguments(['--output',join(directory,'already-exists')]),/exist|new/i);
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('EXP-COMPARE-07 real offline CLI lists profiles and writes complete unchanged-source synthetic evidence once', () => {
  const directory=mkdtempSync(join(tmpdir(),'matcher-comparison-cli-'));
  const args=['--experimental-strip-types','--import','./scripts/matcher-experiment-offline.mjs','--import','./scripts/register-ts-path-loader.mjs','scripts/compare-matcher-scoring.ts'];
  const run=(rest:string[])=>execFileSync(process.execPath,[...args,...rest],{cwd:resolve('.'),encoding:'utf8',timeout:120_000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
  try {
    const listing=JSON.parse(run(['--list-profiles']));
    assert.equal((Array.isArray(listing)?listing:listing.profiles).length,9);
    const output=join(directory,'evidence');run(['--profiles','baseline','--corpus','synthetic','--output',output]);
    const manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'));
    assert.equal(manifest.passed,true);assert.equal(manifest.sourceUnchanged,true);
    assert.equal(manifest.sourceBefore.sourceSha256,manifest.sourceAfter.sourceSha256);
    const report=JSON.parse(readFileSync(join(output,'report.json'),'utf8'));assert.equal(report.cases.length,12);
    for(const row of syntheticCorpus())for(const name of ['input.json','pool.jsonl','comparison.json',`${resolveProfile('baseline').id}-cross-scores.jsonl`])assert.ok(readFileSync(join(output,'cases',row.id,name)).length>0);
    for(const name of ['report.html','report.csv','profiles.json'])assert.ok(readFileSync(join(output,name)).length>0);
    const before=readFileSync(join(output,'manifest.json'));
    assert.throws(()=>run(['--profiles','baseline','--corpus','synthetic','--output',output]));
    assert.deepEqual(readFileSync(join(output,'manifest.json')),before);
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('EXP-COMPARE-08 dedicated preload prohibits even local TCP, TLS and fetch before a connection is attempted', () => {
  const probe=`import assert from 'node:assert/strict'; import net from 'node:net'; import tls from 'node:tls';
    for (const action of [()=>net.connect({host:'127.0.0.1',port:9}),()=>tls.connect({host:'127.0.0.1',port:9}),()=>fetch('http://127.0.0.1:9/')]) assert.throws(action,/Offline matcher experiment forbids network access/);
    process.stdout.write(JSON.stringify({blocked:3}));`;
  const result=execFileSync(process.execPath,['--import','./scripts/matcher-experiment-offline.mjs','--input-type=module','--eval',probe],{cwd:resolve('.'),encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']});
  assert.deepEqual(JSON.parse(result),{blocked:3});
});

test('EXP-COMPARE-09 expanded baseline consumes one 64k search budget without a preceding 8k search', async () => {
  const {compareCase}=await import('../../scripts/compare-matcher-scoring.ts');
  const directory=mkdtempSync(join(tmpdir(),'matcher-expanded-baseline-budget-'));
  const calls:{effort:string;budget:number;hasIncumbent:boolean;attempts:number}[]=[];
  const execute=(input:Parameters<typeof runExperimentSearch>[0])=>{
    const result=runExperimentSearch(input);
    calls.push({effort:input.effort??'standard',budget:result.searchSummary.expansionBudget,hasIncumbent:input.incumbent!==undefined,attempts:result.searchSummary.expansionAttempts});
    return result;
  };
  try {
    const input={id:'expanded-baseline-budget',kind:'synthetic' as const,request:request(),catalog:catalog([product('one',{a:100})]),provenance:{purpose:'Exact expanded invocation budget regression'}};
    const result=await compareCase(input,[resolveProfile('baseline')],'expanded',directory,execute);
    assert.equal(calls.length,1,'Expanded baseline must not spend a separate 8k control search first');
    assert.equal(calls[0]?.effort,'expanded');assert.equal(calls[0]?.budget,64000);assert.equal(calls[0]?.hasIncumbent,false);
    assert.ok(calls[0]!.attempts<=64000);
    assert.equal(result.row.profiles[0]?.fullSearch.searchSummary.expansionBudget,64000);
    assert.equal(result.row.profiles[0]?.fullSearch.searchSummary.expansionAttempts,calls[0]?.attempts);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
