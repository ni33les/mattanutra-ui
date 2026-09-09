import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";

const locking = /\bfor\s+(?:(?:no\s+key|key)\s+)?(?:update|share)\b|\bpg_(?:try_)?advisory_(?:xact_)?lock\s*\(/i;
function files(root, directory) {
  return readdirSync(resolve(root, directory), {withFileTypes:true}).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(root, path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}

/** Inspect SQL templates, excluding prose, comments and historical generated JSON. */
export function scanLockSites(root) {
  const sites = [];
  for (const file of [...files(root,"lib"),...files(root,"app"),...files(root,"workers")]) {
    const text = readFileSync(resolve(root,file),"utf8");
    if (!locking.test(text)) continue;
    const source = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
    function visit(node, owner="module") {
      if ((ts.isFunctionDeclaration(node)||ts.isMethodDeclaration(node)) && node.name) owner=node.name.getText(source);
      if (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer)||ts.isFunctionExpression(node.initializer))) owner=node.name.getText(source);
      if (ts.isTaggedTemplateExpression(node)) {
        const statement=node.template.getText(source).replace(/\s+/g," ").trim();
        if (locking.test(statement)) sites.push({file,owner,key:createHash("sha256").update(file+"\0"+owner+"\0"+statement).digest("hex"),statement});
      }
      ts.forEachChild(node,child=>visit(child,owner));
    }
    visit(source);
  }
  return sites.sort((a,b)=>a.file.localeCompare(b.file)||a.owner.localeCompare(b.owner)||a.key.localeCompare(b.key));
}

export function verifyLockSites(sites, register) {
  const known=new Map(register.sites.map(site=>[site.key,site]));
  const mechanisms=new Map(register.mechanisms.map(row=>[row.number,row]));
  return sites.flatMap(site=>{
    const entry=known.get(site.key);
    if (!entry) return [`Unregistered SQL lock: ${site.file}:${site.owner}`];
    if (!entry.mechanisms?.length || entry.mechanisms.some(number=>!mechanisms.get(number)?.invariant)) return [`Missing invariant: ${site.file}:${site.owner}`];
    return [];
  });
}
