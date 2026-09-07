import ts from "typescript";

/** Inspect syntax rather than assertion strings or comments containing test examples. */
export function testSourceHygiene(source, file) {
  const failures = [];
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const testNames = new Set(["test", "it", "describe"]);
  function visit(node) {
    if (ts.isCallExpression(node)) {
      let base = node.expression;
      const modifiers = [];
      while (ts.isPropertyAccessExpression(base)) { modifiers.unshift(base.name.text); base = base.expression; }
      if (ts.isIdentifier(base) && testNames.has(base.text)) {
        const modifier = modifiers.find(value => ["only", "todo", "fixme", "skip"].includes(value)) ?? null;
        const line = parsed.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const report = reason => failures.push(`${file}:${line}: ${reason}`);
        if (["only", "todo", "fixme"].includes(modifier)) report(`Acceptance cannot use ${modifier}`);
        if (modifier === "skip" && (!node.arguments.length || ts.isStringLiteral(node.arguments[0]) || node.arguments[0].kind === ts.SyntaxKind.TrueKeyword)) report("Acceptance cannot skip a test");
        const title = node.arguments.find(ts.isStringLiteral);
        if (title && /^(?:\[(?:quarantined?|flaky)\]|(?:quarantined?|flaky)\s*:)/i.test(title.text)) report("Acceptance cannot quarantine or mark a test flaky");
        for (const argument of node.arguments) {
          if (ts.isObjectLiteralExpression(argument)) {
            for (const prop of argument.properties) {
              if (ts.isPropertyAssignment(prop) && ["skip", "todo", "only"].includes(prop.name.getText(parsed)) && prop.initializer.kind !== ts.SyntaxKind.FalseKeyword && (prop.initializer.kind === ts.SyntaxKind.TrueKeyword || ts.isStringLiteral(prop.initializer))) report(`Acceptance cannot set ${prop.name.getText(parsed)}`);
            }
          }
          if ((ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) && ts.isBlock(argument.body) && argument.body.statements.length === 0) report("Acceptance cannot contain an empty test or suite");
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return failures;
}

export function nodeExecutionProof(expectedFiles, events) {
  const expected = new Set(expectedFiles);
  const represented = new Set();
  const failures = [];
  let cases = 0;
  for (const event of events) {
    if (!expected.has(event.file)) { failures.push(`Unexpected result file: ${event.file}`); continue; }
    if (!event.passed || event.skip || event.todo || event.failureType) failures.push(`Unsuccessful case: ${event.file}: ${event.name}`);
    // Node emits a file-level pass for a module containing no registered tests.
    const fileWrapper = event.name === event.file || event.name?.endsWith(`/${event.file}`);
    if (event.type !== "suite" && !fileWrapper) { represented.add(event.file); cases += 1; }
  }
  for (const file of expected) if (!represented.has(file)) failures.push(`No executed test cases: ${file}`);
  if (!cases) failures.push("No test cases executed");
  return { passed: failures.length === 0, cases, files: represented.size, failures };
}

function browserCases(report) {
  const cases = [];
  const walk = suites => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          let file = (spec.file ?? suite.file ?? "").replaceAll("\\", "/");
          const marker = file.lastIndexOf("test/e2e/");
          file = marker >= 0 ? file.slice(marker) : `test/e2e/${file}`;
          cases.push({ key: JSON.stringify([file, spec.id ?? spec.title, spec.line, test.projectName]), file, test });
        }
      }
      walk(suite.suites);
    }
  };
  walk(report.suites);
  return cases;
}

export function browserExecutionProof(expectedFiles, discovery, report) {
  const expected = browserCases(discovery), actual = browserCases(report);
  const failures = [];
  const expectedKeys = expected.map(row => row.key).sort(), actualKeys = actual.map(row => row.key).sort();
  if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) failures.push("Browser discovery and execution case identities differ");
  if (!actual.length) failures.push("No browser cases executed");
  const files = new Set(actual.map(row => row.file));
  for (const file of expectedFiles) if (!files.has(file)) failures.push(`No executed browser cases: ${file}`);
  for (const file of files) if (!expectedFiles.includes(file)) failures.push(`Unexpected browser file: ${file}`);
  for (const { key, test } of actual) {
    if (test.status !== "expected" || test.results?.length !== 1 || test.results[0]?.status !== "passed") failures.push(`Unsuccessful or retried browser case: ${key}`);
  }
  if (report.errors?.length) failures.push("Browser run reported errors");
  if (!report.stats?.expected || report.stats.skipped || report.stats.unexpected || report.stats.flaky) failures.push("Browser totals are not completely green");
  return { passed: failures.length === 0, cases: actual.length, files: files.size, failures };
}
