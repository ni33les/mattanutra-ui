import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";

const locking = /\bfor\s+(?:(?:no\s+key|key)\s+)?(?:update|share)\b|\bpg_(?:try_)?advisory_(?:xact_)?lock(?:_shared)?\s*\(|\block\s+table\b/i;
function files(root, directory, extension = /\.tsx?$/) {
  return readdirSync(resolve(root, directory), {withFileTypes:true}).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(root, path, extension) : extension.test(path) ? [path] : [];
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
  const sqlFiles = [...(existsSync(resolve(root,"db-schema.sql")) ? ["db-schema.sql"] : []),
    ...["scripts","db-rollout"].flatMap(directory => existsSync(resolve(root,directory)) ? files(root,directory,/\.sql$/) : [])];
  for (const file of sqlFiles) {
    const source = readFileSync(resolve(root,file),"utf8").replace(/--[^\n]*|\/\*[\s\S]*?\*\//g," ");
    const functions = /create\s+(?:or\s+replace\s+)?function\s+([\w.\"]+)[\s\S]*?\bas\s+(\$[\w]*\$)([\s\S]*?)\2/gi;
    for (const match of source.matchAll(functions)) for (const part of match[3].split(";")) {
      const statement = part.replace(/\s+/g," ").trim(), owner = match[1];
      if (locking.test(statement)) sites.push({file,owner,key:createHash("sha256").update(file+"\0"+owner+"\0"+statement).digest("hex"),statement});
    }
    // Catch standalone migration locks too, outside function bodies.
    for (const part of source.replace(functions,"").split(";")) {
      const statement = part.replace(/\s+/g," ").trim(), owner = "migration";
      if (locking.test(statement)) sites.push({file,owner,key:createHash("sha256").update(file+"\0"+owner+"\0"+statement).digest("hex"),statement});
    }
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
