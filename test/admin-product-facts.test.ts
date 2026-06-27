import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type { getSql } from "@/lib/db";
import {
  normalizedFactsForStorage,
  supplementIdsForFacts,
} from "@/lib/admin-product-facts";
import { normalizeProductFactKey } from "@/lib/product-recommendations";

function functionBody(source: string, functionName: string) {
  const signature = new RegExp(
    `(?:export\\s+)?(?:async\\s+)?function\\s+${functionName}\\s*\\(`,
  );
  const match = signature.exec(source);

  assert.ok(match, `${functionName} was not found`);

  const bodyMatch = /\)\s*(?::[^{]+)?\{/.exec(source.slice(match.index));

  assert.ok(bodyMatch, `${functionName} has no body`);

  const bodyStart =
    match.index + bodyMatch.index + bodyMatch[0].lastIndexOf("{");
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(bodyStart + 1, index);
      }
    }
  }

  throw new Error(`${functionName} body was not closed`);
}

describe("admin product facts", () => {
  it("matches canonical supplement names even when no alias row exists", async () => {
    const sql = (async () => [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Grape Seed Extract",
        normalized_alias: null,
        normalized_name: "grape_seed_extract",
      },
    ]) as unknown as NonNullable<ReturnType<typeof getSql>>;
    const facts = normalizedFactsForStorage([
      {
        amount: 50,
        name: "Grape seed extract",
        unit: "mg",
      },
    ]);
    const matches = await supplementIdsForFacts(sql, facts);

    assert.deepEqual(matches.get(normalizeProductFactKey("grape seed extract")), {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Grape Seed Extract",
    });
  });

  it("preserves submitted product fact names while linking canonical supplement ids", async () => {
    const factMatcher = await readFile("lib/admin-product-facts.ts", "utf8");

    assert.match(factMatcher, /from public\.supplements\s+left join public\.supplement_aliases/);
    assert.match(factMatcher, /supplements\.normalized_name/);

    for (const file of [
      "lib/admin-product-writes.ts",
      "lib/admin-products.ts",
    ]) {
      const source = await readFile(file, "utf8");
      const helper = functionBody(source, "replaceProductFacts");

      assert.doesNotMatch(helper, /if\s*\(!supplementId\)\s*{\s*return null;\s*}/);
      assert.match(helper, /supplement_id:\s*supplementId/);
      assert.match(helper, /name:\s*factName/);
      assert.match(helper, /normalized_name:\s*normalizeProductFactKey\(factName\)/);
      assert.doesNotMatch(helper, /canonicalName/);
      assert.doesNotMatch(helper, /name:\s*supplementMatch\?\.name/);
    }
  });
});
