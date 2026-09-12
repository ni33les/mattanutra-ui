import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fixtureSnapshot } from '../../lib/agentic/catalogue/fixtures.ts';
import type { CatalogueSnapshot } from '../../lib/agentic/catalogue/types.ts';
import { productBackedSupplements, formulationAvailabilityIdentity, publishedFormulation } from '../../lib/formulation-availability.ts';
import { buildProductNeeds } from '../../lib/product-recommendations.ts';
import { formulaInput, formulaResponse } from './fixtures.ts';
import { administrationDailyPills } from '../../lib/product-administration.ts';

const snapshot = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/availability/uat-catalogue.json.gz', import.meta.url))).toString()) as CatalogueSnapshot;
const names = ['Omega-3','Magnesium','CoQ10','Vitamin D3','Probiotics','Psyllium','Vitamin B12','Plant sterols / stanols','Vitamin K2','Garlic extract standardized to allicin'];
const options = names.map(name => { const row = snapshot.supplements.find(row => row.name === name); assert.ok(row, name); return {
  id: row.uuid, name, normalizedName: name.toLowerCase().replace(/[^a-z0-9]+/g,'_'), aliases: [...row.aliases],
  category:'Foundation', listStatus:'active', maxAmount:null, maxUnit: name==='Probiotics' ? 'CFU' : 'mg', safetyFlags:[], safetyNotes:null }; });
const needs = buildProductNeeds({foodGuidance:null,formulation:{supplementBreakdown:options.map((row,index)=>({id:row.normalizedName,supplement:row.name,
  category:row.category,dailyDose:`1 ${row.maxUnit}/day`,effectivenessRank:index+1,status:'add',rationale:''}))}});
const candidates=snapshot.products.filter(row=>row.orderable).map(row=>({...row.candidate,matchingFacts:{pillCountKnown:administrationDailyPills(row.candidate.administration)!=null,
  dailyPillsPerServing:row.dailyPills,form:row.form,dietarySource:row.dietarySource,omegaSource:row.omegaSource}}));
test('AVAIL-WEB-04 frozen UAT catalogue excludes psyllium and garlic; sterols remain supported',()=>{
  assert.equal(snapshot.products.length,154);assert.equal(needs.length,10);assert.ok(candidates.length);
  const included=productBackedSupplements(options,{needs,candidates,countryCode:'TH'}).map(row=>row.name);
  assert.ok(!included.includes('Psyllium'));assert.ok(!included.includes('Garlic extract standardized to allicin'));
  assert.ok(included.includes('Plant sterols / stanols'));assert.equal(included.length,8);
});
test('AVAIL-WEB-05 numerical preferences cannot remove ingredient coverage; explicit product exclusions can',()=>{
  const input={needs,candidates,countryCode:'TH'};
  assert.deepEqual(productBackedSupplements(options,{...input,maxProducts:0,budgetAmount:0,clientContext:{pillLimit:'0'}}),productBackedSupplements(options,input));
  assert.deepEqual(productBackedSupplements(options,{...input,clientContext:{excludeProductIds:candidates.map(row=>row.id)}}),[]);
});
test('AVAIL-WEB-06 unknown and contradictory facts cannot establish permitted coverage',()=>{
  const rows=fixtureSnapshot().products.slice(0,1).map(row=>({...row.candidate,facts:row.candidate.facts.map(f=>({...f,amount:null}))}));
  assert.deepEqual(productBackedSupplements(options,{needs,candidates:rows,countryCode:'TH'}),[]);
  assert.deepEqual(productBackedSupplements(options,{needs,candidates:candidates.map(row=>({...row,facts:row.facts.map(f=>({...f,mappingStatus:'conflicting' as const}))})),countryCode:'TH'}),[]);
});
test('AVAIL-WEB-07 publication reuses frozen permitted input and rejects mismatched completion',()=>{
  const allowed=formulationAvailabilityIdentity('catalogue-before',{country:'TH'},formulaInput.canonicalSupplements);
  const formula={...formulaResponse,supplementBreakdown:[...formulaResponse.supplementBreakdown,{...formulaResponse.supplementBreakdown[0],id:'psyllium',supplement:'Psyllium',effectivenessRank:2}]};
  const result=publishedFormulation(formula,{formulationAvailability:allowed},{formulationAvailabilityIdentity:allowed.inputIdentity});
  assert.equal(result.supplementBreakdown.length,1);assert.equal(formula.supplementBreakdown.length,2);
  assert.throws(()=>publishedFormulation(formula,{formulationAvailability:allowed},{formulationAvailabilityIdentity:'wrong'}),/does not match/);
  assert.notEqual(allowed.inputIdentity,formulationAvailabilityIdentity('catalogue-after',{country:'TH'},formulaInput.canonicalSupplements).inputIdentity);
});
