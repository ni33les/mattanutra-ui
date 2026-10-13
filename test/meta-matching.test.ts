import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { META_HASHED_MATCHING_FIELDS, metaContactMatching, metaHashedMatching, metaMatchingIdentitiesConflict, withoutMetaContactMatching } from "../lib/meta-matching.ts";

const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

describe("Meta customer matching", () => {
  it("normalizes all supported explicitly supplied identifiers before SHA-256", () => {
    const matching = metaContactMatching({ email: " Fixture@Example.com ", phone: "+1 (650) 555-0100", country: " US ",
      firstName: " Anne-Marie ", lastName: " O’Neil ", city: "Menlo Park", region: " CA ", postalCode: "94035-1234",
      gender: "Female", dateOfBirth: "1990-02-28" });
    const expected = { em: "fixture@example.com", ph: "16505550100", country: "us", fn: "annemarie", ln: "oneil",
      ct: "menlopark", st: "ca", zp: "94035", ge: "f", db: "19900228" };
    assert.deepEqual(matching, Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, [hash(value)]])));
    assert.doesNotMatch(JSON.stringify(matching), /fixture@example|Anne|94035/);
  });

  it("keeps UTF-8 names and international places without inventing absent demographics", () => {
    const matching = metaContactMatching({ firstName: "สมชาย", city: "พระนคร ศรีอยุธยา", region: "Chiang Mai", country: "TH", phone: "081 234 5678", postalCode: "10110" });
    assert.deepEqual(matching.fn, [hash("สมชาย")]);
    assert.deepEqual(matching.ct, [hash("พระนครศรีอยุธยา")]);
    assert.deepEqual(matching.st, [hash("chiangmai")]);
    assert.deepEqual(matching.ph, [hash("66812345678")]);
    assert.equal(matching.ln, undefined);
    assert.equal(matching.ge, undefined);
    assert.equal(matching.db, undefined);
    assert.deepEqual(metaContactMatching({ country: "GB", phone: "0044 20 7946 0958", postalCode: "SW1A 1AA" }).ph, [hash("442079460958")]);
    assert.deepEqual(metaContactMatching({ country: "GB", postalCode: "SW1A 1AA" }).zp, [hash("sw1a1aa")]);
  });

  it("omits invalid or ambiguous information rather than hashing placeholders", () => {
    assert.deepEqual(metaContactMatching({ email: "invalid", phone: "0812345678", country: "Thailand", firstName: "123",
      lastName: "", city: "--", region: "!", postalCode: "?", gender: "unknown", dateOfBirth: "1990-02-30" }), {});
    assert.equal(metaContactMatching({ country: "GB", phone: "020 7946 0958" }).ph, undefined);
    assert.equal(metaContactMatching({ country: "US", region: "California" }).st, undefined);
    for (const dateOfBirth of ["future", "2999-01-01", "1899-12-31", "02/03/1990", "1991-02-29"]) {
      assert.equal(metaContactMatching({ dateOfBirth }).db, undefined);
    }
    assert.deepEqual(metaContactMatching({ dateOfBirth: "20000229" }).db, [hash("20000229")]);
    // Runtime extras never become identifiers, even if callers ignore the TypeScript boundary.
    assert.deepEqual(metaContactMatching({ sex: "female", age: "35", answers: { firstName: "Fixture" } } as never), {});
  });

  it("dispatches only valid hashes from the customer identifier allowlist", () => {
    const valid = Object.fromEntries(META_HASHED_MATCHING_FIELDS.map(key => [key, [hash(key)]]));
    assert.deepEqual(metaHashedMatching(valid), valid);
    assert.deepEqual(metaHashedMatching({ em: ["fixture@example.com"], fn: "raw", ln: [hash("fixture"), "raw"],
      ge: [], db: ["A".repeat(64)], answers: hash("fixture"), extra: [hash("fixture")], city: "Bangkok" }), {});
    assert.deepEqual(metaHashedMatching(null), {});
  });

  it("keeps browser evidence while separating conflicting customer identities", () => {
    const first = metaContactMatching({ email: "first@example.com", firstName: "First", country: "TH" });
    const second = metaContactMatching({ email: "second@example.com", country: "GB" });
    assert.equal(metaMatchingIdentitiesConflict(first, second), true);
    assert.equal(metaMatchingIdentitiesConflict(first, { ...first, ph: [hash("new phone")] }), false);
    assert.equal(metaMatchingIdentitiesConflict({ ph: [hash("one")] }, { ph: [hash("two")] }), true);
    assert.deepEqual(withoutMetaContactMatching({ ...first, fbc: "browser-click", client_user_agent: "browser" }), {
      fbc: "browser-click", client_user_agent: "browser"
    });
  });
});
