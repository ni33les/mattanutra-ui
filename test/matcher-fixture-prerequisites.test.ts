import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMatcherFixtureCounts } from "../scripts/matcher-fixture-prerequisites.mjs";
import * as prerequisites from "../scripts/matcher-fixture-prerequisites.mjs";

const complete = { products: 3, productFacts: 4, supplements: 2, retailListings: 3, safetyReferences: 5 };
test("MCP-FIXTURE-01 schema-only and reference-free fixtures cannot qualify the maintained MCP pack", () => {
  for (const field of Object.keys(complete)) {
    assert.throws(() => validateMatcherFixtureCounts({ ...complete, [field]: 0 }), new RegExp(field));
    assert.throws(() => validateMatcherFixtureCounts({ ...complete, [field]: undefined }), new RegExp(field));
  }
});
test("MCP-FIXTURE-02 prerequisite validation preserves declared counts and rejects invalid evidence", () => {
  assert.deepEqual(validateMatcherFixtureCounts(complete), complete);
  for (const value of [-1, 0.5, NaN, Infinity]) assert.throws(() => validateMatcherFixtureCounts({ ...complete, safetyReferences: value }), /safetyReferences/);
  assert.deepEqual(complete, { products: 3, productFacts: 4, supplements: 2, retailListings: 3, safetyReferences: 5 });
});

test("MCP-FIXTURE-03 the HTTP support journey requires the actual retail payment and order relations", () => {
  assert.equal(typeof prerequisites.validateMatcherFixtureRelations, "function");
  const relations = { retail_checkout_payments: true, retail_customer_orders: true };
  assert.deepEqual(prerequisites.validateMatcherFixtureRelations(relations), relations);
  for (const name of Object.keys(relations)) {
    assert.throws(() => prerequisites.validateMatcherFixtureRelations({ ...relations, [name]: false }), new RegExp(name));
    assert.throws(() => prerequisites.validateMatcherFixtureRelations({ ...relations, [name]: undefined }), new RegExp(name));
  }
});

test('MCP-FIXTURE-04 reject missing payment locales and accounting accounts before the long inventory',async()=>{
  const p=await import('../scripts/matcher-fixture-prerequisites.mjs');
  assert.equal(typeof p.validateMatcherPaymentPrerequisites,'function');
  const complete={paymentLocaleConstraint:"CHECK ((locale = ANY (ARRAY['en'::text, 'th'::text, 'zh-CN'::text])))",accountCount:3};
  assert.deepEqual(p.validateMatcherPaymentPrerequisites(complete),complete);
  for(const locale of ['en','th','zh-CN'])
    assert.throws(()=>p.validateMatcherPaymentPrerequisites({...complete,paymentLocaleConstraint:complete.paymentLocaleConstraint.replace(`'${locale}'`,"'missing'")}),new RegExp(locale));
  assert.throws(()=>p.validateMatcherPaymentPrerequisites({...complete,accountCount:2}),/account/i);
  assert.throws(()=>p.validateMatcherPaymentPrerequisites({...complete,paymentLocaleConstraint:null}),/locale/i);
});
