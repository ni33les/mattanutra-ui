import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractVistraFdaNumber,
  parseVistraThaiFacts
} from "@/lib/vistra-import";

describe("Vistra import helpers", () => {
  it("parses Lysine Bio Multi Vitamins Thai multi-ingredient rows", () => {
    const facts = parseVistraThaiFacts(
      "ส่วนประกอบที่สำคัญใน 1 เม็ด ประกอบด้วย แอล-ไลซีน ไฮโดรคลอไรด์ 250 มก. วิตามิน ซี 60 มก. ซิงค์ กลูโคเนต 15 มก. วิตามิน บี 6 2 มก. วิตามิน บี 12 0.001 มก. วิธีรับประทาน วันละ 1 เม็ด",
      "https://www.vistra.co.th/product/vistra-lysine-bio-multi-vitamins/"
    );

    assert.deepEqual(
      facts.map((fact) => [fact.name, fact.amount, fact.unit]),
      [
        ["L-Lysine", 250, "mg"],
        ["Vitamin C", 60, "mg"],
        ["Zinc", 15, "mg"],
        ["Vitamin B6", 2, "mg"],
        ["Vitamin B12", 0.001, "mg"]
      ]
    );
    assert.equal(
      facts[0]?.sourceUrl,
      "https://www.vistra.co.th/product/vistra-lysine-bio-multi-vitamins/"
    );
  });

  it("parses fish oil EPA and DHA nested facts", () => {
    const facts = parseVistraThaiFacts(
      "ส่วนประกอบ น้ำมันปลา 1,000 มก. ให้กรดไขมันกลุ่มโอเมก้า-3 350 มก. ให้กรดไอโคซาเพนตาอีโนอิก (EPA) 180 มก. ให้กรดโดโคซาเฮกซาอีโนอิก (DHA) 120 มก. ข้อมูลสำหรับผู้แพ้อาหาร มีปลา",
      null
    );

    assert.deepEqual(
      facts.map((fact) => [fact.name, fact.amount, fact.unit]),
      [
        ["Fish Oil", 1000, "mg"],
        ["Omega-3", 350, "mg"],
        ["EPA", 180, "mg"],
        ["DHA", 120, "mg"]
      ]
    );
  });

  it("prefers active yield facts from botanical extract parentheses", () => {
    const facts = parseVistraThaiFacts(
      "ส่วนประกอบ สาหร่ายฮีมาโตคอคคัส พลูวิเอลิส (ให้แอสตาแซนธิน 6 มก.) 120 มก. วิตามิน อี 15 หน่วยสากล วิธีรับประทาน",
      null
    );

    assert.deepEqual(
      facts.map((fact) => [fact.name, fact.amount, fact.unit]),
      [
        ["Astaxanthin", 6, "mg"],
        ["Vitamin E", 15, "IU"]
      ]
    );
  });

  it("extracts Vistra FDA numbers from Thai page text", () => {
    assert.equal(
      extractVistraFdaNumber("เลขสารระบบอาหาร 13-1-00452-5-0001"),
      "13-1-00452-5-0001"
    );
  });
});
