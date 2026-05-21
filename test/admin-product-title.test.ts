import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { preferredProductTitle } from "@/lib/admin-products";

describe("admin product titles", () => {
  it("uses the English translation when the source title is not English", () => {
    assert.equal(
      preferredProductTitle({
        title: "ルテイン 光対策 30日分【機能性表示食品】",
        titleEn: "DHC Lutein Light Protection 30 Days"
      }),
      "DHC Lutein Light Protection 30 Days"
    );

    assert.equal(
      preferredProductTitle({
        title: "เวย์ ชาร์ซ (รสช็อกโกแลต)",
        titleEn: "Whey Charge Chocolate"
      }),
      "Whey Charge Chocolate"
    );
  });

  it("keeps already-English product titles", () => {
    assert.equal(
      preferredProductTitle({
        title: "Swisse Magnesium Glycinate",
        titleEn: "Swisse Magnesium Glycinate Translated"
      }),
      "Swisse Magnesium Glycinate"
    );
  });
});
