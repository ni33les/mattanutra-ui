import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
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
});
