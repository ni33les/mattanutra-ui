import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseMegaWeCareThaiFacts,
  productEvidenceHash
} from "../lib/megawecare-import.ts";

describe("Mega We Care import helpers", () => {
  it("parses Thai per-capsule ingredient rows", () => {
    const facts = parseMegaWeCareThaiFacts(
      "Calcium-D ผลิตภัณฑ์เสริมอาหาร ใน 1 แคปซูล ประกอบด้วย แคลเซียมคาร์บอเนต 1,500 มก. และวิตามิน ดี 3 0.2 มก. รับประทานพร้อมอาหาร",
      "https://www.megawecare.co.th/product/calcium-d/"
    );

    assert.equal(facts.length, 2);
    assert.deepEqual(
      facts.map((fact) => [fact.name, fact.amount, fact.unit]),
      [
        ["แคลเซียมคาร์บอเนต", 1500, "mg"],
        ["วิตามิน ดี 3", 0.2, "mg"]
      ]
    );
    assert.equal(facts[0]?.sourceUrl, "https://www.megawecare.co.th/product/calcium-d/");
  });

  it("parses multi-ingredient Thai tablet evidence", () => {
    const facts = parseMegaWeCareThaiFacts(
      "ผลิตภัณฑ์เสริมอาหาร NAT MAG 30's ใน 1 เม็ด ประกอบด้วย แมกนีเซียมออกไซด์ 250 มก. วิตามินบี 1 10 มก. และวิตามินบี 6 5 มก.",
      null
    );

    assert.deepEqual(
      facts.map((fact) => [fact.name, fact.amount, fact.unit]),
      [
        ["แมกนีเซียมออกไซด์", 250, "mg"],
        ["วิตามินบี 1", 10, "mg"],
        ["วิตามินบี 6", 5, "mg"]
      ]
    );
  });

  it("uses stable evidence hashes", () => {
    assert.equal(
      productEvidenceHash({ a: 1, b: "two" }),
      productEvidenceHash({ a: 1, b: "two" })
    );
    assert.notEqual(
      productEvidenceHash({ a: 1, b: "two" }),
      productEvidenceHash({ a: 1, b: "three" })
    );
  });
});
