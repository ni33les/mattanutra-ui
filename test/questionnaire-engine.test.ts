import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAnswer,
  computePrecision,
  createInitialState,
  getDefinition,
  getNextPrompt,
  isQuestionnaireComplete,
  skipTurn,
  startQuestionnaire
} from "@/lib/questionnaire/engine";
import { toAssessmentAnswers } from "@/lib/questionnaire/normalize";
import {
  QuestionnaireAgentCoordinator,
  allQuestionnaireToolSpecs,
  questionnaireToolsForLlm
} from "@/lib/questionnaire/agents";
import { getQuestionnaireDefinition } from "@/lib/questionnaire/definition";

describe("questionnaire v6 definition", () => {
  it("loads EN and TH with matching turn keys and firstName first", () => {
    const en = getQuestionnaireDefinition("en");
    const th = getQuestionnaireDefinition("th");
    assert.equal(en.version, "v6-conversational");
    assert.equal(en.turns.length, 53);
    assert.equal(th.turns.length, 53);
    assert.equal(en.turns[0]?.k, "firstName");
    assert.equal(en.turns[en.turns.length - 1]?.k, "labs");
    assert.deepEqual(
      en.turns.map((t) => t.k),
      th.turns.map((t) => t.k)
    );
    assert.equal(en.sections.length, 6);
    assert.ok(en.meta.labs.length >= 6);
    assert.ok(en.meta.autofill.f_redmeat);
    assert.ok(en.acks.pool.length > 0);
    assert.ok(en.meetLine.includes("{n}"));
  });

  it("falls back zh-CN to EN turns", () => {
    const zh = getQuestionnaireDefinition("zh-CN");
    assert.equal(zh.lang, "en");
    assert.equal(zh.turns[0]?.k, "firstName");
  });
});

describe("questionnaire engine v6", () => {
  it("starts on firstName after intro (no section intro yet)", () => {
    const started = startQuestionnaire(
      createInitialState({ locale: "en", channel: "web" })
    );
    assert.equal(started.state.phase, "active");
    const prompt = getNextPrompt(started.state);
    assert.equal(prompt.turn?.k, "firstName");
    assert.ok(!started.state.log.some((m) => m.kind === "section"));
    assert.ok(started.events.some((e) => e.type === "chat_start"));
  });

  it("shows Part 1 section after firstName, then goals", () => {
    let { state } = startQuestionnaire(
      createInitialState({ locale: "en", channel: "agent" })
    );
    const r = applyAnswer(state, "firstName", "Alex");
    assert.equal(r.ok, true);
    if (!r.ok) {
      return;
    }

    state = r.state;
    assert.ok(state.log.some((m) => m.kind === "ack" && m.id === "meet"));
    assert.ok(state.log.some((m) => m.kind === "section" && m.sectionIndex === 0));
    assert.equal(getNextPrompt(state).turn?.k, "goals");
  });

  it("vegan diet autofills food frequencies and skips those turns", () => {
    let { state } = startQuestionnaire(
      createInitialState({ locale: "en", channel: "agent" })
    );

    const answer = (key: string, value: unknown) => {
      assert.equal(getNextPrompt(state).turn?.k, key, `expected turn ${key}`);
      const r = applyAnswer(state, key, value);
      assert.equal(r.ok, true, r.ok ? "" : r.error);
      if (r.ok) {
        state = r.state;
      }
    };

    answer("firstName", "Sam");
    answer("goals", ["energy"]);
    answer("symptoms", ["great"]);
    answer("sex", "male");
    answer("age", "36-45");

    // walk daily life until diet
    const walkTo = (target: string) => {
      let guard = 0;
      while (getNextPrompt(state).turn?.k !== target && guard < 40) {
        const turn = getNextPrompt(state).turn;
        assert.ok(turn, "expected a turn");
        if (turn!.kind === "single" && turn!.opts?.[0]) {
          const r = applyAnswer(state, turn!.k, turn!.opts[0].v);
          assert.equal(r.ok, true);
          if (r.ok) {
            state = r.state;
          }
        } else if (turn!.kind === "sliders") {
          const r = applyAnswer(state, turn!.k, { h: "175", w: "70" });
          assert.equal(r.ok, true);
          if (r.ok) {
            state = r.state;
          }
        } else if (turn!.kind === "swatch") {
          const r = applyAnswer(state, turn!.k, "3");
          assert.equal(r.ok, true);
          if (r.ok) {
            state = r.state;
          }
        } else if (turn!.kind === "confirm") {
          const r = applyAnswer(state, turn!.k, true);
          assert.equal(r.ok, true);
          if (r.ok) {
            state = r.state;
          }
        } else if (turn!.optional || turn!.req === 0) {
          const r = skipTurn(state, turn!.k);
          assert.equal(r.ok, true);
          if (r.ok) {
            state = r.state;
          }
        } else {
          assert.fail(`cannot auto-walk turn ${turn!.k} kind ${turn!.kind}`);
        }
        guard += 1;
      }
    };

    walkTo("diet");
    const dietResult = applyAnswer(state, "diet", "vegan");
    assert.equal(dietResult.ok, true);
    if (!dietResult.ok) {
      return;
    }

    state = dietResult.state;
    assert.equal(state.answers.f_redmeat, "never");
    assert.equal(state.answers.f_fish, "never");
    assert.equal(state.answers.f_dairy, "never");
    assert.equal(state.answers.f_eggs, "rare");
    assert.ok(dietResult.events.some((e) => e.type === "chat_autofill"));
    assert.ok(state.log.some((m) => m.kind === "react" && m.id === "vg"));

    // next should skip autofilled food questions
    const nextKey = getNextPrompt(state).turn?.k;
    assert.ok(
      nextKey === "f_fruitveg" || nextKey === "f_legumes" || nextKey === "allergies",
      `unexpected next after vegan: ${nextKey}`
    );
    assert.notEqual(nextKey, "f_redmeat");
    assert.notEqual(nextKey, "f_fish");
    assert.notEqual(nextKey, "f_dairy");
    assert.notEqual(nextKey, "f_eggs");
  });

  it("precision skip jumps optional block to complete after no firstName-last", () => {
    let state = createInitialState({ locale: "en", channel: "agent" });
    const definition = getDefinition(state);
    state = startQuestionnaire(state).state;
    const gateIdx = definition.turns.findIndex((t) => t.k === "precisionGate");
    state = { ...state, turnIndex: gateIdx, phase: "active" };

    const result = applyAnswer(state, "precisionGate", "skip");
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    state = result.state;
    // After skip optional block, no more turns (labs etc skipped) → complete
    assert.equal(state.phase, "complete");
    assert.ok(result.events.some((e) => e.type === "chat_precision_skip"));
    assert.ok(result.events.some((e) => e.type === "chat_complete"));
  });

  it("computes precision between 8 and 100", () => {
    const { state } = startQuestionnaire(
      createInitialState({ locale: "en", channel: "web" })
    );
    const definition = getDefinition(state);
    const pct = computePrecision(definition, state);
    assert.ok(pct >= 8 && pct <= 100);
  });

  it("female-only turns after sex female", () => {
    let { state } = startQuestionnaire(
      createInitialState({ locale: "en", channel: "agent" })
    );

    const answer = (key: string, value: unknown) => {
      const r = applyAnswer(state, key, value);
      assert.equal(r.ok, true, r.ok ? "" : r.error);
      if (r.ok) {
        state = r.state;
      }
    };

    answer("firstName", "Pat");
    answer("goals", ["energy"]);
    answer("symptoms", ["great"]);
    answer("sex", "female");
    answer("age", "26-35");
    assert.equal(getNextPrompt(state).turn?.k, "reproStatus");
  });
});

