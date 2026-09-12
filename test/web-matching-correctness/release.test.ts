import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MCP_PACKAGES, packageStages, mcp721Identity, checkMcp721Proof } from '../../scripts/mcp-721-proof.mjs';
test('WM-RELEASE-01 focused release binds both bases, unchanged contract and no-new-lock verification',()=>{
 assert.equal(MCP_PACKAGES['web-matching']?.version,'11.0.0');
 assert.equal(MCP_PACKAGES['web-matching']?.base,'e46e16016fe0544d48da37224dde614bc153ee15');
 assert.ok(packageStages('web-matching').includes('no-new-locks'));
 assert.ok(!packageStages('web-matching').includes('complete-mcp-regression'));
 const deploy=readFileSync('scripts/deploy-dev.mjs','utf8');assert.match(deploy,/--web-matching-attestation/);assert.match(deploy,/--web-matching-build/);assert.match(deploy,/npmRun\("verify:dev"\)/);
});
test('WM-RELEASE-02 incomplete, wrong-environment and changed-source proofs cannot authorize deployment',()=>{
 const identity=mcp721Identity('source','commit','web-matching');
 const dir=mkdtempSync(join(tmpdir(),'web-matching-proof-')),file=join(dir,'attestation.json');
 try{for(const bad of [{environment:'prd'},{sourceCommit:'wrong'},{passed:false},{}]){
  writeFileSync(file,JSON.stringify({...identity,version:'dev-mcp-web-matching-1',environment:'dev',scope:'web_matching_correctness',contractVersion:'11.0.0',passed:true,...bad}));
  assert.throws(()=>checkMcp721Proof(file,identity,'web-matching'));
 }}finally{rmSync(dir,{recursive:true,force:true});}
});
