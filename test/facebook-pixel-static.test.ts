import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  facebookEventForInternal,
  facebookPixelEnabled,
  getFacebookPixelIds
} from "../lib/facebook-pixel.ts";
import {
  hashEmailForFacebook,
  hashPhoneForFacebook,
  normaliseEmailForFacebook,
  normalisePhoneForFacebook,
  sha256Hex
} from "../lib/facebook-capi.ts";

describe("facebook pixel mapping", () => {
  it("maps funnel BPM events so Lead means results ready", () => {
    assert.deepEqual(facebookEventForInternal("healthscore_ready"), {
      event: "Lead"
    });
    assert.deepEqual(facebookEventForInternal("assessment_submitted"), {
      event: "QuizSubmitted",
      custom: true
    });
    assert.deepEqual(facebookEventForInternal("chat_complete"), {
      event: "QuizSubmitted",
      custom: true
    });
    assert.deepEqual(facebookEventForInternal("healthscore_viewed"), {
      event: "ViewContent"
    });
    assert.deepEqual(facebookEventForInternal("assessment_started"), {
      event: "QuizStart",
      custom: true
    });
    assert.deepEqual(facebookEventForInternal("chat_view"), {
      event: "QuizStart",
      custom: true
    });
    assert.deepEqual(facebookEventForInternal("email_capture"), {
      event: "EmailCapture",
      custom: true
    });
    assert.deepEqual(facebookEventForInternal("line_connected"), {
      event: "Subscribe"
    });
    assert.equal(facebookEventForInternal("random_internal_event"), null);
  });

  it("uses the MattaNutra default pixel id when env is unset", () => {
    assert.equal(facebookPixelEnabled(), true);
    assert.ok(getFacebookPixelIds().includes("27629903823308584"));
  });

  it("is wired into the locale layout with noscript fallback", () => {
    const layout = readFileSync(
      new URL("../app/[locale]/layout.tsx", import.meta.url),
      "utf8"
    );
    assert.match(layout, /FacebookPixel/);
    assert.match(layout, /FacebookPixelNoscript/);
    assert.match(layout, /from "@\/components\/facebook-pixel"/);

    const pixel = readFileSync(
      new URL("../components/facebook-pixel.tsx", import.meta.url),
      "utf8"
    );
    assert.match(pixel, /fbq\('init'/);
    assert.match(pixel, /fbq\('track', 'PageView'\)/);
    assert.match(pixel, /connect\.facebook\.net\/en_US\/fbevents\.js/);
    assert.match(pixel, /www\.facebook\.com\/tr\?id=/);
    assert.match(pixel, /DEFAULT_FACEBOOK_PIXEL_ID/);
    const helper = readFileSync(
      new URL("../lib/facebook-pixel.ts", import.meta.url),
      "utf8"
    );
    assert.match(helper, /27629903823308584/);
    // Conversions must not fire from path alone.
    assert.doesNotMatch(pixel, /trackFacebookEvent\("Lead"/);
    assert.doesNotMatch(pixel, /trackFacebookEvent\("CompleteRegistration"/);
    assert.doesNotMatch(pixel, /trackFacebookEvent\("InitiateCheckout"/);
  });

  it("bpm client mirrors mapped events with shared event_id for CAPI dedupe", () => {
    const bpm = readFileSync(
      new URL("../lib/bpm-client.ts", import.meta.url),
      "utf8"
    );
    assert.match(bpm, /facebook-pixel/);
    assert.match(bpm, /facebookEventForInternal/);
    assert.match(bpm, /facebookEventId/);
    assert.match(bpm, /eventID: facebookEventId/);
    assert.match(bpm, /claimFacebookLeadOnce/);
  });

  it("supports eventID on the browser pixel helper", () => {
    const helper = readFileSync(
      new URL("../lib/facebook-pixel.ts", import.meta.url),
      "utf8"
    );
    assert.match(helper, /eventID/);
    assert.match(helper, /trackCustom[\s\S]*eventID|eventID[\s\S]*trackCustom/);
  });

  it("wires server CAPI from the BPM route", () => {
    const route = readFileSync(
      new URL("../app/api/bpm/route.ts", import.meta.url),
      "utf8"
    );
    assert.match(route, /mirrorBpmEventToFacebookCapi/);
    assert.match(route, /facebookEventId/);
  });

  it("fires line_connected after LINE connect success", () => {
    const living = readFileSync(
      new URL("../components/living-protocol-line-cta.tsx", import.meta.url),
      "utf8"
    );
    const reveal = readFileSync(
      new URL("../components/reveal-final-results.tsx", import.meta.url),
      "utf8"
    );
    assert.match(living, /trackBpmEvent\("line_connected"/);
    assert.match(reveal, /trackBpmEvent\("line_connected"/);
  });
});

describe("facebook CAPI hashing", () => {
  it("normalises and hashes email", () => {
    assert.equal(normaliseEmailForFacebook("  Ada@Example.COM "), "ada@example.com");
    assert.equal(
      hashEmailForFacebook("  Ada@Example.COM "),
      sha256Hex("ada@example.com")
    );
  });

  it("normalises Thai phones to 66… then hashes", () => {
    assert.equal(normalisePhoneForFacebook("0812345678"), "66812345678");
    assert.equal(normalisePhoneForFacebook("+66 81 234 5678"), "66812345678");
    assert.equal(normalisePhoneForFacebook("66812345678"), "66812345678");
    assert.equal(
      hashPhoneForFacebook("0812345678"),
      sha256Hex("66812345678")
    );
  });
});
