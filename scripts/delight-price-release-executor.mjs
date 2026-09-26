import assert from 'node:assert/strict';
import {fingerprint,validateAction,actionState,fieldEqual} from './delight-price-release-core.mjs';
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const plain=value=>JSON.parse(JSON.stringify(value));
const uuid=value=>{const h=fingerprint(value);return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
export function verifyManifest(manifest){const {sha256,...body}=manifest;assert.equal(fingerprint(body),sha256,'Manifest checksum mismatch');assert.ok(['prd','uat'].includes(manifest.environment));assert.equal(manifest.database,'mattanutra-'+manifest.environment);assert.ok(manifest.actions.length);for(const a of manifest.actions){validateAction(a,{organisationId:manifest.organisationId});assert.equal(fingerprint(a.before),a.beforeFingerprint,'Before fingerprint mismatch');}assert.equal(new Set(manifest.actions.map(a=>a.id)).size,manifest.actions.length);}
async function current(tx,a){const entries=Object.entries(a.key);const rows=await tx.unsafe(`select * from public.${quote(a.table)} where ${entries.map(([k],i)=>`${quote(k)}=$${i+1}`).join(' and ')}`,entries.map(([,v])=>v));assert.ok(rows.length<=1,'Nonunique action identity');return rows[0]?plain(rows[0]):null;}
async function write(tx,a,patch=a.patch){
 const entries=Object.entries(patch);const values=entries.map(([,v])=>v);
 if(a.before===null){await tx.unsafe(`insert into public.${quote(a.table)} (${entries.map(([k])=>quote(k)).join(',')}) values (${entries.map((_,i)=>'$'+(i+1)).join(',')})`,values);}
 else{const guardKeys=new Set([...Object.keys(a.key),...Object.keys(patch),...['organisation_id','product_id','currency','current_version','status'].filter(k=>Object.hasOwn(a.before,k))]);const expected=[...guardKeys].map(k=>[k,a.before[k]]);const rows=await tx.unsafe(`update public.${quote(a.table)} set ${entries.map(([k],i)=>`${quote(k)}=$${i+1}`).join(',')},updated_at=now() where ${expected.map(([k],i)=>`${quote(k)} is not distinct from $${entries.length+i+1}`).join(' and ')} returning 1`,[...values,...expected.map(([,v])=>v)]);assert.equal(rows.length,1,`Concurrent change rejected: ${a.table} row ${a.sheetRow}`);}
}
export async function executeManifest(sql,manifest,{apply=false,isolated=false,recordProductVersion,beforeCommit}={}){
 verifyManifest(manifest);const [identity]=await sql`select current_database() database`;
 assert.ok(identity.database===manifest.database||(isolated&&new RegExp('^delight_release_'+manifest.environment+'_').test(identity.database)),'Wrong target database');
 const groups=new Map();for(const a of manifest.actions){const list=groups.get(a.productId)??[];list.push(a);groups.set(a.productId,list);}
 const outcomes=[];
 for(const [productId,actions] of groups){
  const receiptId=uuid([manifest.sha256,productId]);
  const result=await sql.begin(apply?'':'read only',async tx=>{
   await tx`set local lock_timeout='2s'`;await tx`set local statement_timeout='30s'`;
   const receipts=await tx`select metadata from admin_audit_events where id=${receiptId}::uuid`;
   if(receipts.length){assert.equal(receipts[0].metadata.manifestSha256,manifest.sha256);for(const a of actions)assert.equal(actionState(a,await current(tx,a)),'applied','Previously applied row drifted');return {productId,status:'already_applied',actions:actions.length};}
   for(const a of actions)assert.equal(actionState(a,await current(tx,a)),'pending','Unrecorded action is already applied; review required');
   // Fence availability against the existing product approval invariant.
   if(actions.some(a=>a.patch.status==='active')){const [p]=await tx`select status from products where id=${productId}::uuid`;assert.equal(p?.status,'approved');}
   if(!apply)return {productId,status:'pending',actions:actions.length};
   const records=[];
   for(const a of actions){await write(tx,a);const after=await current(tx,a);assert.equal(actionState(a,after),'applied');records.push({actionId:a.id,table:a.table,key:a.key,fields:Object.keys(a.patch),before:a.before,after});}
   if(actions.some(a=>['products','product_translations'].includes(a.table))){assert.ok(recordProductVersion,'Product version writer required');await recordProductVersion(tx,{actor:manifest.release,changeNote:`${manifest.release}; manifest ${manifest.sha256}; row ${actions[0].sheetRow}`,productId});}
   await tx`insert into admin_audit_events (id,organisation_id,action,resource_type,resource_id,metadata) values (${receiptId}::uuid,${manifest.organisationId}::uuid,'delight.price_release.applied','product',${productId}::uuid,${tx.json({release:manifest.release,manifestSha256:manifest.sha256,sheetRow:actions[0].sheetRow,records})})`;
   if(beforeCommit)await beforeCommit({tx,productId});
   return {productId,status:'applied',actions:actions.length,receiptId};
  });outcomes.push(result);
 }
 return {environment:manifest.environment,database:identity.database,manifestSha256:manifest.sha256,apply,outcomes};
}
export async function rollbackManifest(sql,manifest,{isolated=false,recordProductVersion}={}){
 verifyManifest(manifest);const [identity]=await sql`select current_database() database`;assert.ok(identity.database===manifest.database||(isolated&&new RegExp('^delight_release_'+manifest.environment+'_').test(identity.database)));
 const groups=[...new Set(manifest.actions.map(a=>a.productId))].reverse();const results=[];
 for(const productId of groups){const id=uuid([manifest.sha256,productId]);results.push(await sql.begin(async tx=>{
  await tx`set local lock_timeout='2s'`;await tx`set local statement_timeout='30s'`;
  const [receipt]=await tx`select metadata from admin_audit_events where id=${id}::uuid`;if(!receipt)return {productId,status:'never_applied'};
  assert.equal(receipt.metadata.manifestSha256,manifest.sha256);
  const rollbackId=uuid([manifest.sha256,productId,'rollback']);if((await tx`select id from admin_audit_events where id=${rollbackId}::uuid`).length)return {productId,status:'already_rolled_back'};
  const actions=manifest.actions.filter(a=>a.productId===productId).reverse();
  for(const a of actions){const now=await current(tx,a);assert.ok(now);for(const [field,value] of Object.entries(a.patch))assert.ok(fieldEqual(field,now[field],value),'Intervening edit prevents rollback');
   if(a.before===null){await write(tx,{...a,before:now},{status:'disabled'});}
   else await write(tx,{...a,before:now},Object.fromEntries(Object.keys(a.patch).map(k=>[k,a.before[k]])));
  }
  if(actions.some(a=>['products','product_translations'].includes(a.table)))await recordProductVersion(tx,{actor:manifest.release,changeNote:'Compensating rollback '+manifest.sha256,productId});
  await tx`insert into admin_audit_events (id,organisation_id,action,resource_type,resource_id,metadata) values (${rollbackId}::uuid,${manifest.organisationId}::uuid,'delight.price_release.rolled_back','product',${productId}::uuid,${tx.json({manifestSha256:manifest.sha256,originalReceipt:id})})`;
  return {productId,status:'rolled_back'};
 }));}return results;
}
