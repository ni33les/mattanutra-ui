import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { shouldRedirectToHttps } from "../lib/https-redirect.ts";

describe("https redirect policy", () => {
  it("redirects public proxied http traffic in production", () => {
    assert.equal(
      shouldRedirectToHttps({
        host: "mattanutra.com",
        nodeEnv: "production",
        protocol: "http:",
        xForwardedProto: "http"
      }),
      true
    );
  });

  it("does not redirect local worker traffic", () => {
    assert.equal(
      shouldRedirectToHttps({
        host: "127.0.0.1:8080",
        nodeEnv: "production",
        protocol: "http:",
        xForwardedProto: null
      }),
      false
    );
  });

  it("does not redirect development traffic", () => {
    assert.equal(
      shouldRedirectToHttps({
        host: "localhost:3001",
        nodeEnv: "development",
        protocol: "http:",
        xForwardedProto: "http"
      }),
      false
    );
  });

  it("does not upgrade local dev assets to https", async () => {
    const config = await readFile("next.config.ts", "utf8");
    const occurrences = config.match(/"upgrade-insecure-requests"/g) ?? [];

    assert.equal(occurrences.length, 1);
    assert.match(
      config,
      /\.\.\.\(isDevelopment \? \[\] : \["upgrade-insecure-requests"\]\)/
    );
  });
});
