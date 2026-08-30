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

  it("aligns section stage overlays with v14 HTML behaviour", () => {
    const chat = readFileSync(
      join(root, "components/chat-questionnaire/chat-questionnaire.tsx"),
      "utf8"
    );
    const css = readFileSync(
      join(root, "components/chat-questionnaire/chat-questionnaire.css"),
      "utf8"
    );
    const engine = readFileSync(join(root, "lib/questionnaire/engine.ts"), "utf8");

    // Stage hold + enter animations (fade + Nong pop)
    assert.match(chat, /STAGE_MS\s*=\s*1800/);
    assert.match(chat, /phase:\s*\"show\"/);
    assert.doesNotMatch(chat, /phase:\s*\"prep\"|phase:\s*\"hold\"/);
    assert.match(chat, /showFinishStage/);
    assert.match(chat, /pose:\s*\"wai\"/);
    assert.match(chat, /hasUsableHealthScore/);
    assert.match(css, /mn-quiz-stage-fade-in/);
    assert.match(css, /mn-quiz-stage-pop/);
    assert.match(css, /mn-quiz-stage-card-in/);
    // Site fonts only (no Prompt)
    assert.match(css, /--mn-font-display/);
    assert.doesNotMatch(css, /['\"]Prompt['\"]/);
    assert.match(css, /letter-spacing:\s*0\.18em/);
    assert.match(css, /font-size:\s*1\.6rem/);
    // Stage only when section index increases (not firstName→goals same sec)
    assert.match(
      engine,
      /nextTurn\.sec !== current\.sec[\s\S]{0,120}chat_part_break/
    );
  });

  it("ports v14 progress meter and skip-link / calc fallback email", () => {
    const chat = readFileSync(
      join(root, "components/chat-questionnaire/chat-questionnaire.tsx"),
      "utf8"
    );
    assert.match(chat, /progressPart|Part \{n\} of 6/);
    assert.match(chat, /quiz-progress-header/);
    assert.match(chat, /mn-chat-q__skip-link/);
    assert.match(chat, /privacyFooter/);
    assert.match(chat, /halfway-health-preview|kind === \"halfway\"/);
    assert.match(chat, /isLogItemVisibleOnPage|paged-question/);
    assert.match(chat, /review-answers-btn/);
    // Answers under the question (not a base-page dock with focus ring box)
    assert.match(chat, /composer--under-q|question-answers/);
    assert.doesNotMatch(chat, /composerFocusPulse|composer--focus/);
    // Review always openable (not disabled when empty)
    assert.doesNotMatch(
      chat,
      /review-answers-btn[\s\S]{0,120}disabled=\{!reviewItems/
    );
    const calc = readFileSync(
      join(root, "components/chat-questionnaire/questionnaire-calculating.tsx"),
      "utf8"
    );
    const wait = readFileSync(
      join(root, "components/chat-questionnaire/calculating-wait.tsx"),
      "utf8"
    );
    assert.match(calc, /showEmailEscape/);
    assert.match(calc, /calc-emailbox|email-stack/);
    assert.match(wait, /pose="wai"/);
    assert.match(calc, /CalculatingWait/);
    // No retry button in fallback UI
    assert.doesNotMatch(calc, /calcRetry/);
    assert.doesNotMatch(calc, /onClick=\{onRetry\}/);
    assert.match(calc, /email-stack|email-submit/);
    // Email only inside the failure branch (not always-on)
    assert.match(
      calc,
      /showEmailEscape \? \([\s\S]*email/
    );
    const css = readFileSync(
      join(root, "components/chat-questionnaire/chat-questionnaire.css"),
      "utf8"
    );
    assert.match(css, /composer--under-q/);
    assert.doesNotMatch(css, /composer--focus/);
    assert.match(css, /mn-quiz-cta-sheen|mn-quiz-cta-shadow-pulse/);
    // CTA sheen starts promptly (not 1.2s delay)
    assert.match(css, /mn-quiz-cta-sheen 2\.2s ease-in-out 0\.1s infinite/);
    assert.doesNotMatch(css, /1\.2s infinite/);
    assert.match(css, /cursor:\s*default/);
    assert.match(css, /health-preview/);
    const engine = readFileSync(join(root, "lib/questionnaire/engine.ts"), "utf8");
    assert.match(engine, /kind:\s*\"halfway\"/);
    assert.match(engine, /Your HealthScore is taking shape/);
    const poses = readFileSync(join(root, "lib/questionnaire/poses.ts"), "utf8");
    assert.match(poses, /wai:\s*\"nong-kneeling/);
    const titleBar = readFileSync(join(root, "components/title-bar.tsx"), "utf8");
    assert.match(titleBar, /mn-titlebar-lang-always/);
    const customerCss = readFileSync(join(root, "app/customer.css"), "utf8");
    assert.match(customerCss, /mn-titlebar-lang-always/);
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

    // First page must keep intro greeting + first question together
    assert.ok(
      started.state.log.some((m) => m.kind === "intro"),
      "engine should emit intro bubble"
    );
    assert.ok(
      started.state.log.some((m) => m.kind === "bot" && m.turnKey === "firstName"),
      "engine should emit firstName bot on start"
    );
    const intro = started.state.log.find((m) => m.kind === "intro");
    assert.ok(intro && intro.kind === "intro");
    if (intro && intro.kind === "intro") {
      assert.match(intro.text, /Ready|matters most/i);
      assert.match(intro.hint || "", /One question at a time/i);
    }

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

  it("paged mode keeps intro visible with the first question in source", () => {
    const chat = readFileSync(
      join(root, "components/chat-questionnaire/chat-questionnaire.tsx"),
      "utf8"
    );
    assert.match(chat, /onFirstQuestionPage/);
    assert.match(chat, /kind === \"intro\"/);
    // Must not hide intro merely because a bot row exists
    assert.doesNotMatch(
      chat,
      /kind === \"intro\"[\s\S]{0,80}!log\.some\(\(entry\) => entry\.kind === \"bot\"\)/
    );
  });

  it("renders food-question leading emojis from turn.emoji", () => {
    const en = getQuestionnaireDefinition("en");
    const meat = en.turns.find((t) => t.k === "f_redmeat");
    assert.equal(meat?.emoji, "🥩");
    assert.equal(en.turns.find((t) => t.k === "f_dairy")?.emoji, "🧀");
    assert.equal(en.turns.find((t) => t.k === "f_fruitveg")?.emoji, "🥦");
    assert.equal(en.turns.find((t) => t.k === "f_eggs")?.emoji, "🥚");
    assert.equal(en.turns.find((t) => t.k === "f_legumes")?.emoji, "🥜");
    assert.equal(en.turns.find((t) => t.k === "f_fish")?.emoji, "🐟");

    const chat = readFileSync(
      join(root, "components/chat-questionnaire/chat-questionnaire.tsx"),
      "utf8"
    );
    const css = readFileSync(
      join(root, "components/chat-questionnaire/chat-questionnaire.css"),
      "utf8"
    );
    assert.match(chat, /mn-chat-q__em|turnEmoji|msg\.emoji/);
    assert.match(css, /\.mn-chat-q__em\b/);

    const started = startQuestionnaire(
      createInitialState({ locale: "en", channel: "web" })
    );
    // botMessage should carry emoji when present on the turn
    const { botMessage } = { botMessage: null as null };
    // Spot-check via definition + UI wiring only; engine attaches emoji on bot logs
    const engine = readFileSync(join(root, "lib/questionnaire/engine.ts"), "utf8");
    assert.match(engine, /emoji:\s*turn\.emoji/);
    void started;
  });

  it("shows Why that mattered insight reacts with pose (not filtered out after advance)", () => {
    const chat = readFileSync(
      join(root, "components/chat-questionnaire/chat-questionnaire.tsx"),
      "utf8"
    );
    const css = readFileSync(
      join(root, "components/chat-questionnaire/chat-questionnaire.css"),
      "utf8"
    );
    assert.match(chat, /insight-react/);
    assert.match(chat, /Why that mattered/);
    assert.match(chat, /คำตอบนี้สำคัญอย่างไร/);
    assert.match(chat, /mn-chat-q__insight-label/);
    // Visible between previous bot and current bot after advance
    assert.match(chat, /index > prevBotIdx && index < currentBotIdx/);
    assert.match(css, /mn-chat-q__insight-label/);
    assert.match(css, /mn-cq-wiggle/);

    // Engine still emits goals react with celebrate pose
    let { state } = startQuestionnaire(
      createInitialState({ locale: "en", channel: "web" })
    );
    const name = applyAnswer(state, "firstName", "Alex");
    assert.equal(name.ok, true);
    if (!name.ok) {
      return;
    }
    state = name.state;
    const goals = applyAnswer(state, "goals", ["energy", "sleep"]);
    assert.equal(goals.ok, true);
    if (!goals.ok) {
      return;
    }
    const react = goals.state.log.find(
      (m) => m.kind === "react" && m.id === "goals"
    );
    assert.ok(react && react.kind === "react");
    if (react && react.kind === "react") {
      assert.equal(react.pose, "celebrate");
      assert.match(react.text, /spine of your formula/i);
    }
  });
});
