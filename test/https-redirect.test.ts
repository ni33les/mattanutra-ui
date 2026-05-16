import assert from "node:assert/strict";
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
});
