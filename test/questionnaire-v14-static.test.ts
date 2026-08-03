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
    assert.equal(en.turns.length, 53);
    assert.deepEqual(
      en.turns.map((t) => t.k),
      th.turns.map((t) => t.k)
    );

    const sexEn = en.turns.find((t) => t.k === "sex");
    const sexTh = th.turns.find((t) => t.k === "sex");
    assert.equal(sexEn?.q, "What is your sex?");
    assert.ok(sexTh?.q);
    assert.doesNotMatch(sexEn?.q || "", /at birth/i);
    assert.doesNotMatch(sexTh?.q || "", /เพศกำเนิด/);
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

  it("ships welcome copy for en/th/zh with CTA", () => {
    for (const lang of ["en", "th", "zh"] as const) {
      const pack = welcomePack[lang];
      assert.ok(pack.cta.length > 0, lang);
      assert.ok(pack.headlineHtml.includes("<em>"), lang);
      assert.ok(pack.calcSee.length > 0, lang);
      assert.ok(pack.reviewBtn.length > 0, lang);
    }
  });

  it("forbids sex-at-birth wording in questionnaire sources", () => {
    const dirs = [
      join(root, "content/questionnaire"),
      join(root, "components/chat-questionnaire"),
      join(root, "lib/questionnaire")
    ];
    const files = dirs.flatMap((d) => walkSources(d));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /sex at birth/i, file);
      assert.doesNotMatch(source, /เพศกำเนิด/, file);
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