describe("normalize to assessment answers", () => {
  it("maps hw, skin, f_* and labs", () => {
    const answers = toAssessmentAnswers({
      firstName: "Alex",
      goals: ["energy", "sleep"],
      symptoms: ["great"],
      sex: "male",
      age: "36-45",
      hw: { h: "180", w: "80" },
      skin: "3",
      f_redmeat: "1-2",
      f_dairy: "never",
      f_fruitveg: "3+",
      f_eggs: "weekly",
      f_legumes: "most",
      f_fish: "once",
      disclosure: true,
      consentSafety: true,
      lab_vitd: "40",
      unit_vitd: "ng/mL",
      vo2: "45"
    });

    assert.equal(answers.heightCm, "180");
    assert.equal(answers.weightKg, "80");
    assert.equal(answers.skin, "III");
    assert.equal(answers.foodFrequency.redmeat, "1-2");
    assert.equal(answers.labs.vitd, "40");
    assert.equal(answers.labUnits.vitd, "ng/mL");
    assert.equal(answers.vo2, "45");
    assert.equal(answers.firstName, "Alex");
    assert.equal(answers.disclosure, true);
  });
});

describe("questionnaire agent coordinator", () => {
  it("exposes LLM tool specs", () => {
    const tools = questionnaireToolsForLlm();
    assert.ok(tools.some((t) => t.function.name === "submit_answer"));
    assert.ok(tools.some((t) => t.function.name === "finalize_assessment"));
    assert.ok(allQuestionnaireToolSpecs().length >= 6);
  });

  it("runs start → firstName via tools", async () => {
    const coord = new QuestionnaireAgentCoordinator({
      locale: "en",
      channel: "agent"
    });

    const started = await coord.invoke({ name: "start_session", args: {} });
    assert.equal(started.ok, true);
    const prompt = (started.data as { prompt: { turn: { k: string } } }).prompt;
    assert.equal(prompt.turn.k, "firstName");

    const answered = await coord.invoke({
      name: "submit_answer",
      args: { turnKey: "firstName", value: "Alex" }
    });
    assert.equal(answered.ok, true);
    const next = (answered.data as { prompt: { turn: { k: string } } }).prompt;
    assert.equal(next.turn.k, "goals");
  });
});

describe("isQuestionnaireComplete", () => {
  it("is false at start", () => {
    const { state } = startQuestionnaire(
      createInitialState({ locale: "th", channel: "web" })
    );
    assert.equal(isQuestionnaireComplete(state), false);
  });
});
