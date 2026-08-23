import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { devShortcutsEnabledForHost } from "../lib/dev-shortcuts.ts";

const originalEnv = process.env.MATTANUTRA_ENV;

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.MATTANUTRA_ENV;
  } else {
    process.env.MATTANUTRA_ENV = originalEnv;
  }
});

describe("dev shortcut availability", () => {
  it("shows assessment dev defaults on dev and UAT hosts", () => {
    delete process.env.MATTANUTRA_ENV;

    assert.equal(devShortcutsEnabledForHost("dev.mattanutra.com"), true);
    assert.equal(devShortcutsEnabledForHost("uat.mattanutra.com"), true);
  });

  it("shows assessment dev defaults for the UAT environment", () => {
    process.env.MATTANUTRA_ENV = "uat";

    assert.equal(devShortcutsEnabledForHost("mattanutra.com"), true);
  });

  it("does not show assessment dev defaults on production hosts by default", () => {
    delete process.env.MATTANUTRA_ENV;

    assert.equal(devShortcutsEnabledForHost("mattanutra.com"), false);
    assert.equal(devShortcutsEnabledForHost("www.mattanutra.com"), false);
  });

  it("shows a fill-and-finish shortcut on DEV/UAT chat quiz, including production builds", async () => {
    const [chat, welcome, quiz, flow] = await Promise.all([
      readFile("components/chat-questionnaire/chat-questionnaire.tsx", "utf8"),
      readFile("components/chat-questionnaire/questionnaire-welcome.tsx", "utf8"),
      readFile("app/[locale]/nutrition/quiz/page.tsx", "utf8"),
      readFile("components/assessment-flow.tsx", "utf8")
    ]);

    assert.match(quiz, /devShortcutsEnabledForHost/);
    assert.match(quiz, /showDevShortcut=\{showDevShortcut\}/);
    assert.match(chat, /fastForwardQuestionnaire/);
    assert.match(chat, /data-testid="dev-fill-questionnaire"/);
    assert.doesNotMatch(
      chat,
      /showDevShortcut && process\.env\.NODE_ENV !== "production"/
    );
    assert.match(welcome, /onDevFastForward/);
    assert.match(welcome, /Fill questionnaire \(DEV\)/);
    assert.match(flow, /prepareHealthScoreGate\(filled\)/);
  });
});
