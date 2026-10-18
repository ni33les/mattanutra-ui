import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_FACEBOOK_PIXEL_ID } from "../lib/facebook-pixel.ts";
import { metaConfig, metaPublicConfig } from "../lib/meta-config.ts";

const productionPixel = "111111111111111";
const testPixel = "222222222222222";
const environmentKeys = [
  "MATTANUTRA_ENV", "NEXT_PUBLIC_MATTANUTRA_ENV", "META_TRACKING_ENABLED",
  "FACEBOOK_PIXEL_ID", "NEXT_PUBLIC_FACEBOOK_PIXEL_ID", "NEXT_PUBLIC_META_PIXEL_ID", "NEXT_PUBLIC_FACEBOOK_PIXEL_IDS",
  "FACEBOOK_PIXEL_ID_DEV", "FACEBOOK_PIXEL_ID_UAT", "FACEBOOK_PIXEL_ID_PRD",
  "FACEBOOK_CAPI_ACCESS_TOKEN", "FACEBOOK_CAPI_ACCESS_TOKEN_DEV", "FACEBOOK_CAPI_ACCESS_TOKEN_UAT", "FACEBOOK_CAPI_ACCESS_TOKEN_PRD",
  "FACEBOOK_CAPI_TEST_EVENT_CODE_DEV", "FACEBOOK_CAPI_TEST_EVENT_CODE_UAT", "FACEBOOK_CAPI_TEST_EVENT_CODE_PRD",
  "FACEBOOK_ALLOW_SHARED_PIXEL", "NEXT_PUBLIC_FACEBOOK_ALLOW_SHARED_PIXEL"
];

