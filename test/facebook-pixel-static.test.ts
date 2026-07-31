import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  facebookEventForInternal,
  facebookPixelEnabled,
  getFacebookPixelIds
} from "../lib/facebook-pixel.ts";

describe("facebook pixel mapping", () => {
  it("maps funnel BPM events to Meta standard events", () => {
    assert.deepEqual(facebookEventForInternal("assessment_submitted"), {
      event: "Lead"
    });
    assert.deepEqual(facebookEventForInternal("chat_complete"), {
      event: "Lead"
    });
    assert.deepEqual(facebookEventForInternal("healthscore_viewed"), {
      event: "CompleteRegistration"
    });
    assert.deepEqual(facebookEventForInternal("assessment_started"), {
      event: "InitiateCheckout"
    });
    assert.equal(facebookEventForInternal("random_internal_event"), null);
  });

  it("uses the MattaNutra default pixel id when env is unset", () => {
    assert.equal(facebookPixelEnabled(), true);
    assert.ok(getFacebookPixelIds().includes("27629903823308584"));
  });

  it("is wired into the locale layout", () => {
    const layout = readFileSync(
      new URL("../app/[locale]/layout.tsx", import.meta.url),
      "utf8"
    );
    assert.match(layout, /FacebookPixel/);
    assert.match(layout, /from "@\/components\/facebook-pixel"/);
  });

  it("bpm client mirrors mapped events to the pixel helper", () => {
    const bpm = readFileSync(
      new URL("../lib/bpm-client.ts", import.meta.url),
      "utf8"
    );
    assert.match(bpm, /facebook-pixel/);
    assert.match(bpm, /facebookEventForInternal/);
  });
});
