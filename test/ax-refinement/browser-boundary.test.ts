import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {builtinModules} from 'node:module';
import {isDeepStrictEqual} from 'node:util';
import {test} from 'node:test';
import ts from 'typescript';

test('AXR-SRCH-01 shared web matcher never imports server checkpoint codecs or Node builtins',()=>{
 const root=resolve('.'),visited=new Set<string>(),violations:string[]=[];
 function visit(file:string){
  if(visited.has(file))return;
  visited.add(file);
  const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  for(const node of ast.statements){
   if(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node))continue;
   if(ts.isImportDeclaration(node)&&node.importClause?.isTypeOnly||ts.isExportDeclaration(node)&&node.isTypeOnly)continue;
   const target=node.moduleSpecifier;if(!target||!ts.isStringLiteral(target))continue;
   const name=target.text;
   if(name.startsWith('node:')||builtinModules.includes(name))violations.push(`${file}: ${name}`);
   if(!name.startsWith('@/')&&!name.startsWith('.'))continue;
   const base=name.startsWith('@/')?resolve(root,name.slice(2)):resolve(dirname(file),name);
   const dependency=[base,`${base}.ts`,`${base}.tsx`,`${base}/index.ts`].find(existsSync);
   assert.ok(dependency,`Unresolved web dependency: ${file} -> ${name}`);visit(dependency);
  }
 }
 visit(resolve('lib/matcher/adapters/web.ts'));
 assert.ok(visited.size>10,'The browser dependency graph must actually be traversed');
 assert.deepEqual(violations,[]);
});

test('AXR-SRCH-03 portable seller fact equality preserves exact map values and missing-field distinctions',async()=>{
 const {exactValueEqual}=await import('../../lib/matcher/exact-values.ts');
 const values=[undefined,null,0,-0,NaN,1n,{a:undefined},{},[1n,2],new Map([['a',1n],['b',2n]]),new Map([['b',2n],['a',1n]]),{fact:{confidence:'high',amount:1n}}, {fact:{confidence:'medium',amount:1n}}];
 for(const a of values)for(const b of values)assert.equal(exactValueEqual(a,b),isDeepStrictEqual(a,b));
 assert.equal(exactValueEqual({units:2,increment:.5},{increment:.5,units:2}),true);
});