function withEnv(overrides: Record<string, string | undefined>, run: () => void) {
  const previous = new Map(environmentKeys.map(key => [key, process.env[key]]));
  try {
    for (const key of environmentKeys) delete process.env[key];
    process.env.META_TRACKING_ENABLED = "true";
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("Meta dataset isolation", () => {
  it("keeps production-specific credentials ahead of generic credentials", () => {
    withEnv({ MATTANUTRA_ENV: "prd", FACEBOOK_PIXEL_ID_PRD: ` ${productionPixel} `, FACEBOOK_CAPI_ACCESS_TOKEN_PRD: " production-token ",
      FACEBOOK_PIXEL_ID: testPixel, FACEBOOK_CAPI_ACCESS_TOKEN: "generic-token" }, () => {
      assert.deepEqual(metaPublicConfig(), { environment: "prd", pixelId: productionPixel, enabled: true });
      assert.equal(metaConfig().token, "production-token");
      assert.equal("token" in metaPublicConfig(), false);
    });
  });

  it("preserves production generic credentials and public/default pixel fallbacks", () => {
    for (const key of ["FACEBOOK_PIXEL_ID", "NEXT_PUBLIC_FACEBOOK_PIXEL_ID", "NEXT_PUBLIC_META_PIXEL_ID", "NEXT_PUBLIC_FACEBOOK_PIXEL_IDS"]) {
      withEnv({ MATTANUTRA_ENV: "prd", [key]: productionPixel, FACEBOOK_CAPI_ACCESS_TOKEN: "production-token" }, () => {
        assert.deepEqual(metaPublicConfig(), { environment: "prd", pixelId: productionPixel, enabled: true });
        assert.equal(metaConfig().token, "production-token");
      });
    }
    withEnv({ MATTANUTRA_ENV: "prd", FACEBOOK_CAPI_ACCESS_TOKEN: "production-token" }, () => {
      assert.deepEqual(metaPublicConfig(), { environment: "prd", pixelId: DEFAULT_FACEBOOK_PIXEL_ID, enabled: true });
    });
  });

  it("keeps the production fallback when the public build environment is stale", () => {
    withEnv({ MATTANUTRA_ENV: "prd", NEXT_PUBLIC_MATTANUTRA_ENV: "uat", FACEBOOK_CAPI_ACCESS_TOKEN_PRD: "production-token" }, () => {
      assert.deepEqual(metaPublicConfig(), { environment: "prd", pixelId: DEFAULT_FACEBOOK_PIXEL_ID, enabled: true });
    });
  });

  for (const environment of ["dev", "uat"] as const) {
    const suffix = environment.toUpperCase();
    const dedicated = {
      MATTANUTRA_ENV: environment,
      [`FACEBOOK_PIXEL_ID_${suffix}`]: testPixel,
      [`FACEBOOK_CAPI_ACCESS_TOKEN_${suffix}`]: "test-token"
    };

    it(`enables ${environment} only with explicit credentials for a separate dataset`, () => {
      withEnv({ ...dedicated, FACEBOOK_PIXEL_ID: productionPixel, FACEBOOK_CAPI_ACCESS_TOKEN: "production-token",
        NEXT_PUBLIC_MATTANUTRA_ENV: "prd", [`FACEBOOK_CAPI_TEST_EVENT_CODE_${suffix}`]: " test-code " }, () => {
        assert.deepEqual(metaPublicConfig(), { environment, pixelId: testPixel, enabled: true });
        assert.equal(metaConfig().token, "test-token");
        assert.equal(metaConfig().testEventCode, "test-code");
      });
    });

    it(`does not reuse generic credentials in ${environment}`, () => {
      withEnv({ MATTANUTRA_ENV: environment, FACEBOOK_PIXEL_ID: productionPixel, FACEBOOK_CAPI_ACCESS_TOKEN: "production-token",
        FACEBOOK_ALLOW_SHARED_PIXEL: "true", NEXT_PUBLIC_FACEBOOK_ALLOW_SHARED_PIXEL: "true" }, () => {
        assert.deepEqual(metaPublicConfig(), { environment, pixelId: "", enabled: false });
        assert.equal(metaConfig().token, "");
      });
      for (const missingKey of [`FACEBOOK_PIXEL_ID_${suffix}`, `FACEBOOK_CAPI_ACCESS_TOKEN_${suffix}`]) {
        withEnv({ ...dedicated, [missingKey]: undefined, FACEBOOK_PIXEL_ID: productionPixel, FACEBOOK_CAPI_ACCESS_TOKEN: "production-token" }, () => {
          assert.equal(metaConfig().enabled, false, missingKey);
          assert.equal(metaPublicConfig().enabled, false, missingKey);
        });
      }
    });

    it(`blocks known and configured production pixels in ${environment}, including legacy sharing overrides`, () => {
      const candidates = [
        { [`FACEBOOK_PIXEL_ID_${suffix}`]: DEFAULT_FACEBOOK_PIXEL_ID },
        ...["FACEBOOK_PIXEL_ID_PRD", "FACEBOOK_PIXEL_ID", "NEXT_PUBLIC_FACEBOOK_PIXEL_ID", "NEXT_PUBLIC_META_PIXEL_ID"]
          .map(key => ({ [key]: ` ${testPixel} ` })),
        { NEXT_PUBLIC_FACEBOOK_PIXEL_IDS: `${productionPixel}, ${testPixel} ` }
      ];
      for (const candidate of candidates) {
        withEnv({ ...dedicated, ...candidate, FACEBOOK_ALLOW_SHARED_PIXEL: "true", NEXT_PUBLIC_FACEBOOK_ALLOW_SHARED_PIXEL: "true",
          [`FACEBOOK_CAPI_TEST_EVENT_CODE_${suffix}`]: "test-code" }, () => {
          assert.equal(metaConfig().enabled, false, JSON.stringify(candidate));
          assert.equal(metaPublicConfig().enabled, false, JSON.stringify(candidate));
        });
      }
    });

    it(`keeps ${environment} disabled without a valid pixel, token, or tracking opt-in`, () => {
      for (const override of [
        { META_TRACKING_ENABLED: "false" },
        { [`FACEBOOK_PIXEL_ID_${suffix}`]: "invalid" },
        { [`FACEBOOK_PIXEL_ID_${suffix}`]: " " },
        { [`FACEBOOK_CAPI_ACCESS_TOKEN_${suffix}`]: " " }
      ]) {
        withEnv({ ...dedicated, ...override }, () => assert.equal(metaConfig().enabled, false));
      }
    });
  }
});
