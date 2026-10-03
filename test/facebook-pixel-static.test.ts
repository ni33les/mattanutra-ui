import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DEFAULT_FACEBOOK_PIXEL_ID,
  facebookEventForInternal,
  facebookPixelEnabled,
  getFacebookPixelIds,
  getPrimaryFacebookPixelId,
  resolveMattanutraRuntimeEnv
} from "../lib/facebook-pixel.ts";
import {
  hashEmailForFacebook,
  hashPhoneForFacebook,
  normaliseEmailForFacebook,
  normalisePhoneForFacebook,
  sha256Hex
} from "../lib/facebook-capi.ts";

const env = process.env as Record<string, string | undefined>;

function withEnv(
  overrides: Record<string, string | undefined>,
  run: () => void
) {
  const keys = Object.keys(overrides);
  const previous: Record<string, string | undefined> = {};
  for (const key of keys) {
    previous[key] = env[key];
    const next = overrides[key];
    if (next === undefined) {
      delete env[key];
    } else {
      env[key] = next;
    }
  }
  try {
    run();
  } finally {
    for (const key of keys) {
      const prev = previous[key];
      if (prev === undefined) {
        delete env[key];
      } else {
        env[key] = prev;
      }
    }
  }
}

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

  it("uses the production default pixel only on prd when env is unset", () => {
    withEnv(
      {
        MATTANUTRA_ENV: "prd",
        NEXT_PUBLIC_MATTANUTRA_ENV: "prd",
        NEXT_PUBLIC_FACEBOOK_PIXEL_ID: undefined,
        NEXT_PUBLIC_META_PIXEL_ID: undefined,
        FACEBOOK_PIXEL_ID: undefined,
        FACEBOOK_ALLOW_SHARED_PIXEL: undefined,
        NEXT_PUBLIC_FACEBOOK_ALLOW_SHARED_PIXEL: undefined
      },
      () => {
        assert.equal(resolveMattanutraRuntimeEnv(), "prd");
        assert.equal(facebookPixelEnabled(), true);
        assert.ok(getFacebookPixelIds().includes(DEFAULT_FACEBOOK_PIXEL_ID));
      }
    );
  });

  it("does not send UAT into the production default pixel", () => {
    withEnv(
      {
        MATTANUTRA_ENV: "uat",
        NEXT_PUBLIC_MATTANUTRA_ENV: "uat",
        NEXT_PUBLIC_FACEBOOK_PIXEL_ID: DEFAULT_FACEBOOK_PIXEL_ID,
        FACEBOOK_PIXEL_ID: DEFAULT_FACEBOOK_PIXEL_ID,
        FACEBOOK_ALLOW_SHARED_PIXEL: undefined,
        NEXT_PUBLIC_FACEBOOK_ALLOW_SHARED_PIXEL: undefined
      },
      () => {
        assert.equal(resolveMattanutraRuntimeEnv(), "uat");
        assert.equal(facebookPixelEnabled(), false);
        assert.equal(getPrimaryFacebookPixelId(), "");
      }
    );
  });

  it("allows a dedicated UAT pixel id", () => {
    withEnv(
      {
        MATTANUTRA_ENV: "uat",
        NEXT_PUBLIC_MATTANUTRA_ENV: "uat",
        NEXT_PUBLIC_FACEBOOK_PIXEL_ID: "111111111111111",
        FACEBOOK_ALLOW_SHARED_PIXEL: undefined
      },
      () => {
        assert.equal(resolveMattanutraRuntimeEnv(), "uat");
        assert.equal(facebookPixelEnabled(), true);
        assert.deepEqual(getFacebookPixelIds(), ["111111111111111"]);
      }
    );
  });

  it("allows shared production pixel on UAT only with explicit opt-in", () => {
    withEnv(
      {
        MATTANUTRA_ENV: "uat",
        NEXT_PUBLIC_MATTANUTRA_ENV: "uat",
        NEXT_PUBLIC_FACEBOOK_PIXEL_ID: DEFAULT_FACEBOOK_PIXEL_ID,
        FACEBOOK_ALLOW_SHARED_PIXEL: "true"
      },
      () => {
        assert.equal(facebookPixelEnabled(), true);
        assert.ok(getFacebookPixelIds().includes(DEFAULT_FACEBOOK_PIXEL_ID));
      }
    );
  });

  it("uses the consent-gated export boundary instead of forwarding arbitrary BPM payloads", () => {
    const bpm = readFileSync(new URL("../lib/bpm-client.ts", import.meta.url), "utf8");
    const route = readFileSync(new URL("../app/api/bpm/route.ts", import.meta.url), "utf8");
    const layout = readFileSync(new URL("../app/[locale]/layout.tsx", import.meta.url), "utf8");
    assert.match(bpm, /trackMetaBpm/);
    assert.doesNotMatch(route, /mirrorBpmEventToFacebookCapi/);
    assert.match(layout, /MarketingPreference/);
    assert.doesNotMatch(layout, /FacebookPixelNoscript/);
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
