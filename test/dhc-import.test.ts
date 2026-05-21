import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractDhcProductId,
  isDhcSupplementProduct,
  parseDhcFacts
} from "@/lib/dhc-import";

describe("DHC import helpers", () => {
  it("parses DHC vitamin nutrition rows from Japanese label text", () => {
    const facts = parseDhcFacts(
      "【栄養成分表示［2粒1156mgあたり］】熱量4.5kcal、たんぱく質0.13g、脂質0g、炭水化物1.0g、食塩相当量0.001g、ビタミンB2 2.0mg（143）、ビタミンC 1000mg（1000）",
      "https://www.dhc.co.jp/goods/2140.html"
    );

    assert.deepEqual(
      facts.map((fact) => [fact.name, fact.amount, fact.unit]),
      [
        ["Vitamin B2", 2, "mg"],
        ["Vitamin C", 1000, "mg"]
      ]
    );
    assert.equal(facts[0]?.sourceUrl, "https://www.dhc.co.jp/goods/2140.html");
  });

  it("parses DHC omega nested EPA and DHA facts", () => {
    const facts = parseDhcFacts(
      "【栄養成分表示［1日あたり：4粒2040mg］】DHA 510mg、EPA 110mg、ビタミンE 60mg",
      null
    );

    assert.deepEqual(
      facts.map((fact) => [fact.name, fact.amount, fact.unit]),
      [
        ["DHA", 510, "mg"],
        ["EPA", 110, "mg"],
        ["Vitamin E", 60, "mg"]
      ]
    );
  });

  it("normalizes DHC probiotic hundred-million units to billion CFU", () => {
    const facts = parseDhcFacts(
      "【内容成分】ビフィズス菌 100億個、乳酸菌 50億個",
      null
    );

    assert.deepEqual(
      facts.map((fact) => [fact.name, fact.amount, fact.unit]),
      [
        ["Bifidobacterium", 10, "billion CFU"],
        ["Probiotics", 5, "billion CFU"]
      ]
    );
  });

  it("extracts canonical DHC product ids", () => {
    assert.equal(
      extractDhcProductId("https://www.dhc.co.jp/goods/goodsdetail.jsp?gCode=70106"),
      "70106"
    );
    assert.equal(
      extractDhcProductId("https://www.dhc.co.jp/goods/2140.html"),
      "2140"
    );
  });

  it("keeps ingestible supplements and rejects obvious non-supplements", () => {
    assert.equal(
      isDhcSupplementProduct({
        productTitle: "ルテイン 光対策 30日分【機能性表示食品】",
        sourceText: "健康食品・サプリメント 栄養成分表示 1日摂取目安量"
      }),
      true
    );
    assert.equal(
      isDhcSupplementProduct({
        productTitle: "DHC 薬用 リンクルリペア BB クッションファンデーション",
        sourceText: "化粧品 肌に塗布してください"
      }),
      false
    );
    assert.equal(
      isDhcSupplementProduct({
        productTitle: "DHCシスビタホワイトC<ビタミンC主薬製剤>[第3類医薬品]",
        sourceText: "第3類医薬品"
      }),
      false
    );
  });
});
