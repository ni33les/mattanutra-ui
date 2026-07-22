import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assessmentUiCopy, copies } from "../components/assessment-flow-copy.ts";
import { en } from "../components/assessment-flow-copy-en.ts";
import { th } from "../components/assessment-flow-copy-th.ts";
import { t } from "../lib/i18n-messages.ts";

function collectValues(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") {
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectValues(item, out);
    }
    return out;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.value === "string") {
    out.push(record.value);
  }
  for (const value of Object.values(record)) {
    collectValues(value, out);
  }
  return out;
}

describe("ttf ws2 Thai questionnaire port", () => {
  it("keeps option value codes identical to English", () => {
    assert.deepEqual(collectValues(th).sort(), collectValues(en).sort());
  });

  it("uses hand-off step titles and privacy chrome", () => {
    assert.deepEqual(th.stages, [
      "ข้อมูลพื้นฐาน",
      "เป้าหมาย",
      "ชีวิตประจำวัน",
      "อาหาร",
      "ความปลอดภัย",
      "ความแม่นยำ"
    ]);
    assert.deepEqual(th.stagePhases, [
      "พื้นฐาน",
      "พื้นฐาน",
      "พื้นฐาน",
      "พื้นฐาน",
      "ความปลอดภัย",
      "ปรับเฉพาะคุณ"
    ]);
    assert.equal(
      assessmentUiCopy.th.privacyGate.title,
      "คำตอบของคุณเป็นเรื่องส่วนตัวระหว่างเรา"
    );
    assert.match(assessmentUiCopy.th.privacyGate.checkbox, /อนุญาตให้ใช้คำตอบด้านสุขภาพ/);
    assert.equal(assessmentUiCopy.th.privacyGate.required, "จำเป็น");
    assert.equal(th.about.sexOptions[0]?.label, "ชาย");
    assert.equal(th.about.sexOptions[1]?.label, "หญิง");
    assert.equal(th.about.ageOptions[0]?.value, "18-25");
  });

  it("ships the Thai questionnaire OG card and SEO title", () => {
    assert.ok(
      existsSync(
        new URL("../public/assets/og/mattanutra-questionnaire-th.jpg", import.meta.url)
      )
    );
    assert.equal(
      t("th", "seo.routes.nutritionQuiz.title"),
      "แบบประเมินสูตรปริมาณที่พอดี · MattaNutra"
    );
    assert.match(t("th", "seo.routes.nutritionQuiz.description"), /MattaNutra/);
  });

  it("wires Thai OG image on the quiz route metadata", () => {
    const page = readFileSync(
      new URL("../app/[locale]/nutrition/quiz/page.tsx", import.meta.url),
      "utf8"
    );
    const seo = readFileSync(new URL("../lib/seo.ts", import.meta.url), "utf8");
    assert.match(page, /mattanutra-questionnaire-th\.jpg/);
    assert.match(page, /nutritionQuizOgByLocale/);
    assert.match(seo, /image\?: string/);
  });

  it("exports th through the locale copy registry", () => {
    assert.equal(copies.th, th);
  });
});
