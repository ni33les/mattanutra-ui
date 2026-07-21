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

  it("does not redirect when the edge already terminated TLS", () => {
    // Common DigitalOcean / reverse-proxy shape: app sees http: but
    // x-forwarded-proto is https.
    assert.equal(
      shouldRedirectToHttps({
        host: "www.mattanutra.com",
        nodeEnv: "production",
        protocol: "http:",
        xForwardedProto: "https"
      }),
      false
    );
  });

  it("uses the first x-forwarded-proto hop", () => {
    assert.equal(
      shouldRedirectToHttps({
        host: "www.mattanutra.com",
        nodeEnv: "production",
        protocol: "http:",
        xForwardedProto: "https, http"
      }),
      false
    );
    assert.equal(
      shouldRedirectToHttps({
        host: "www.mattanutra.com",
        nodeEnv: "production",
        protocol: "http:",
        xForwardedProto: "http, https"
      }),
      true
    );
  });

  it("redirects plain production http when the proxy header is missing", () => {
    assert.equal(
      shouldRedirectToHttps({
        host: "app.mattanutra.com",
        nodeEnv: "production",
        protocol: "http:",
        xForwardedProto: null
      }),
      true
    );
  });

  it("does not redirect already-https public traffic", () => {
    assert.equal(
      shouldRedirectToHttps({
        host: "www.mattanutra.com",
        nodeEnv: "production",
        protocol: "https:",
        xForwardedProto: "https"
      }),
      false
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
    assert.equal(
      shouldRedirectToHttps({
        host: "localhost",
        nodeEnv: "production",
        protocol: "http:",
        xForwardedProto: "http"
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

  it("keeps proxy.ts on the shared https-redirect helper", async () => {
    const proxy = await readFile("proxy.ts", "utf8");
    assert.match(proxy, /shouldRedirectToHttps/);
    assert.match(proxy, /x-forwarded-proto/);
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
