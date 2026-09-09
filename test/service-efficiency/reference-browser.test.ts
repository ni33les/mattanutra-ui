import assert from "node:assert/strict";
import {test} from "node:test";
import {createRequire} from "node:module";
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {runInNewContext} from "node:vm";

test("LOCK-SNAPSHOT-04 shared browser matching bundles without server async-context imports",async()=>{
  const require=createRequire(import.meta.url),root=mkdtempSync(join(tmpdir(),"matcher-browser-boundary-"));
  const {webpack}=require("next/dist/compiled/webpack/webpack");
  try {
    writeFileSync(join(root,"typescript-loader.cjs"),`const ts=require(${JSON.stringify(require.resolve("typescript"))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;`);
    writeFileSync(join(root,"entry.js"),`import {setMatcherSafetyCeilings,matcherSafetyCeilings} from ${JSON.stringify(resolve("lib/matcher/safety-ceilings.ts"))};setMatcherSafetyCeilings([{subjectId:'fixture-d3',name:'Vitamin D3',maxAmount:100,maxUnit:'mcg'}]);globalThis.referenceProbe=matcherSafetyCeilings()[0].maxAmount;`);
    const compiler=webpack({mode:"development",target:"web",entry:join(root,"entry.js"),devtool:false,
      output:{path:join(root,"out"),filename:"browser.js"},resolve:{extensions:[".ts",".js"],alias:{"@":process.cwd()}},
      module:{rules:[{test:/\.ts$/,use:join(root,"typescript-loader.cjs")}]}});
    try {
      const stats=await new Promise<{hasErrors:()=>boolean;toString:(options:unknown)=>string}>((done,reject)=>compiler.run((error:Error|null,stats:never)=>error?reject(error):done(stats)));
      assert.equal(stats.hasErrors(),false,stats.toString({all:false,errors:true}));
      const sandbox:{referenceProbe?:number}={};runInNewContext(readFileSync(join(root,"out/browser.js"),"utf8"),sandbox);
      assert.equal(sandbox.referenceProbe,100,"The real shared reference reader must execute in the browser bundle");
    } finally {await new Promise<void>((done,reject)=>compiler.close((error:Error|null)=>error?reject(error):done()));}
  } finally {rmSync(root,{recursive:true,force:true});}
});
