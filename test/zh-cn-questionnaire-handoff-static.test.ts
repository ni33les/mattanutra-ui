import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assessmentUiCopy, copies } from "../components/assessment-flow-copy.ts";
import { en } from "../components/assessment-flow-copy-en.ts";
import { zhCn } from "../components/assessment-flow-copy-zh-cn.ts";
import { pageCopy } from "../components/nutrition-flow/healthscore-panel-copy.ts";
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

const handoffRoot = new URL("../files/chinese-handoff/", import.meta.url);

describe("zh-CN questionnaire native handoff", () => {
  it("keeps handoff fixtures checked in", () => {
    for (const rel of [
      "README.txt",
      "Chinese_optimised_localisation_conversion/Questionaire Page.rtf",
      "Chinese_optimised_localisation_conversion/mattanutra-zh-CN market optimised for conversion_DS.rtf",
      "questionnaire-rtf-plain.txt",
      "GAP_MATRIX.json"
    ]) {
      assert.ok(existsSync(new URL(rel, handoffRoot)), rel);
    }
  });

  it("keeps option value codes identical to English", () => {
    assert.deepEqual(collectValues(zhCn).sort(), collectValues(en).sort());
    assert.deepEqual(
      collectValues(copies["zh-CN"]).sort(),
      collectValues(copies.en).sort()
    );
  });

  it("uses native-speaker questionnaire chrome and privacy", () => {
    assert.equal(assessmentUiCopy["zh-CN"].privacyGate.title, "你的信息，绝不外泄");
    assert.equal(assessmentUiCopy["zh-CN"].formulaPrecision, "配方精准度");
    assert.match(
      assessmentUiCopy["zh-CN"].precisionHint(2, 36),
      /精准度 2% · 还差 36 项关键数据 · 继续完善，解锁专属配方/
    );
    assert.equal(
      t("zh-CN", "customer.assessmentUi.privacyGate.title"),
      "你的信息，绝不外泄"
    );
    assert.equal(
      t("zh-CN", "customer.assessmentUi.formulaPrecision"),
      "配方精准度"
    );
  });

  it("matches conversion field labels from Questionaire Page.rtf", () => {
    assert.equal(zhCn.about.title, "一切答案，都在你身上");
    assert.equal(zhCn.about.firstName, "怎么称呼您？");
    assert.equal(zhCn.about.sex, "性别");
    assert.equal(zhCn.goals.goals, "你最想改善什么？");
    assert.equal(zhCn.daily.title, "你的日常");
    assert.equal(zhCn.food.title, "饮食 & 营养");
    assert.equal(zhCn.safety.title, "安全第一");
    assert.equal(zhCn.safety.medications, "你在用药吗？");
    assert.equal(zhCn.safety.supplements, "你目前在吃的营养品");
    assert.equal(zhCn.precision.title, "你的偏好");
    assert.equal(zhCn.precision.optionalBanner, "再精准一点？（选填）");
    assert.equal(zhCn.fixedAction.generate, "看看我的身体底子多少分");
    assert.equal(
      zhCn.goals.goalOptions.find((option) => option.value === "longevity")?.label,
      "长寿抗衰"
    );
    assert.equal(
      zhCn.goals.symptomOptions.find((option) => option.value === "brainfog")?.label,
      "脑雾/注意力差"
    );
  });

  it("keeps HealthScore public shell on conversion tone", () => {
    const health = pageCopy["zh-CN"];
    assert.equal(
      health.defaultHeroBody,
      "每一条回答，都为你运转了一遍。一个分数，看清身体底层到底怎么了。"
    );
    assert.equal(health.plans[0]?.save, "立省 30%");
    assert.equal(health.plans[1]?.save, "立省 16%");
    assert.equal(health.methodEyebrow, "知量配方怎么算");
    assert.doesNotMatch(health.defaultBandLine, /您/);
    assert.doesNotMatch(health.selectionError, /您/);
  });

  it("does not leave assessment UI chrome as hard-coded locale maps", () => {
    const source = readFileSync(
      new URL("../components/assessment-flow-copy.ts", import.meta.url),
      "utf8"
    );
    assert.match(source, /getNamespace/);
    assert.match(source, /customer\.assessmentUi/);
    assert.doesNotMatch(
      source,
      /privacyGate:\s*\{\s*acceptedPrompt:\s*"你的信息/
    );
  });
});
