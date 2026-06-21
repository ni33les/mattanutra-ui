import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { preferredProductTitle } from "@/lib/admin-products";

describe("admin product titles", () => {
  it("uses the English translation when the source title is not English", () => {
    assert.equal(
      preferredProductTitle({
        englishTitle: "DHC Lutein Light Protection 30 Days",
        title: "ルテイン 光対策 30日分【機能性表示食品】",
      }),
      "DHC Lutein Light Protection 30 Days"
    );

    assert.equal(
      preferredProductTitle({
        englishTitle: "Whey Charge Chocolate",
        title: "เวย์ ชาร์ซ (รสช็อกโกแลต)",
      }),
      "Whey Charge Chocolate"
    );
  });

  it("keeps already-English product titles", () => {
    assert.equal(
      preferredProductTitle({
        englishTitle: "Swisse Magnesium Glycinate Translated",
        title: "Swisse Magnesium Glycinate",
      }),
      "Swisse Magnesium Glycinate"
    );
  });
});
