import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { AGENTIC_PUBLIC_TOOLS } from "../lib/agentic/contract/index.ts";

function extractBalancedCalls(source: string, marker: RegExp) {
  const bodies: string[] = [];

  for (const match of source.matchAll(marker)) {
    const open = source.indexOf("{", match.index ?? 0);

    if (open < 0) {
      continue;
    }

    let depth = 0;

    for (let index = open; index < source.length; index += 1) {
      const char = source[index];

      if (char === "{") {
        depth += 1;
      }

      if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          bodies.push(source.slice(open + 1, index));
          break;
        }
      }
    }
  }

  return bodies;
}

describe("consistency r2 regression guards", () => {
  it("keeps the six MCP tools unchanged", () => {
    assert.deepEqual([...AGENTIC_PUBLIC_TOOLS], [
      "info",
      "plan",
      "execute",
      "order",
      "support",
      "feedback"
    ]);
  });

  it("keeps algae_only as its own requirements flag", async () => {
    const planCopy = await readFile("lib/agentic/contract/instructions.ts", "utf8");
    const qaPack = await readFile("test/agentic-qa-pack.test.ts", "utf8");

    assert.match(planCopy, /algae_only remains its own flag/);
    assert.match(qaPack, /omega3SourcePreference:\s*"algae_only"/);
  });

  it("forbids catalogue and matcher work inside planTool transactions", async () => {
    const source = await readFile("lib/agentic/plan/service.ts", "utf8");
    const bodies = extractBalancedCalls(
      source,
      /\.transaction\s*\(\s*async\s*\(/g
    );

    assert.ok(bodies.length >= 2, "planTool should use short prepare and persist transactions");

    for (const body of bodies) {
      assert.doesNotMatch(body, /ensureCatalogueSnapshot\s*\(/);
      assert.doesNotMatch(body, /\bbuildResult\s*\(/);
      assert.doesNotMatch(body, /\bbuildPinnedResult\s*\(/);
      assert.doesNotMatch(body, /\bmatch\s*\(/);
    }

    assert.match(source, /PLAN_MATCH_RETURN_BUDGET_MS = 1_500/);
    assert.match(source, /Promise\.race/);
    assert.match(source, /overwriteIdempotency/);
    assert.match(source, /status: "processing"/);
  });

  it("forbids catalogue load inside executeTool transactions", async () => {
    const source = await readFile("lib/agentic/commerce/execute.ts", "utf8");
    const bodies = extractBalancedCalls(
      source,
      /\.transaction\s*\(\s*async\s*\(/g
    );

    assert.ok(bodies.length >= 1);
    assert.match(source, /ensureCatalogueSnapshot\(/);

    for (const body of bodies) {
      assert.doesNotMatch(body, /ensureCatalogueSnapshot\s*\(/);
    }
  });

  it("attempts live retail catalogue on DEV instead of fixture-skipping first-create", async () => {
    const snapshot = await readFile("lib/agentic/catalogue/snapshot.ts", "utf8");
    const planService = await readFile("lib/agentic/plan/service.ts", "utf8");

    assert.match(
      snapshot,
      /environment === "dev" \|\| environment === "uat" \|\| environment === "prd"/
    );
    assert.match(snapshot, /cachedLiveRetailSnapshot\(code\)/);
    assert.doesNotMatch(planService, /fixtureSnapshot\(/);
    assert.doesNotMatch(planService, /FIXTURE_SUPPLEMENTS/);
  });
});
