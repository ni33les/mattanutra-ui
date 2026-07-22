import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getLandingPageCopy } from "../components/landing-page-copy.ts";
import { getLibraryCopy, getLibraryCategories } from "../lib/library.ts";
import { t } from "../lib/i18n-messages.ts";

const thCatalog = JSON.parse(
  readFileSync(new URL("../content/i18n/locales/th.json", import.meta.url), "utf8")
) as Record<string, string>;

describe("ttf ws1 landing/library chrome (step E)", () => {
  it("locks Thai landing hero and primary CTA to the hand-off wording", () => {
    const copy = getLandingPageCopy("th");

    assert.equal(copy.hero.title, "เลิกเดา");
    assert.equal(copy.hero.accent, "เริ่มรู้จริง");
    assert.equal(copy.hero.primary, "เริ่มประเมินฟรี");
    assert.equal(copy.final.title, "เลิกเดา");
    assert.equal(copy.final.accent, "เริ่มรู้จริง");
    assert.equal(copy.final.primary, "เริ่มประเมินฟรี");
    assert.match(copy.hero.intro, /แผนอาหารเสริม/);
  });

  it("locks SEO home title/description from the hand-off", () => {
    assert.equal(
      thCatalog["seo.routes.home.title"],
      "MattaNutra — เลิกเดา เริ่มรู้จริง"
    );
    assert.match(
      thCatalog["seo.routes.home.description"],
      /เลิกเดา เริ่มรู้จริง/
    );
    assert.equal(
      t("th", "seo.routes.home.title"),
      "MattaNutra — เลิกเดา เริ่มรู้จริง"
    );
  });

  it("locks Thai FAQ questions from the hand-off", () => {
    const copy = getLandingPageCopy("th");
    assert.equal(copy.faq.items[0][0], "ข้อมูลของฉันเป็นส่วนตัวไหม?");
    assert.equal(copy.faq.items[1][0], "ฉันทานยาอยู่ — แบบนี้ปลอดภัยกับฉันไหม?");
    assert.equal(copy.faq.items[2][0], "ผลิตภัณฑ์ที่แนะนำมาจากไหน?");
    assert.equal(copy.faq.items[3][0], "แบบประเมินฟรีนี้ ฟรีจริงไหม?");
    assert.equal(copy.faq.items[4][0], "ทำไมจึงใช้ชื่อภาษาบาลี?");
  });

  it("locks Library index chrome and six category labels", () => {
    const copy = getLibraryCopy("th");
    assert.equal(copy.headerTitle, "เรียนรู้ปริมาณที่พอดี");
    assert.match(copy.searchPlaceholder, /แมกนีเซียม/);
    assert.equal(copy.loadMore, "ดูบทความเพิ่มเติม");
    assert.equal(copy.allCategory, "ทั้งหมด");

    const categories = getLibraryCategories("th");
    assert.equal(categories.length, 6);
    const bySlug = Object.fromEntries(categories.map((c) => [c.slug, c.label]));
    assert.equal(bySlug.foundations, "พื้นฐาน");
    assert.equal(bySlug.vitamins, "วิตามิน");
    assert.equal(bySlug.minerals, "แร่ธาตุ");
    assert.equal(bySlug["sleep-recovery"], "การนอนและการฟื้นตัว");
    assert.equal(bySlug["energy-longevity"], "พลังงานและสุขภาพระยะยาว");
    assert.equal(bySlug["everyday-nutrition"], "โภชนาการประจำวัน");
  });

  it("does not invent English fallbacks for locked Thai hero strings", () => {
    assert.notEqual(thCatalog["customer.landing.hero.title"], "Stop guessing.");
    assert.notEqual(thCatalog["customer.landing.hero.primary"], "Start designing your Right Amount");
  });
});
