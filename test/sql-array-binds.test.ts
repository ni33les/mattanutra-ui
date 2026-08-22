import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("postgres text[] binds", () => {
  it("uses the sql.array helper on worker schema and task claim paths", async () => {
    const helper = await readFile("lib/sql-arrays.ts", "utf8");
    const agents = await readFile("lib/task-service-agents.ts", "utf8");
    const service = await readFile("lib/task-service.ts", "utf8");

    assert.match(helper, /export function textArray/);
    assert.match(helper, /sql\.array\(\[\.\.\.values\]\)/);
    assert.match(agents, /textArray\(configured, Object\.keys\(requiredColumns\)\)/);
    assert.doesNotMatch(
      agents,
      /table_name = any\(\$\{Object\.keys\(requiredColumns\)\}::text\[\]\)/
    );
    assert.match(service, /textArray\(sql, input\.taskTypes\)/);
    assert.match(service, /textArray\(sql, input\.reserveCapabilities\)/);
    assert.match(service, /uuidArray\(sql, input\.skipTaskIds\)/);
  });
});
