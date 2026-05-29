import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  revealPageCopySlots,
  revealPageCopyVersion
} from "../lib/formulation-types.ts";
import { validateRevealPageCopy } from "../lib/nutrition-plan-advisor-analysis.ts";

function validRevealPageCopy() {
  return {
    version: revealPageCopyVersion,
    ...Object.fromEntries(
      revealPageCopySlots.map((slot) => [
        slot,
        {
          en: `Personalised ${slot} copy for the reveal page.`,
          th: `ข้อความภาษาไทยสำหรับ ${slot}`
        }
      ])
    )
  };
}

describe("nutrition report reveal page copy validator", () => {
  it("accepts complete English and Thai reveal page copy", () => {
    const validation = validateRevealPageCopy(validRevealPageCopy());

    assert.deepEqual(validation.errors, []);
    assert.ok(validation.copy);
    assert.equal(validation.copy.version, revealPageCopyVersion);
    assert.equal(
      typeof validation.copy.heroTitle === "object"
        ? validation.copy.heroTitle.en
        : validation.copy.heroTitle,
      "Personalised heroTitle copy for the reveal page."
    );
  });

  it("accepts legacy unversioned copy for stored report compatibility", () => {
    const copy = validRevealPageCopy() as Record<string, unknown>;

    delete copy.version;

    const validation = validateRevealPageCopy(copy);

    assert.deepEqual(validation.errors, []);
    assert.ok(validation.copy);
    assert.equal(validation.copy.version, undefined);
  });

  it("rejects an unsupported reveal page copy version", () => {
    const validation = validateRevealPageCopy({
      ...validRevealPageCopy(),
      version: "old-template"
    });

    assert.ok(validation.errors.some((error) => error.includes("version")));
  });

  it("requires only the requested display locale for new localized objects", () => {
    const copy = validRevealPageCopy() as Record<string, unknown>;

    copy.heroSub = { en: "English only reveal copy." };

    const validation = validateRevealPageCopy(copy, "zh-CN");

    assert.ok(validation.errors.some((error) => error.includes("heroSub.zh-CN")));
  });

  it("rejects extra fields", () => {
    const validation = validateRevealPageCopy({
      ...validRevealPageCopy(),
      lockedCount: { en: "Do not add facts.", th: "ไม่เพิ่มข้อเท็จจริง" }
    });

    assert.ok(
      validation.errors.some((error) =>
        error.includes("unexpected fields: lockedCount")
      )
    );
  });

  it("accepts single display-locale strings for new reveal copy", () => {
    const copy = validRevealPageCopy() as Record<string, unknown>;

    copy.formulaLead = "Personalized reveal copy in one display locale.";

    const validation = validateRevealPageCopy(copy);

    assert.deepEqual(validation.errors, []);
    assert.equal(validation.copy?.formulaLead, "Personalized reveal copy in one display locale.");
  });

  it("rejects banned medical wording", () => {
    const copy = validRevealPageCopy() as Record<string, unknown>;

    copy.safetyBody = {
      en: "This plan will treat your condition.",
      th: "ข้อความภาษาไทย"
    };

    const validation = validateRevealPageCopy(copy);

    assert.ok(validation.errors.some((error) => error.includes("forbidden term")));
  });

  it("rejects HTML or markdown", () => {
    const copy = validRevealPageCopy() as Record<string, unknown>;

    copy.closingBody = {
      en: "<strong>Styled reveal copy</strong>",
      th: "ข้อความภาษาไทย"
    };

    const validation = validateRevealPageCopy(copy);

    assert.ok(validation.errors.some((error) => error.includes("HTML or markdown")));
  });

  it("rejects invented numeric claims", () => {
    const copy = validRevealPageCopy() as Record<string, unknown>;

    copy.productsLead = {
      en: "This covers 5 product needs.",
      th: "ข้อความภาษาไทย"
    };

    const validation = validateRevealPageCopy(copy);

    assert.ok(validation.errors.some((error) => error.includes("numeric claims")));
  });
});
