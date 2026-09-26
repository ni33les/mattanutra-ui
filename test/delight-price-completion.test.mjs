import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as core from '../scripts/delight-price-release-core.mjs';

const policy='sheet-commercial-fields-v2';
const org='delight';
const action={table:'retail_sellable_products',key:{id:'offer'},sheetRow:32,before:{id:'offer',organisation_id:org,product_id:'product',status:'active',rrp_price_amount:'711'},patch:{rrp_price_amount:'1189.00',wholesale_price_amount:'955.00'}};

test('DPC-01 explicit commercial policy applies prices to previously held rows and any listing state',()=>{
 for(const sheetRow of [4,9,13,25,32,39,47,54,68,79,93,116])for(const status of ['active','disabled','deleted'])
  assert.equal(core.validateAction({...action,sheetRow,before:{...action.before,status}},{organisationId:org,policy}),true);
 assert.throws(()=>core.validateAction(action,{organisationId:org}),/Held row/);
});
test('DPC-02 supplied retail and wholesale apply independently while blanks preserve existing values',()=>{
 assert.equal(typeof core.commercialFields,'function');
 assert.deepEqual(core.commercialFields({sheet_name:'Hair Rise',retail_proposed:'450.00',wholesale_proposed:null}).prices,{rrp_price_amount:'450.00'});
 assert.deepEqual(core.commercialFields({retail_proposed:null,wholesale_proposed:'0.00'}).prices,{wholesale_price_amount:'0.00'});
 assert.deepEqual(core.commercialFields({retail_proposed:null,wholesale_proposed:null}).prices,{});
 assert.throws(()=>core.commercialFields({retail_proposed:'-1'}),/Negative/);
});
test('DPC-03 edited pack wins over old source and ingredient strengths are never pack sizes',()=>{
 assert.equal(typeof core.commercialFields,'function');
 const row={sheet_name:"Ginsomin 20x8'S",proposed_pack_from_C:{quantity:160,unit:'unit_unspecified'},source_N_pack_for_review:{quantity:8,unit:'unit_unspecified'}};
 assert.equal(core.commercialFields(row).pack.packQuantity,160);
 assert.equal(core.commercialFields({source_N_pack_for_review:{quantity:30,unit:'capsule'}}).pack.packQuantity,30);
 assert.equal(core.commercialFields({sheet_name:'Astaxanthin 6mg'}).pack,null);
});
test('DPC-04 explicit revised pack replaces quantity without changing serving basis or verification',()=>{
 const old={route:'oral',physicalUnit:'tablet',unitsPerServing:2,doseIncrement:1,packQuantity:60,provenance:{status:'verified',sourceUrl:'https://label.example',sourceText:'Verified serving.'}};
 const changed=core.mergePackMetadata(old,{packQuantity:30,physicalUnit:'unknown',sourceText:'Supplier revised pack.'},{replacePack:true});
 assert.equal(changed.packQuantity,30);assert.equal(changed.unitsPerServing,2);assert.equal(changed.doseIncrement,1);assert.equal(changed.physicalUnit,'tablet');assert.equal(changed.provenance.status,'verified');assert.equal(old.packQuantity,60);
 assert.match(changed.provenance.sourceText,/Verified serving/);assert.match(changed.provenance.sourceText,/Supplier revised pack/);
 assert.throws(()=>core.mergePackMetadata(old,{packQuantity:30,physicalUnit:'capsule'},{replacePack:true}),/Physical unit conflict/);
});
test('DPC-05 stock-price mirroring never permits stock-count, global-price or other-pharmacy edits',()=>{
 assert.equal(core.validateAction({...action,table:'retail_product_stock',patch:{retail_price_amount:'1189.00',wholesale_price_amount:'955.00'}},{organisationId:org,policy}),true);
 for(const patch of [{stock_quantity:9},{product_id:'other'}])assert.throws(()=>core.validateAction({...action,table:'retail_product_stock',patch},{organisationId:org,policy}));
 assert.throws(()=>core.validateAction({...action,table:'products',patch:{price_amount:'1189.00'}},{organisationId:org,policy}));
 assert.throws(()=>core.validateAction({...action,before:{...action.before,organisation_id:'other'}},{organisationId:org,policy}));
 assert.throws(()=>core.validateAction(action,{organisationId:org,policy:'anything'}));
});
test('DPC-06 red rows retain their availability restriction while commercial fields are independent',()=>{
 const row={sheet_row:17,row_colour:'FFFFC7CE',sheet_name:'Unavailable product',retail_proposed:'891.00',wholesale_proposed:null};
 assert.equal(core.rowDisposition(row),'DISABLE');
 assert.equal(typeof core.commercialFields,'function');assert.equal(core.commercialFields(row).prices.rrp_price_amount,'891.00');
});
