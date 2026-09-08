import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { normalizePlanRequest } from "../../lib/agentic/plan/normalize.ts";
import { toCanonicalRequest } from "../../lib/agentic/plan/matching.ts";
import { compileGroups } from "../../lib/matcher/candidates.ts";
import { toMatcherProduct } from "../../lib/agentic/plan/to-matcher-product.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
import { profile, installRealCatalogue, uninstallRealCatalogue } from "./helpers.ts";

afterEach(uninstallRealCatalogue);
test("AXR-TERM-01 exact Algae Omega-3 resolves with explicit algae_only and preserves wording separately", async () => {
  const { snapshot } = await installRealCatalogue();
  const original = profile("A2"), config = loadAgenticConfig();
  const alias = await normalizePlanRequest({ config, snapshot, request: original });
  const canonical = await normalizePlanRequest({ config, snapshot, request: { ...original, targets: original.targets.map(row => row.name === "Algae Omega-3" ? { ...row, name: "Omega-3" } : row) } });
  assert.ok("state" in alias); assert.ok("state" in canonical);
  assert.equal(alias.state.targets.length, original.targets.length);
  assert.deepEqual(alias.state.targets.map(row => [row.supplementId, row.amount, row.unit]), canonical.state.targets.map(row => [row.supplementId, row.amount, row.unit]));
  assert.equal(alias.state.targets[2]!.requestedName, "Algae Omega-3");
  assert.equal(alias.state.requirements.omega3SourcePreference, "algae_only");
  const a = toCanonicalRequest(alias.state), b = toCanonicalRequest(canonical.state);
  assert.ok(!("error" in a)); assert.ok(!("error" in b));
  const catalogue = { products: snapshot.products.map(toMatcherProduct), catalogueVersion: snapshot.catalogueVersion, availabilityAsOf: snapshot.availabilityAsOf };
  assert.deepEqual(compileGroups(a, catalogue), compileGroups(b, catalogue));
});

test("AXR-TERM-02 omitted and conflicting explicit source choices survive without inference from target wording", async () => {
  const { snapshot } = await installRealCatalogue();
  for (const omega3SourcePreference of [undefined, "fish_allowed"] as const) {
    const original = profile("A2");
    const request = { ...original, requirements: { ...original.requirements, omega3SourcePreference } };
    const value = await normalizePlanRequest({ config: loadAgenticConfig(), snapshot, request });
    assert.ok("state" in value);
    assert.equal(value.state.requirements.omega3SourcePreference, omega3SourcePreference);
    assert.equal(value.state.requirements.dietaryPreference, "vegan");
    assert.ok(value.state.targets.length > 0, "Unrelated targets remain available");
    assert.ok(value.state.leftovers.some(row => row.name === "Algae Omega-3" && /algae_only|source/i.test(row.note ?? "")), "Provide a nonblocking source clarification");
  }
});
