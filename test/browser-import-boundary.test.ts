import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const builtins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sourceFiles(join(directory, entry.name))
      : /\.(ts|tsx)$/.test(entry.name) ? [join(directory, entry.name)] : []
  );
}

it("client entrypoints cannot reach Node builtins through local runtime imports", () => {
  const graph = new Map<string, string[]>();
  const clients: string[] = [];
  for (const file of ["app", "components", "lib"].flatMap(name => sourceFiles(join(root, name)))) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    if (source.statements.some(statement => ts.isExpressionStatement(statement)
      && ts.isStringLiteral(statement.expression) && statement.expression.text === "use client")) clients.push(file);
    const references: string[] = [];
    const addReference = (specifier: string) => {
      if (builtins.has(specifier)) references.push(specifier);
      else if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const base = specifier.startsWith("@/") ? join(root, specifier.slice(2)) : resolve(dirname(file), specifier);
        const target = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]
          .find(candidate => /\.(ts|tsx)$/.test(candidate) && existsSync(candidate));
        if (target) references.push(target);
      }
    };
    for (const statement of source.statements) {
      if ((!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement))
        || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        const clause = statement.importClause;
        if (clause.isTypeOnly || (!clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
          && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(item => item.isTypeOnly))) continue;
      }
      if (ts.isExportDeclaration(statement) && (statement.isTypeOnly
        || (statement.exportClause && ts.isNamedExports(statement.exportClause)
          && statement.exportClause.elements.length > 0 && statement.exportClause.elements.every(item => item.isTypeOnly)))) continue;
      addReference(statement.moduleSpecifier.text);
    }
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
        && (node.expression.kind === ts.SyntaxKind.ImportKeyword
          || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) addReference(node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    graph.set(file, references);
  }
  assert.ok(clients.length > 0, "client discovery must not silently stop working");
  const failures: string[] = [];
  for (const client of clients) {
    const seen = new Set<string>();
    const queue = [[client]];
    for (const chain of queue) {
      const file = chain.at(-1)!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const target of graph.get(file) ?? []) {
        if (builtins.has(target)) failures.push([...chain.map(item => relative(root, item)), target].join(" → "));
        else queue.push([...chain, target]);
      }
    }
  }
  assert.deepEqual(failures, [], "Move server dependencies behind a server boundary or use a browser-safe shared helper");
});
