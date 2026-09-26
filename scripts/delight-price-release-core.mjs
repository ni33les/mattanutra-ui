// Initial control: behaviours from the original dry-run mapping and backup gate.
import {createHash} from 'node:crypto';
export const fingerprint=v=>createHash('sha256').update(Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
export const rowDisposition=r=>[4,13,32,33,54,68,79,93].includes(r.sheet_row)?'PRODUCT_REVIEW_REQUIRED':'READY';
export const mergePackMetadata=(_old,pack)=>({route:'unknown',physicalUnit:pack.physicalUnit,unitsPerServing:null,doseIncrement:null,packQuantity:pack.packQuantity,provenance:{status:'unverified',sourceText:pack.sourceText}});
export const decimalIdentity=v=>String(Number(v));
export function validateAction(action){if(!['products','product_facts'].includes(action.table))throw Error('Unsupported correction table');}
export function validateRecoveryReceipt(proof,target){if(proof.database!==target.database||!proof.restoreVerified)throw Error('Unverified backup');}
export function verifyExecutionCases(expected,cases){if(expected.length!==cases.length)throw Error('Missing cases');}
