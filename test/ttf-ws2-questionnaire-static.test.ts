import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

const handoffRoot = new URL(
  "../files/ttf-ws2/MattaNutra_TH_Questionnaire_Handoff_2026-07-19/",
  import.meta.url
);

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
    // Patch 2026-07-23: step-1 group label is เรื่องของคุณ (was พื้นฐาน).
    assert.deepEqual(th.stagePhases, [
      "เรื่องของคุณ",
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

  it("matches hand-off field labels, hints, and CTAs", () => {
    assert.equal(th.about.firstName, "ชื่อ");
    assert.equal(th.about.sex, "เพศกำเนิด");
    assert.equal(th.about.sun, "เวลาที่ได้รับแสงแดดต่อวัน");
    assert.equal(th.about.sunscreen, "การใช้ครีมกันแดด");
    assert.equal(th.goals.title, "เป้าหมายและความรู้สึกของคุณ");
    assert.equal(
      th.goals.subtitle,
      "นี่คือสิ่งที่สูตรของคุณออกแบบมาเพื่อคุณโดยเฉพาะ — ตอบตามจริง เพราะคำตอบนี้จะกำหนดทุกส่วนของสูตร"
    );
    assert.equal(th.safety.title, "ยาและความปลอดภัย");
    assert.equal(th.safety.medications, "คุณรับประทานยาอยู่หรือไม่?");
    assert.equal(th.safety.medicationHint, "ใช้เพื่อตรวจสอบความปลอดภัยเท่านั้น");
    assert.equal(th.safety.otherMedPlaceholder, "โปรดระบุชื่อยาและใช้เพื่ออะไร");
    assert.equal(th.precision.title, "ความต้องการของคุณ");
    assert.equal(
      th.precision.labsHint,
      "กรอกเฉพาะค่าที่มี หน่วยมีความสำคัญ — เลือกหน่วยให้ถูกต้อง เพื่อให้ระบบอ่านค่าของคุณได้อย่างแม่นยำ"
    );
    assert.equal(th.fixedAction.generate, "สร้าง Health Score ของฉัน");
    assert.equal(th.food.frequencyTitles.fish, "ปลาที่มีไขมันสูง");
    assert.equal(th.food.frequencyTitles.legumes, "ถั่วเมล็ดแห้ง / ถั่วเปลือกแข็ง");
    assert.equal(th.food.frequencyTitles.dairy, "ผลิตภัณฑ์นม");
    assert.equal(th.food.frequencyTitles.redmeat, "เนื้อแดง");
    assert.equal(
      th.precision.optionalBody,
      "ส่วนนี้ไม่บังคับ คุณสร้าง Health Score ได้ทันทีด้วยระดับความแม่นยำปัจจุบัน หรือเพิ่มรายละเอียดอีกเล็กน้อยเพื่อเข้าใกล้ 100% ทุกคำตอบด้านล่างจะทำให้แถบความแม่นยำขยับขึ้น"
    );
    assert.equal(
      th.coach.sex,
      "ใช้ปรับความต้องการสารอาหารและแสดงคำถามด้านสุขภาพที่เกี่ยวข้องกับคุณ"
    );
    assert.equal(
      th.coach.sun,
      "ช่วยประเมินการสังเคราะห์วิตามินดีควบคู่กับการได้รับแสงแดด"
    );
  });

  it("ships the Thai questionnaire OG card and SEO title", () => {
    const publicOg = new URL("../public/assets/og/mattanutra-questionnaire-th.jpg", import.meta.url);
    const handoffOg = new URL("assets/og/mattanutra-questionnaire-th.jpg", handoffRoot);
    assert.ok(existsSync(publicOg));
    assert.ok(existsSync(handoffOg));
    const publicBytes = readFileSync(publicOg);
    const handoffBytes = readFileSync(handoffOg);
    assert.equal(
      createHash("sha256").update(publicBytes).digest("hex"),
      createHash("sha256").update(handoffBytes).digest("hex")
    );
    assert.equal(
      t("th", "seo.routes.nutritionQuiz.title"),
      "แบบประเมินสูตรปริมาณที่พอดี · MattaNutra"
    );
    assert.equal(
      t("th", "seo.routes.nutritionQuiz.description"),
      "แบบประเมินอาหารเสริมเฉพาะบุคคลของ MattaNutra ตอบตามความเป็นจริงเพื่อเพิ่มความแม่นยำและความปลอดภัยให้สูตรปริมาณที่พอดีของคุณ"
    );
  });

  it("wires Thai OG image and image alt on the quiz route metadata", () => {
    const page = readFileSync(
      new URL("../app/[locale]/nutrition/quiz/page.tsx", import.meta.url),
      "utf8"
    );
    const seo = readFileSync(new URL("../lib/seo.ts", import.meta.url), "utf8");
    assert.match(page, /mattanutra-questionnaire-th\.jpg/);
    assert.match(page, /nutritionQuizOgByLocale/);
    assert.match(page, /Partial<Record<Locale, string>>/);
    assert.match(page, /MattaNutra — รู้ปริมาณที่พอดี/);
    assert.match(page, /imageAlt:/);
    assert.match(seo, /image\?: string/);
    assert.match(seo, /imageAlt\?: string/);
    assert.match(seo, /alt:\s*imageAlt/);
  });

  it("documents intentional product deltas vs the hand-off food step", () => {
    const reconciliation = JSON.parse(
      readFileSync(
        new URL("../files/ttf-ws2/RECONCILIATION_RAW.json", import.meta.url),
        "utf8"
      )
    ) as { accepted_deltas: Array<{ msg: string; value?: string }> };
    const readme = readFileSync(
      new URL("../files/ttf-ws2/README.txt", import.meta.url),
      "utf8"
    );
    const msgs = reconciliation.accepted_deltas.map((d) => d.msg);
    assert.ok(
      reconciliation.accepted_deltas.some(
        (d) => d.value === "อาหารที่ต้องหลีกเลี่ยงหรือไม่ชอบ"
      )
    );
    assert.ok(msgs.some((m) => /avoidNote free-text field not in React product schema/i.test(m)));
    assert.ok(msgs.some((m) => /food disclosure UI not rendered/i.test(m)));
    assert.match(readme, /Explicitly accepted product deltas/);
    assert.match(readme, /อาหารที่ต้องหลีกเลี่ยงหรือไม่ชอบ/);
    assert.match(readme, /privacy gate/);
  });

  it("exports th through the locale copy registry", () => {
    assert.equal(copies.th, th);
  });
});
