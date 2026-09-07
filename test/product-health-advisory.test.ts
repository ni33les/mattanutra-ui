import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeFact, productSafetyPasses } from "../lib/admin-product-mappers.ts";
import { productFactObservableIssueMessages, validateProduct } from "../lib/product-validation.ts";

const fact = { name: "Vitamin D3", amount: 10000, unit: "IU", maxAmount: 4000, maxUnit: "IU",
  supplementId: "11111111-1111-4111-8111-111111111111", supplementStatus: "active", confidence: "high" };
const input = { facts: [fact], imageUrl: "/healthscore/box-v7.jpg", productUrl: "https://fixture.example/vitamin-d3", labelStatus: "parsed" };

test("CAT-ADVICE-01 a verified above-limit label stays matchable with visible dose advice", () => {
  const validation = validateProduct(input);
  assert.equal(validation.status, "pass");
  assert.equal(validation.matchableFactCount, 1);
  assert.equal(productSafetyPasses([normalizeFact(fact)], [fact]), true);
  assert.ok(productFactObservableIssueMessages(fact).some(message => message.includes("4000 IU")));
});

test("CAT-ADVICE-02 explicit catalogue exclusion remains a validation failure at any dose", () => {
  for (const amount of [1000, 10000]) {
    const blocked = { ...fact, amount, supplementStatus: "blocked" };
    const validation = validateProduct({ ...input, facts: [blocked] });
    assert.equal(validation.status, "failed");
    assert.equal(validation.matchableFactCount, 0);
    assert.equal(productSafetyPasses([normalizeFact(blocked)], [blocked]), false);
  }
});

test("CAT-ADVICE-03 advisory limits never bypass missing evidence, unsupported units or concentration validation", () => {
  for (const changed of [{ amount: null }, { unit: "mystery" }, { name: "Vitamin D3 100000 IU/g" }]) {
    const validation = validateProduct({ ...input, facts: [{ ...fact, ...changed }] });
    assert.notEqual(validation.status, "pass");
    assert.equal(validation.matchableFactCount, 0);
  }
  assert.notEqual(validateProduct({ ...input, imageUrl: null }).status, "pass");
});
