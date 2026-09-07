import assert from 'node:assert/strict';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve, isAbsolute, dirname, basename, join } from 'node:path';
import { compileGroups, compileVariant } from '@/lib/matcher/candidates';
import { seedState, tryAddVariant } from '@/lib/matcher/search';
import { ratioForSupportedServings } from '@/lib/matcher/serving-grid';
import { resolveProfile, listProfiles, type ScoringProfile } from '@/lib/matcher/experiments/profiles';
import { scoreExposure } from '@/lib/matcher/experiments/score';
import { fingerprint, candidateSignature, rankCandidates, type ExperimentCandidate, type ExperimentCandidateInput, type ExperimentSearchResult } from '@/lib/matcher/experiments/search';
import { enumerateOracle, type OracleCandidate } from '@/lib/matcher/experiments/oracle';
import { serialize } from '@/lib/matcher/experiments/rational';
import type { ExperimentCase } from '@/lib/matcher/experiments/corpus-types';
import type { DoseVariant } from '@/lib/matcher/types';

export type ComparisonOptions = Readonly<{ listProfiles: true }> | Readonly<{
  listProfiles: false; profiles: readonly ScoringProfile[]; corpus: 'anna-and-synthetic'|'synthetic'|'anna'; effort:'standard'|'expanded'; output: string;
}>;
function prospectiveRealPath(path: string):string { return existsSync(path)?realpathSync(path):join(prospectiveRealPath(dirname(path)),basename(path)); }
export function parseComparisonArguments(args: readonly string[], root=process.cwd()): ComparisonOptions {
  if(args.length===1 && args[0]==='--list-profiles') return {listProfiles:true};
  const options=new Map<string,string>();
  for(let index=0;index<args.length;index+=2){const key=args[index]!,value=args[index+1];
    if(!['--profiles','--profile-file','--corpus','--effort','--output'].includes(key))throw new Error(`Unknown comparison argument ${key}`);
    if(!value||value.startsWith('--')||options.has(key))throw new Error(`Missing or repeated argument ${key}`);options.set(key,value);
  }
  const output=options.get('--output');if(!output||!isAbsolute(output))throw new Error('Evidence output must be an absolute path outside the checkout');
  const destination=prospectiveRealPath(resolve(output)),checkout=realpathSync(root);
  if(destination===checkout||destination.startsWith(checkout+'/'))throw new Error('Evidence output must be outside the checkout');
  if(existsSync(destination))throw new Error('Evidence output must be a new directory; existing results are immutable');
  const selected=options.get('--profiles')??(options.has('--profile-file')?'':'all');
  const profiles:ScoringProfile[]=selected==='all'?[...listProfiles()]:selected?selected.split(',').map(id=>resolveProfile(id)):[];
  if(options.has('--profile-file')){const definitions:unknown=JSON.parse(readFileSync(resolve(options.get('--profile-file')!),'utf8'));profiles.push(...(Array.isArray(definitions)?definitions:[definitions]).map(resolveProfile));}
  if(!profiles.length)throw new Error('At least one profile is required');
  if(new Set(profiles.map(row=>row.id)).size!==profiles.length)throw new Error('Duplicate profile IDs are not allowed');
  const corpus=options.get('--corpus')??'anna-and-synthetic';if(!['anna-and-synthetic','anna','synthetic'].includes(corpus))throw new Error('Unknown corpus');
  const effort=options.get('--effort')??'standard';if(effort!=='standard'&&effort!=='expanded')throw new Error('effort must be standard or expanded');
  if(effort==='expanded'&&corpus==='synthetic')throw new Error('Expanded comparison is for catalogue anchors; synthetic cases have an explicit finite oracle');
  return {listProfiles:false,profiles,corpus:corpus as 'anna-and-synthetic'|'synthetic'|'anna',effort,output:destination};
}
export function candidateEvidenceIdentity(candidate:ExperimentCandidateInput) {
  // Search position and insertion order are traversal metadata. The same basket
  // must retain identical amounts, commercial facts and uncertainty in every run.
  return fingerprint({sellerId:candidate.sellerId,
    selectedVariantIds:[...candidate.state.selectedVariantIds].sort(),selectedProductIds:[...candidate.state.selectedProductIds??[]].sort(),
    unknownProductIds:[...candidate.state.unknownProductIds??[]].sort(),delivered:candidate.state.delivered,exposure:candidate.state.exposure,
    count:candidate.state.count,dailyPills:candidate.state.pillCountKnown===false?null:candidate.state.pills,price:candidate.state.price});
}
export function joinCandidatePool(runs: readonly ExperimentSearchResult[], extra: readonly ExperimentCandidateInput[] = []) {
  const pool=new Map<string,ExperimentCandidateInput>();
  for(const candidate of [...extra,...runs.flatMap(run=>run.candidates)]) {
    const previous=pool.get(candidate.signature);
    if(previous)assert.equal(candidateEvidenceIdentity(previous),candidateEvidenceIdentity(candidate),`Contradictory candidate evidence for ${candidate.signature}`);
    else pool.set(candidate.signature,{signature:candidate.signature,sellerId:candidate.sellerId,state:candidate.state,groups:candidate.groups});
  }
  assert.ok(pool.size>0,'Missing candidate evidence: an empty basket must still be explicitly represented');
  const candidates=[...pool.values()].sort((a,b)=>a.signature.localeCompare(b.signature));
  return {candidates,hash:fingerprint(candidates.map(row=>({signature:row.signature,exposure:row.state.exposure,pills:row.state.pillCountKnown===false?null:row.state.pills,price:row.state.price}))),
    completeness:'bounded_union_of_supplied_candidates' as const};
}
function fromOracle(row: OracleCandidate, input: ExperimentCase, profile: ScoringProfile): ExperimentCandidate {
  const groups=compileGroups(input.request,input.catalog).map(group=>({...group,variants:[...group.variants]}));
  let state=seedState(input.request);let sellerId='';
  for(const quantity of row.quantities){
    const group=groups.find(group=>group.productId===quantity.productId&&group.sellerId===quantity.sellerId);
    assert.ok(group,`Oracle candidate is not ordinarily eligible: ${input.id}/${quantity.productId}`);
    const ratio=ratioForSupportedServings(group.product,quantity.servingsPerDay);assert.ok(ratio,`Oracle dose is not physically supported: ${input.id}/${quantity.productId}`);
    const variant=compileVariant({product:group.product,request:input.request,dailyUnits:quantity.servingsPerDay,dailyUnitsRatio:ratio});assert.ok(variant,'Oracle quantity cannot compile');
    if(!group.variants.some(v=>v.variantId===variant.variantId))(group.variants as DoseVariant[]).push(variant);
    const next=tryAddVariant(state,variant,group,input.request);assert.ok(next,`Oracle candidate violates ordinary matcher eligibility: ${input.id}/${quantity.productId}`);state=next;sellerId=quantity.sellerId;
  }
  return {signature:candidateSignature(sellerId,state),sellerId,state,groups,score:scoreExposure(profile,input.request,state.exposure,{productCount:state.count,dailyPills:state.pillCountKnown===false?null:state.pills,priceMinor:state.price,currency:input.request.currency})};
}
export function oraclePool(input: ExperimentCase, profiles: readonly ScoringProfile[]) {
  assert.ok(input.oracleFixture,`Missing explicit oracle fixture: ${input.id}`);
  const reference=enumerateOracle(input.oracleFixture,profiles);
  assert.ok(reference.candidates.length>0,`No feasible declared-grid candidate evidence: ${input.id}`);
  const candidates=reference.candidates.map(row=>fromOracle(row,input,profiles[0]!));
  let checked=0;
  for(let index=0;index<candidates.length;index++)for(const profile of profiles){
    const candidate=candidates[index]!,expected=reference.candidates[index]!.scores[profile.id]!;
    const actual=scoreExposure(profile,input.request,candidate.state.exposure,{productCount:candidate.state.count,dailyPills:candidate.state.pillCountKnown===false?null:candidate.state.pills,priceMinor:candidate.state.price,currency:input.request.currency});
    assert.deepEqual(actual.total?serialize(actual.total):null,expected.exact,`Independent objective mismatch: ${input.id}/${candidate.signature}/${profile.id}`);
    assert.deepEqual(serialize(actual.nutrientTotal),expected.quantifiedNutrientExact,`Independent nutrient mismatch: ${input.id}/${candidate.signature}/${profile.id}`);
    assert.equal(actual.complete,expected.complete,`Independent score completeness mismatch: ${input.id}/${candidate.signature}/${profile.id}`);
    checked++;
  }
  const signatures=new Map(reference.candidates.map((row,index)=>[row.signature,candidates[index]!.signature]));
  assert.equal(new Set(candidates.map(row=>row.signature)).size,candidates.length,'Distinct explicit-grid quantities collapsed into one candidate identity');
  const rankings=profiles.map(profile=>{
    const expected=reference.profiles[profile.id]!;
    const actual=rankCandidates(profile,input.request,candidates);
    const expectedRankedSignatures=expected.rankedSignatures.map(signature=>{const mapped=signatures.get(signature);assert.ok(mapped,'Independent ranking references missing grid evidence');return mapped;});
    const actualRankedSignatures=actual.rankedCandidates.map(row=>row.signature);
    assert.deepEqual(actualRankedSignatures,expectedRankedSignatures,`Independent ranking or core-priority mismatch: ${input.id}/${profile.id}`);
    const expectedSelectedSignature=expected.selectedSignature===null?null:signatures.get(expected.selectedSignature)!;
    assert.equal(actual.selected?.signature??null,expectedSelectedSignature,`Independent selected grid winner mismatch: ${input.id}/${profile.id}`);
    return {profileId:profile.id,passed:true as const,protectedPolicy:expected.protectedPolicy,expectedSelectedSignature,actualSelectedSignature:actual.selected?.signature??null,expectedRankedSignatures,actualRankedSignatures};
  });
  return {candidates,reference,checked,rankings,gridComplete:true as const,scope:'exhaustive_declared_grid_only' as const};
}
