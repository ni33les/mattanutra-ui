import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);

      return entry.isDirectory() ? filesUnder(path) : [path];
    })
  );

  return files.flat().filter((file) => /\.(ts|tsx)$/.test(file));
}

describe("database transaction boundaries", () => {
  it("keeps explicit transactions limited to deliberate claim/lease paths", async () => {
    const allowedTransactionCounts = new Map<string, number>([
      ["lib/communications.ts", 1],
      ["lib/task-service.ts", 6]
    ]);
    const files = [
      ...(await filesUnder("app")),
      ...(await filesUnder("lib")),
      ...(await filesUnder("workers"))
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      const count = source.match(/\bsql\.begin\s*\(/g)?.length ?? 0;
      const allowed = allowedTransactionCounts.get(file) ?? 0;

      assert.equal(
        count,
        allowed,
        `${file} has ${count} explicit sql.begin calls; expected ${allowed}`
      );
    }
  });
});
