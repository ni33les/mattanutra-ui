import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENTIC_INPUT_SCHEMAS, PLAN_REQUEST } from "../lib/agentic/contract/schemas.ts";
import { validateToolIssues } from "../lib/agentic/contract/validate.ts";
import { prepareSimpleRequest } from "../lib/agentic/plan/simple-input.ts";
import { fixtureSnapshot } from "../lib/agentic/catalogue/fixtures.ts";
import { CLIENT_EXAMPLES, CLIENT_GUIDE_URI, readContractResource } from "../lib/agentic/contract/guide.ts";
import { AGENTIC_CONTRACT_VERSION } from "../lib/agentic/config.ts";
import type { PlanRequest } from "../lib/agentic/plan/types.ts";
const request: PlanRequest = { locale: "en", destinationCountry: "TH", optimization: "balanced", profile: {}, medicationCodes: ["apixaban"], requirements: {}, targets: [{ name: "Vitamin D3", amount: 1000, unit: "IU" }] };
describe("current conversational contract", () => {
  it("accepts unrestricted, zero and large explicit customer ceilings", () => {
    for (const count of [undefined, null, 0, 1, 8, 31, Number.MAX_SAFE_INTEGER]) {
      assert.deepEqual(validateToolIssues(PLAN_REQUEST, { ...request, requirements: { ...(count === undefined ? {} : { maxProductCount: count }) } }), [], String(count));
    }
    for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.ok(validateToolIssues(PLAN_REQUEST, { ...request, requirements: { maxProductCount: count } }).length);
  });
  it("clears only the three ceilings, preserving undisclosed conversation context", () => {
    const base = { ...request, requirements: { maxProductCount: 2, maxDailyPills: 4, maxPriceMinor: 10000, excludeProductIds: ["prd_rejected"] } };
    const merged = prepareSimpleRequest({ requirements: { maxProductCount: null, maxDailyPills: null, maxPriceMinor: null } }, fixtureSnapshot(), base);
    assert.ok(!("error" in merged));
    assert.deepEqual(merged.requirements, { maxProductCount: null, maxDailyPills: null, maxPriceMinor: null, excludeProductIds: ["prd_rejected"] });
    assert.deepEqual(merged.targets, base.targets); assert.deepEqual(merged.medicationCodes, base.medicationCodes);
    const preserved = prepareSimpleRequest({ requirements: { dietaryPreference: "vegan" } }, fixtureSnapshot(), base);
    assert.ok(!("error" in preserved)); assert.equal(preserved.requirements.maxProductCount, 2);
    assert.ok(validateToolIssues(AGENTIC_INPUT_SCHEMAS.plan, { planHandle: "cap_replace_with_real_returned_handle", expectedRevision: 1, idempotencyKey: "null-context-invalid", medicationCodes: null }).length);
  });
  it("publishes product quantity proposals and explicit expanded search on create/revise", () => {
    const proposed = { locale: request.locale, destinationCountry: request.destinationCountry, targets: request.targets, requirements: { productDoses: [{ productId: "prd_returned", servingsPerDay: 0.5 }] } };
    for (const args of [{ ...proposed, idempotencyKey: "v5-contract-create-01", searchEffort: "expanded" }, { requirements: { productDoses: [] }, searchEffort: "expanded", idempotencyKey: "v5-contract-revise-01", expectedRevision: 1, planHandle: "cap_replace_with_real_returned_handle" }]) assert.deepEqual(validateToolIssues(AGENTIC_INPUT_SCHEMAS.plan, args), []);
    assert.ok(validateToolIssues(PLAN_REQUEST, { ...request, requirements: { productDoses: [{ productId: "prd_returned", servingsPerDay: 0 }] } }).length);
  });
  it("publishes only v9 with validated conversational examples", () => {
    assert.equal(AGENTIC_CONTRACT_VERSION, "11.0.0"); assert.equal(CLIENT_GUIDE_URI, `mattanutra://contract/${AGENTIC_CONTRACT_VERSION}/client-guide`);
    assert.equal(readContractResource("mattanutra://contract/4.0.0/schema"), null);
    assert.equal(readContractResource("mattanutra://contract/8.0.0/schema"), null);
    const current = readContractResource(CLIENT_GUIDE_URI); assert.ok(current);
    for (const phrase of ["productDoses", "searchEffort", "scoring", "selectedCandidateKey"]) assert.ok(current.contents[0].text.includes(phrase), phrase);
    for (const example of CLIENT_EXAMPLES) assert.deepEqual(validateToolIssues(AGENTIC_INPUT_SCHEMAS[example.tool], example.arguments), [], example.name);
  });
});
