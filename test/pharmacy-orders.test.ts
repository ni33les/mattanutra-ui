import assert from "node:assert/strict";
import { it } from "node:test";
import { preparePharmacyOrder, type PharmacyOrderProduct } from "../lib/pharmacy-order-input.ts";

const products: PharmacyOrderProduct[] = [
  { productId: "00000000-0000-4000-8000-000000000001", name: "A", quantity: 2, unitPrice: 125.50, currency: "THB", imageUrl: null },
  { productId: "00000000-0000-4000-8000-000000000002", name: "B", quantity: 1, unitPrice: 199, currency: "THB", imageUrl: null }
];
it("PHARM-04 orders the selected subset at frozen pack quantities and exact RRP totals", () => {
  const result = preparePharmacyOrder({ customerName: "  Visitor  ", productIds: [products[0].productId] }, products);
  assert.equal(result.customerName, "Visitor"); assert.equal(result.total, 251);
  assert.deepEqual(result.lines, [products[0]]); assert.equal(result.currency, "THB");
  assert.equal(preparePharmacyOrder({ customerName: "V", productIds: products.map(p => p.productId) }, products).total, 450);
});
it("PHARM-05 rejects empty, injected and repeated products without interpreting preferences as limits", () => {
  for (const productIds of [[], ["foreign-product"], [products[0].productId, products[0].productId]]) {
    assert.throws(() => preparePharmacyOrder({ customerName: "Visitor", productIds }, products));
  }
  assert.throws(() => preparePharmacyOrder({ customerName: "", productIds: [products[0].productId] }, products));
  assert.throws(() => preparePharmacyOrder({ customerName: "V", productIds: [products[0].productId] }, [{ ...products[0], quantity: 0 }]));
});
it("PHARM-06 never combines currencies or invents missing prices", () => {
  const input = { customerName: "V", productIds: products.map(p => p.productId) };
  assert.throws(() => preparePharmacyOrder(input, [products[0], { ...products[1], currency: "USD" }]));
  assert.throws(() => preparePharmacyOrder(input, [products[0], { ...products[1], unitPrice: NaN }]));
});
