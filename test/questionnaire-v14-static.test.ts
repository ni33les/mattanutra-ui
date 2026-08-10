import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createInitialState,
  getDefinition,
  reopenTurn,
  startQuestionnaire,
  applyAnswer
} from "../lib/questionnaire/engine.ts";
import { getQuestionnaireDefinition } from "../lib/questionnaire/definition.ts";
import welcomePack from "../content/questionnaire/v6/welcome.json" with { type: "json" };

const root = fileURLToPath(new URL("..", import.meta.url));

function walkSources(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walkSources(path, out);
      continue;
    }

    if (/\.(ts|tsx|json)$/.test(path) && !path.includes("node_modules")) {
      out.push(path);
    }
  }

  return out;
}

describe("questionnaire v14 UX on v6 schema", () => {
  it("keeps turn keys aligned and sex wording without 'at birth'", () => {
    const en = getQuestionnaireDefinition("en");
    const th = getQuestionnaireDefinition("th");
    const zh = getQuestionnaireDefinition("zh-CN");
    assert.equal(en.turns.length, 53);
    assert.deepEqual(
      en.turns.map((t) => t.k),
      th.turns.map((t) => t.k)
    );

    const sexEn = en.turns.find((t) => t.k === "sex");
    const sexTh = th.turns.find((t) => t.k === "sex");
    const sexZh = zh.turns.find((t) => t.k === "sex");
    assert.equal(sexEn?.q, "What is your sex?");
    assert.equal(sexTh?.q, "เพศของคุณคือ");
    // zh-CN falls back to EN turns until a dedicated pack ships
    assert.equal(sexZh?.q, "What is your sex?");
    assert.doesNotMatch(sexEn?.q || "", /at birth/i);
    assert.doesNotMatch(sexTh?.q || "", /เพศกำเนิด|at birth/i);
    assert.doesNotMatch(sexZh?.q || "", /at birth|出生|生理性别/i);
    assert.doesNotMatch(JSON.stringify(sexTh), /เพศกำเนิด/);
    assert.doesNotMatch(JSON.stringify(sexEn), /sex at birth/i);
    assert.doesNotMatch(JSON.stringify(sexZh), /sex at birth|出生时的性别|出生性别/i);
  });

  it("syncs precisionGate / fitness / labs copy from v14 (not sex)", () => {
    const en = getQuestionnaireDefinition("en");
    const th = getQuestionnaireDefinition("th");
    assert.match(
      en.turns.find((t) => t.k === "precisionGate")?.q || "",
      /Almost done/i
    );
    assert.match(
      en.turns.find((t) => t.k === "fitness")?.q || "",
      /VO₂ max/i
    );
    assert.match(
      en.turns.find((t) => t.k === "labs")?.q || "",
      /bloodwork/i
    );
    assert.match(
      th.turns.find((t) => t.k === "precisionGate")?.q || "",
      /เกือบเสร็จ/
    );
  });

  it("matches v14 intro UI strings (EN/TH)", () => {
    const en = getQuestionnaireDefinition("en");
    const th = getQuestionnaireDefinition("th");
    assert.equal(
      en.ui.introHi,
      "Ready. Let’s begin with what matters most to you."
    );
    assert.equal(
      en.ui.introHint,
      "One question at a time · your progress saves automatically"
    );
    assert.equal(
      th.ui.introHi,
      "พร้อมแล้วค่ะ เริ่มจากสิ่งที่สำคัญที่สุดสำหรับคุณกันเลยนะคะ"
    );
    assert.equal(
      th.ui.introHint,
      "ทีละคำถาม · ระบบบันทึกความคืบหน้าให้อัตโนมัติ"
    );
  });

  it("ships welcome copy for en/th/zh with CTA", () => {
    for (const lang of ["en", "th", "zh"] as const) {
      const pack = welcomePack[lang];
      assert.ok(pack.cta.length > 0, lang);
      assert.ok(pack.headlineHtml.includes("<em>"), lang);
      assert.ok(pack.calcSee.length > 0, lang);
      assert.ok(pack.reviewBtn.length > 0, lang);
    }
  });

  it("forbids sex-at-birth wording in questionnaire sources (EN/TH/zh)", () => {
    const dirs = [
      join(root, "content/questionnaire"),
      join(root, "components/chat-questionnaire"),
      join(root, "lib/questionnaire")
    ];
    const extra = [
      join(root, "components/assessment-flow-copy-en.ts"),
      join(root, "components/assessment-flow-copy-th.ts"),
      join(root, "components/assessment-flow-copy-zh-cn.ts")
    ];
    // Live React sources only — content/questionnaire/v14 HTML is reference-only
    // and may contain legacy “sex at birth” wording from the business package.
    const files = [...dirs.flatMap((d) => walkSources(d)), ...extra].filter(
      (file) => !file.includes(`${join("content", "questionnaire", "v14")}`)
    );
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /sex at birth/i, file);
      assert.doesNotMatch(source, /เพศกำเนิด/, file);
      // Chinese “sex at birth” phrasings must not appear in live copy sources
      assert.doesNotMatch(source, /出生时的性别|出生時的性別|出生性别|出生性別/, file);
    }
  });

  it("does not reintroduce begin|start regex auto-click", () => {
    const chat = readFileSync(
      join(root, "components/chat-questionnaire/chat-questionnaire.tsx"),
      "utf8"
    );
    assert.doesNotMatch(chat, /\/begin\|start\/i/);
    assert.match(chat, /welcome_cta|beginFromWelcome|QuestionnaireWelcome/);
    assert.match(chat, /questionnaire-calculating|QuestionnaireCalculating/);
    assert.match(chat, /reopenTurn|reviewOpen/);
  });

  it("does not double brand/lang chrome inside the quiz welcome", () => {
    const welcome = readFileSync(
      join(root, "components/chat-questionnaire/questionnaire-welcome.tsx"),
      "utf8"
    );
    assert.doesNotMatch(welcome, /mn-quiz-welcome__lang\b/);
    assert.doesNotMatch(welcome, /mn-quiz-welcome__brand\b/);
    assert.doesNotMatch(welcome, /data-wlang/);
    assert.doesNotMatch(welcome, /LanguageSwitcher/);
  });

  it("uses quiz-focused shell (compact titlebar, no site footer)", () => {
    const page = readFileSync(
      join(root, "app/[locale]/nutrition/quiz/page.tsx"),
      "utf8"
    );
    assert.match(page, /variant=\"quiz\"/);
    assert.match(page, /mn-customer-shell--quiz/);
    assert.doesNotMatch(page, /SiteFooter/);
    const titleBar = readFileSync(join(root, "components/title-bar.tsx"), "utf8");
    assert.match(titleBar, /\"quiz\"/);
    assert.match(titleBar, /isQuiz/);
  });

  it("ports v14 progress meter and skip-link / calc fallback email", () => {
    const chat = readFileSync(
      join(root, "components/chat-questionnaire/chat-questionnaire.tsx"),
      "utf8"
    );
    assert.match(chat, /progressPart|Part \{n\} of 6/);
    assert.match(chat, /mn-chat-q__skip-link/);
    assert.match(chat, /privacyFooter/);
    assert.match(chat, /halfway-health-preview|kind === \"halfway\"/);
    assert.match(chat, /history-collapsed/);
    const calc = readFileSync(
      join(root, "components/chat-questionnaire/questionnaire-calculating.tsx"),
      "utf8"
    );
    assert.match(calc, /showFallback/);
    assert.match(calc, /calc-emailbox/);
    assert.match(calc, /nongPoseSrc\(\"wai\"\)/);
    // Email only inside fallback branch (not always-on)
    assert.match(
      calc,
      /showFallback \? \([\s\S]*calc-emailbox/
    );
    const css = readFileSync(
      join(root, "components/chat-questionnaire/chat-questionnaire.css"),
      "utf8"
    );
    assert.match(css, /mn-quiz-cta-sheen|mn-quiz-cta-shadow-pulse/);
    assert.match(css, /cursor:\s*default/);
    assert.match(css, /health-preview/);
    assert.match(css, /history-collapsed/);
    const engine = readFileSync(join(root, "lib/questionnaire/engine.ts"), "utf8");
    assert.match(engine, /kind:\s*\"halfway\"/);
    assert.match(engine, /Your HealthScore is taking shape/);
    const poses = readFileSync(join(root, "lib/questionnaire/poses.ts"), "utf8");
    assert.match(poses, /wai:\s*\"nong-kneeling/);
  });

  it("shows Thai script in the public language switcher label", async () => {
    const { localeLabels } = await import("../lib/i18n.ts");
    assert.equal(localeLabels.th, "ไทย");
    assert.doesNotMatch(localeLabels.th, /^TH$/i);
  });

  it("starts only after explicit startQuestionnaire and supports reopenTurn", () => {
    const initial = createInitialState({ locale: "en", channel: "web" });
    assert.equal(initial.phase, "intro");
    assert.equal(initial.turnIndex, -1);

    const started = startQuestionnaire(initial);
    assert.equal(started.state.phase, "active");
    assert.equal(getDefinition(started.state).turns[0]?.k, "firstName");

    let { state } = started;
    const r1 = applyAnswer(state, "firstName", "Alex");
    assert.equal(r1.ok, true);
    if (!r1.ok) {
      return;
    }

    state = r1.state;
    const reopened = reopenTurn(state, "firstName");
    assert.equal(reopened.ok, true);
    if (!reopened.ok) {
      return;
    }

    assert.equal(reopened.state.answers.firstName, undefined);
    assert.equal(reopened.state.turnIndex, 0);
    assert.equal(reopened.state.phase, "active");
  });
});
