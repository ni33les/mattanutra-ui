import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assessmentUiCopy } from "../components/assessment-flow-copy.ts";
import { th as assessmentTh } from "../components/assessment-flow-copy-th.ts";
import {
  formatHeightImperial,
  formatHeightMetric,
  formatWeightImperial,
  formatWeightMetric
} from "../components/assessment-flow-state.ts";
import { localeHtmlLang } from "../lib/i18n.ts";
import { t } from "../lib/i18n-messages.ts";
import thCatalog from "../content/i18n/locales/th.json" with { type: "json" };

const patchRoot = new URL("../files/ttf-th-patch-2026-07-23/", import.meta.url);

function readPatch(rel: string) {
  return readFileSync(new URL(rel, patchRoot), "utf8");
}

describe("Thai patch pack 2026-07-23", () => {
  it("keeps the patch pack checked in", () => {
    for (const rel of [
      "00_START_HERE.md",
      "02_header_component_th.md",
      "03_library/RESTORE_BLOCKS.md",
      "04_quiz/quiz-strings-th.json",
      "01_landing/MattaNutra_Landing_Page_TH_v20_FINAL.html"
    ]) {
      assert.ok(existsSync(new URL(rel, patchRoot)), rel);
    }
    assert.ok(
      existsSync(
        new URL("../public/assets/og/mattanutra-library-th.jpg", import.meta.url)
      )
    );
  });

  it("applies shared header strings from the patch", () => {
    assert.equal(thCatalog["customer.titleBar.links.0.1"], "Living Protocol");
    assert.equal(thCatalog["customer.titleBar.links.1.1"], "วิธีการทำงาน");
    assert.equal(thCatalog["customer.titleBar.links.2.1"], "คำมั่นของเรา");
    assert.equal(thCatalog["customer.titleBar.assessment"], "เริ่มประเมินฟรี");
    assert.equal(thCatalog["customer.titleBar.availability"], "พร้อมให้บริการแล้วใน");
    assert.equal(thCatalog["customer.titleBar.comingSoon"], "เปิดเร็ว ๆ นี้");
    assert.doesNotMatch(JSON.stringify(thCatalog), /โปรโตคอลชีวิต/);
  });

  it("restores library hero and closing CTA from RESTORE_BLOCKS.md", () => {
    assert.equal(
      thCatalog["customer.libraryIndex.headerIntro"],
      "คำตอบที่ชัดเจนและอ้างอิงหลักฐาน สำหรับคำถามเรื่องอาหารเสริมที่คนถามกันจริง ๆ ทั้งแมกนีเซียม วิตามินดี โอเมกา-3 การนอน และอื่น ๆ ทุกบทความเขียนขึ้นเพื่อช่วยให้คุณตัดสินใจจากการรู้จริง ไม่ใช่การเดา"
    );
    assert.equal(
      thCatalog["customer.libraryIndex.ctaTitle"],
      "การอ่านคือจุดเริ่มต้นที่ดี\nแต่การรู้จริงดีกว่า"
    );
    assert.equal(
      thCatalog["customer.libraryIndex.ctaBody"],
      "เปลี่ยนสิ่งที่คุณได้เรียนรู้ ให้เป็นแผนที่ออกแบบเพื่อร่างกายของคุณ เริ่มต้นฟรี ไม่ต้องใช้บัตรเครดิต"
    );
    assert.match(
      thCatalog["customer.libraryIndex.openGraphDescription"],
      /อ้างอิงหลักฐาน/
    );
    assert.doesNotMatch(
      thCatalog["customer.libraryIndex.headerIntro"],
      /ทุกหน้าถูกเขียนมา/
    );
  });

  it("applies post-v4 quiz string finals from quiz-strings-th.json", () => {
    const pack = JSON.parse(readPatch("04_quiz/quiz-strings-th.json")) as {
      strings: Array<{
        key: string;
        th_final: string;
        verdict: string;
      }>;
    };

    assert.equal(
      t("th", "customer.assessmentUi.precisionHint.remaining", {
        progress: 2,
        remaining: 36
      }),
      "เสร็จแล้ว 2% — เหลือข้อมูลหลักอีก 36 ข้อ ก่อนเข้าสู่ขั้นความแม่นยำ"
    );
    assert.equal(
      assessmentUiCopy.th.countryHint,
      "ใช้ปรับคำแนะนำตามพื้นที่และสินค้าที่มีจำหน่ายในประเทศของคุณ"
    );
    assert.equal(
      assessmentUiCopy.th.sunHint,
      "ช่วยปรับการประเมินวิตามินดีร่วมกับการได้รับแสงแดด"
    );
    assert.equal(assessmentUiCopy.th.selectCountry, "เลือกประเทศ…");
    assert.equal(assessmentTh.stagePhases[0], "เรื่องของคุณ");
    assert.equal(assessmentTh.about.trustItems[0]?.title, "ตรวจสอบด้านความปลอดภัย");
    assert.equal(
      assessmentTh.about.trustItems[0]?.body,
      "ทุกสูตรผ่านการคัดกรองเทียบกับยาที่ใช้ ผลตรวจทางห้องปฏิบัติการ และเลขทะเบียน อย. ไทย"
    );
    assert.doesNotMatch(JSON.stringify(assessmentTh.about.trustItems), /แล็บ/);
    assert.match(assessmentUiCopy.th.resume.body, /เพื่อการนี้เท่านั้น/);
    assert.match(assessmentUiCopy.th.resume.privacy, /ไม่ได้รับความยินยอม/);

    const byKey = Object.fromEntries(pack.strings.map((row) => [row.key, row]));
    assert.equal(byKey["progress.line"]?.verdict, "replace");
    assert.ok(byKey["trust.safety.head"]?.th_final.includes("ตรวจสอบด้านความปลอดภัย"));
  });

  it("uses Thai unit labels for height and weight", () => {
    assert.equal(formatHeightMetric("170", "th"), "170 ซม.");
    assert.equal(formatWeightMetric("70", "th"), "70 กก.");
    assert.match(formatHeightImperial("170", "th"), /ฟุต/);
    assert.match(formatHeightImperial("170", "th"), /นิ้ว/);
    assert.match(formatWeightImperial("70", "th"), /ปอนด์/);
    assert.equal(formatHeightMetric("170", "en"), "170 cm");
  });

  it("emits th_TH open-graph locale for Thai", () => {
    assert.equal(localeHtmlLang("th"), "th-TH");
    assert.equal(localeHtmlLang("th").replace("-", "_"), "th_TH");
  });
});
