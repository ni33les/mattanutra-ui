import assert from "node:assert/strict";
import { it } from "node:test";
import { canonicalFingerprintRows, schemaFingerprint } from "../scripts/validation-data-fingerprints.mjs";

it("V5-PROOF-01 schema identity includes executable epoch triggers and function definitions", () => {
  const schema = { columns: [{ table: "products", type: "jsonb" }], constraints: [], indexes: [], triggers: [{ table: "products", definition: "execute procedure bump_epoch()" }], functions: [{ name: "bump_epoch", definition: "select 1" }] };
  assert.notEqual(schemaFingerprint(schema), schemaFingerprint({ ...schema, triggers: [] }));
  assert.notEqual(schemaFingerprint(schema), schemaFingerprint({ ...schema, functions: [{ name: "bump_epoch", definition: "select 2" }] }));
  assert.equal(schemaFingerprint(schema), schemaFingerprint({ ...schema, columns: [{ type: "jsonb", table: "products" }] }));
});
it("V5-PROOF-02 catalogue fingerprint retains dose, fixture price and nested source verification dates", () => {
  const row = { dose: 1000, price: 17, administration: { provenance: { verifiedAt: "2026-09-07T00:00:00Z" } } };
  const value = canonicalFingerprintRows([row]);
  assert.notDeepEqual(value, canonicalFingerprintRows([{ ...row, dose: 1001 }]));
  assert.notDeepEqual(value, canonicalFingerprintRows([{ ...row, price: 18 }]));
  assert.notDeepEqual(value, canonicalFingerprintRows([{ ...row, administration: { provenance: { verifiedAt: "2026-09-06T00:00:00Z" } } }]));
});
