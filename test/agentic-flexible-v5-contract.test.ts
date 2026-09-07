import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENTIC_INPUT_SCHEMAS, PLAN_REQUEST } from "../lib/agentic/contract/schemas.ts";
import { validateToolIssues } from "../lib/agentic/contract/validate.ts";
import { mergeRequestPatch } from "../lib/agentic/plan/request-patch.ts";
import { CLIENT_EXAMPLES, CLIENT_GUIDE_URI, GUIDE_ESSENTIALS, readContractResource } from "../lib/agentic/contract/guide.ts";
import { AGENTIC_CONTRACT_VERSION } from "../lib/agentic/config.ts";
import type { PlanRequest } from "../lib/agentic/plan/types.ts";
const request: PlanRequest = { locale: "en", destinationCountry: "TH", optimization: "balanced", profile: {}, medicationCodes: ["apixaban"], requirements: {}, targets: [{ name: "Vitamin D3", amount: 1000, unit: "IU" }] };
describe("v5 conversational contract", () => {
  it("accepts unrestricted, zero and large explicit customer ceilings", () => {
    for (const count of [undefined, null, 0, 1, 8, 31, Number.MAX_SAFE_INTEGER]) {
      assert.deepEqual(validateToolIssues(PLAN_REQUEST, { ...request, requirements: { ...(count === undefined ? {} : { maxProductCount: count }) } }), [], String(count));
    }
    for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.ok(validateToolIssues(PLAN_REQUEST, { ...request, requirements: { maxProductCount: count } }).length);
  });
  it("clears only the three ceilings, preserving undisclosed conversation context", () => {
    const base = { ...request, requirements: { maxProductCount: 2, maxDailyPills: 4, maxPriceMinor: 10000, excludeProductIds: ["prd_rejected"] } };
    const merged = mergeRequestPatch(base, { requirements: { maxProductCount: null, maxDailyPills: null, maxPriceMinor: null } });
    assert.ok(!("error" in merged));
    assert.deepEqual(merged.requirements, { maxProductCount: null, maxDailyPills: null, maxPriceMinor: null, excludeProductIds: ["prd_rejected"] });
    assert.deepEqual(merged.targets, base.targets); assert.deepEqual(merged.medicationCodes, base.medicationCodes);
    const preserved = mergeRequestPatch(base, { requirements: { dietaryPreference: "vegan" } });
    assert.ok(!("error" in preserved)); assert.equal(preserved.requirements.maxProductCount, 2);
    assert.ok("error" in mergeRequestPatch(base, { medicationCodes: null } as never));
  });
  it("publishes product quantity proposals and explicit expanded search on create/revise", () => {
    const proposed = { ...request, requirements: { productDoses: [{ productId: "prd_returned", servingsPerDay: 0.5 }] } };
    for (const args of [{ operation: "create", request: proposed, idempotencyKey: "v5-contract-create-01", searchEffort: "expanded" }, { operation: "revise", requestPatch: { requirements: { productDoses: [] } }, searchEffort: "expanded", idempotencyKey: "v5-contract-revise-01", expectedRevision: 1, planHandle: "cap_replace_with_real_returned_handle" }]) assert.deepEqual(validateToolIssues(AGENTIC_INPUT_SCHEMAS.plan, args), []);
    assert.ok(validateToolIssues(PLAN_REQUEST, { ...request, requirements: { productDoses: [{ productId: "prd_returned", servingsPerDay: 0 }] } }).length);
  });
  it("publishes v5 while preserving the complete historical v4 resources", () => {
    assert.equal(AGENTIC_CONTRACT_VERSION, "5.0.0"); assert.match(CLIENT_GUIDE_URI, /\/5\.0\.0\//);
    const old = readContractResource("mattanutra://contract/4.0.0/schema"); assert.ok(old);
    assert.equal(JSON.parse(old.contents[0].text).contractVersion, "4.0.0");
    const current = readContractResource(CLIENT_GUIDE_URI); assert.ok(current);
    for (const phrase of ["closest_dose", "review_options", "productDoses", "searchEffort", "stale_revision"]) assert.ok(current.contents[0].text.includes(phrase), phrase);
    assert.match(GUIDE_ESSENTIALS, /question.*decision/i);
    for (const example of CLIENT_EXAMPLES) assert.deepEqual(validateToolIssues(AGENTIC_INPUT_SCHEMAS[example.tool], example.arguments), [], example.name);
  });
});
