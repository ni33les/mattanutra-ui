import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getRequestClientIp,
  isTrustedProxyClientIpEnabled,
  normalizeClientIpCandidate
} from "../lib/request-client-ip.ts";

function requestWithHeaders(headers: Record<string, string>) {
  return new Request("https://www.mattanutra.com/api/assessment", {
    headers,
    method: "POST"
  });
}

describe("request client ip", () => {
  it("validates IPv4/IPv6 and rejects garbage", () => {
    assert.equal(normalizeClientIpCandidate("203.0.113.9"), "203.0.113.9");
    assert.equal(normalizeClientIpCandidate(" 203.0.113.9 "), "203.0.113.9");
    assert.equal(normalizeClientIpCandidate("203.0.113.9:443"), "203.0.113.9");
    assert.equal(normalizeClientIpCandidate("not-an-ip"), null);
    assert.equal(normalizeClientIpCandidate("999.0.0.1"), null);
    assert.equal(normalizeClientIpCandidate("a".repeat(80)), null);
    assert.equal(
      normalizeClientIpCandidate("2001:db8::1"),
      "2001:db8::1"
    );
  });

  it("does not trust forwarded headers without proxy trust", () => {
    assert.equal(
      isTrustedProxyClientIpEnabled({ NODE_ENV: "test" }),
      false
    );
    assert.equal(
      getRequestClientIp(
        requestWithHeaders({ "x-forwarded-for": "203.0.113.9" }),
        { NODE_ENV: "test" }
      ),
      null
    );
  });

  it("trusts production and TRUST_PROXY / explicit header override", () => {
    assert.equal(
      isTrustedProxyClientIpEnabled({ NODE_ENV: "production" }),
      true
    );
    assert.equal(
      isTrustedProxyClientIpEnabled({ NODE_ENV: "test", TRUST_PROXY: "1" }),
      true
    );
    assert.equal(
      isTrustedProxyClientIpEnabled({
        NODE_ENV: "test",
        TRUSTED_CLIENT_IP_HEADER: "cf-connecting-ip"
      }),
      true
    );

    assert.equal(
      getRequestClientIp(
        requestWithHeaders({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
        { NODE_ENV: "production" }
      ),
      "203.0.113.9"
    );

    assert.equal(
      getRequestClientIp(
        requestWithHeaders({ "cf-connecting-ip": "198.51.100.4" }),
        {
          NODE_ENV: "test",
          TRUSTED_CLIENT_IP_HEADER: "cf-connecting-ip"
        }
      ),
      "198.51.100.4"
    );
  });

  it("prefers edge-normalized headers over x-forwarded-for", () => {
    assert.equal(
      getRequestClientIp(
        requestWithHeaders({
          "cf-connecting-ip": "198.51.100.7",
          "x-forwarded-for": "203.0.113.9"
        }),
        { NODE_ENV: "production" }
      ),
      "198.51.100.7"
    );
  });

  it("skips invalid hops instead of accepting garbage cardinality", () => {
    assert.equal(
      getRequestClientIp(
        requestWithHeaders({
          "x-forwarded-for": "not-an-ip, 203.0.113.50"
        }),
        { NODE_ENV: "production" }
      ),
      "203.0.113.50"
    );

    assert.equal(
      getRequestClientIp(
        requestWithHeaders({ "x-forwarded-for": "totally-fake" }),
        { NODE_ENV: "production" }
      ),
      null
    );
  });
});
