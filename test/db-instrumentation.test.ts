import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("db query instrumentation", () => {
  it("does not execute postgres.js helper fragments as standalone queries", async () => {
    const source = await readFile("lib/db.ts", "utf8");
    const start = source.indexOf("function instrumentSql(");
    const end = source.indexOf("\nexport async function withLocalStatementTimeout");
    const body = source.slice(start, end > start ? end : source.length);

    assert.match(source, /function isExecutableTaggedQuery\(/);
    assert.match(
      body,
      /isTaggedTemplate\(args\[0\]\) &&\s*isExecutableTaggedQuery\(args\[0\]\)/
    );
    assert.match(
      source,
      /EXECUTABLE_SQL_PREFIX[\s\S]*\^\\?\(select\|insert\|update\|delete/
    );
  });
});
