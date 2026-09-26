import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const pharmacyRows=new Set([4,9,13,25,32,39,47,68,116]);
const reviewRows=new Set([54,79,93]);
const columns={
  products:new Set(['title','normalized_title','administration']),
  product_translations:new Set(['title']),
  retail_sellable_products:new Set(['status','rrp_price_amount','wholesale_price_amount']),
  retail_product_stock:new Set(['status','wholesale_price_amount'])
};
export function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 return value;
}
export const fingerprint=value=>createHash('sha256').update(Buffer.isBuffer(value)?value:JSON.stringify(canonical(value))).digest('hex');
export function decimalIdentity(value){
 const text=String(value).trim();assert.match(text,/^-?\d+(?:\.\d+)?$/,'Invalid exact decimal');
 let [whole,fraction='']=text.split('.');const negative=whole.startsWith('-');whole=whole.replace(/^-/,'').replace(/^0+(?=\d)/,'');fraction=fraction.replace(/0+$/,'');
 return (negative&&(whole!=='0'||fraction)?'-':'')+whole+(fraction?'.'+fraction:'');
}
export function rowDisposition(row){
 if(['FFFFC7CE','red','red_unavailable'].includes(row.row_colour))return 'DISABLE';
 if(pharmacyRows.has(row.sheet_row))return 'PHARMACY_CLARIFICATION';
 if(reviewRows.has(row.sheet_row))return 'PRODUCT_REVIEW_REQUIRED';
 if(row.retail_proposed==null||row.wholesale_proposed==null)return 'PHARMACY_CLARIFICATION';
 return 'READY';
}
export function commercialFields(row){
 const prices={};
 for(const [field,value] of [['rrp_price_amount',row.retail_proposed],['wholesale_price_amount',row.wholesale_proposed]]){
  if(value==null||value==='')continue;
  assert.ok(!decimalIdentity(value).startsWith('-'),'Negative price');prices[field]=String(value);
 }
 const supplied=row.proposed_pack_from_C??row.source_N_pack_for_review;
 const pack=supplied?{packQuantity:Number(supplied.quantity),physicalUnit:supplied.unit==='unit_unspecified'?'unknown':supplied.unit,sourceColumn:row.proposed_pack_from_C?'C':'N'}:null;
 if(pack)assert.ok(Number.isFinite(pack.packQuantity)&&pack.packQuantity>0,'Invalid pack quantity');
 return {title:row.sheet_name?.trim()||null,prices,pack};
}
export function mergePackMetadata(existing,pack,{replacePack=false}={}){
 assert.ok(Number.isFinite(pack.packQuantity)&&pack.packQuantity>0,'Invalid pack quantity');
 const unit=pack.physicalUnit??'unknown';
 assert.ok(['capsule','tablet','softgel','gummy','drop','ml','g','scoop','sachet','other','unknown'].includes(unit),'Invalid physical unit');
 if(existing){
  if(existing.packQuantity!=null&&existing.packQuantity!==pack.packQuantity&&!replacePack)throw Error('Pack quantity conflict');
  if(existing.physicalUnit&&existing.physicalUnit!=='unknown'&&unit!=='unknown'&&existing.physicalUnit!==unit)throw Error('Physical unit conflict');
  if(existing.packQuantity===pack.packQuantity)return structuredClone(existing);
  // Existing manufacturer serving evidence stays intact; the pharmacy identifies its sold pack.
  return {...structuredClone(existing),physicalUnit:existing.physicalUnit==='unknown'?unit:existing.physicalUnit,packQuantity:pack.packQuantity,provenance:{...existing.provenance,sourceText:[existing.provenance?.sourceText,pack.sourceText].filter(Boolean).join('\n')}};
 }
 return {route:'unknown',physicalUnit:unit,unitsPerServing:null,doseIncrement:null,packQuantity:pack.packQuantity,provenance:{status:'unverified',sourceUrl:null,sourceText:pack.sourceText??null,verifiedAt:null}};
}
export function validateAction(action,target){
 assert.ok(target.policy==null||target.policy==='sheet-commercial-fields-v2','Unknown commercial policy');
 const commercial=target.policy==='sheet-commercial-fields-v2';
 assert.ok(columns[action.table],'Unsupported action table');
 assert.ok(action.key&&Object.keys(action.key).length,'Missing identity');
 assert.ok(Object.keys(action.patch??{}).length,'Empty action');
 assert.ok(commercial||(!pharmacyRows.has(action.sheetRow)&&!reviewRows.has(action.sheetRow)),'Held row cannot execute');
 const insertion=action.before===null;
 for(const name of Object.keys(action.patch)){
  const insertOnly=insertion&&['retail_sellable_products','retail_product_stock'].includes(action.table)&&['id','organisation_id','product_id','currency','lead_time_days','backorder_policy','stock_quantity','metadata'].includes(name);
  const mirroredRetail=commercial&&action.table==='retail_product_stock'&&name==='retail_price_amount';
  assert.ok(columns[action.table].has(name)||insertOnly||mirroredRetail,`Forbidden field ${action.table}.${name}`);
 }
 if(insertion){
  assert.ok(action.table.startsWith('retail_'),'Only missing retailer offer/profile inserts allowed');
  assert.equal(action.patch.stock_quantity??0,0,'New profile cannot invent stock');
  assert.equal(action.patch.currency,'THB');
 }
 if(action.table.startsWith('retail_')){
  assert.equal((action.before??action.patch).organisation_id,target.organisationId,'Wrong pharmacy');
  assert.ok((action.before??action.patch).product_id,'Missing product identity');
 }
 if(Object.hasOwn(action.patch,'status'))assert.ok(['active','disabled'].includes(action.patch.status),'Unsupported status transition');
 for(const field of ['rrp_price_amount','retail_price_amount','wholesale_price_amount'])if(Object.hasOwn(action.patch,field)){
  const value=decimalIdentity(action.patch[field]);assert.ok(!value.startsWith('-'),'Negative price');
 }
 return true;
}
export function validateRecoveryReceipt(receipt,target){
 assert.ok(receipt,'Missing recovery receipt');
 for(const name of ['environment','database','cluster','manifestSha256'])assert.equal(receipt[name],target[name],`Backup ${name} mismatch`);
 for(const name of ['restoreVerified','allTablesAndSequencesEqual','ownershipAndGrantsEqual'])assert.equal(receipt[name],true,`Backup ${name} incomplete`);
 assert.equal(receipt.retention,'indefinite-until-user-authorizes-deletion','Backup retention is not indefinite');
 assert.equal(receipt.retentionUntil,null,'Backup must not expire');
 const start=Date.parse(receipt.startedAt),end=Date.parse(receipt.completedAt),stopped=Date.parse(target.writersStoppedAt);
 assert.ok(Number.isFinite(start)&&Number.isFinite(end)&&Number.isFinite(stopped)&&start>=stopped&&end>=start,'Backup must follow quiescence');
 return true;
}
export function verifyExecutionCases(expected,cases){
 assert.ok(expected.length&&new Set(expected).size===expected.length,'Empty or duplicate inventory');
 assert.equal(cases.length,expected.length,'Missing execution cases');
 assert.equal(new Set(cases.map(x=>x.id)).size,cases.length,'Duplicate execution');
 for(const id of expected){const item=cases.find(x=>x.id===id);assert.ok(item,`Missing ${id}`);assert.equal(item.status,'passed',`Failed/incomplete ${id}`);assert.equal(item.retries??0,0,'Retries forbidden');}
 return true;
}
export function fieldEqual(name,a,b){
 if(a==null||b==null)return a==null&&b==null;
 if(['rrp_price_amount','retail_price_amount','wholesale_price_amount','stock_quantity'].includes(name))return decimalIdentity(a)===decimalIdentity(b);
 return fingerprint(a)===fingerprint(b);
}
export function actionState(action,current){
 if(action.before===null){if(current==null)return 'pending';if(Object.entries(action.patch).every(([k,v])=>fieldEqual(k,current[k],v)))return 'applied';throw Error('Insert identity collision');}
 assert.ok(current,'Missing reviewed record');
 const fields=Object.keys(action.patch);
 if(fields.every(k=>fieldEqual(k,current[k],action.patch[k])))return 'applied';
 const stable=Object.keys(action.before).filter(k=>!['updated_at'].includes(k));
 assert.ok(stable.every(k=>fieldEqual(k,current[k],action.before[k])),'Reviewed record changed');
 return 'pending';
}
export function normalizeOwnership(rows){
 return rows.map(row=>{
  let acl=row.relacl;
  if(acl==null&&['r','p','v','m','f','S'].includes(row.relkind)){
   assert.match(row.owner,/^[a-zA-Z_][a-zA-Z0-9_]*$/,'Unusual owner requires explicit ACL review');
   acl=[`${row.owner}=${row.relkind==='S'?'rwU':'arwdDxtm'}/${row.owner}`];
  }
  return {...row,relacl:acl?[...acl].sort():null};
 });
}
export function normalizeSchema(schema){
 const next=structuredClone(schema);const positions=new Map();
 next.columns=next.columns.map(column=>{const key=column.table_schema+'.'+column.table_name;const position=(positions.get(key)??0)+1;positions.set(key,position);return {...column,ordinal_position:position};});
 next.triggers=next.triggers?.map(trigger=>{
  if(trigger.nspname!=='public'||trigger.relname!=='organisations'||trigger.tgname!=='catalogue_runtime_revision_org_changed')return trigger;
  // pg_dump/reparse flattens nested OR nodes. Accept only this exact, OR-only predicate.
  const terms=['name','organisation_type','status','country_code','currency','slug'].map(f=>`old.${f} IS DISTINCT FROM new.${f}`);
  terms.push("old.metadata -> 'customerPriceMarginPercent'::text IS DISTINCT FROM new.metadata -> 'customerPriceMarginPercent'::text");
  const expected=`CREATE TRIGGER catalogue_runtime_revision_org_changed AFTER UPDATE ON public.organisations FOR EACH ROW WHEN ${terms.join(' OR ')} EXECUTE FUNCTION bump_catalogue_runtime_revision`;
  const flattened=trigger.definition.replace(/[()]/g,'');
  return flattened===expected?{...trigger,definition:expected}:trigger;
 });
 if(next.triggers===undefined)delete next.triggers;
 return next;
}
