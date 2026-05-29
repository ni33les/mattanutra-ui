import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestOriginAllowed } from "../lib/admin-session-cookie.ts";

describe("admin session origin checks", () => {
  it("allows browser posts through the production reverse proxy origin", () => {
    const request = new Request("http://127.0.0.1:3000/api/admin/access", {
      headers: {
        origin: "https://dev.mattanutra.com",
        "x-forwarded-host": "dev.mattanutra.com",
        "x-forwarded-proto": "https"
      },
      method: "POST"
    });

    assert.equal(requestOriginAllowed(request), true);
  });

  it("allows the configured public site origin for admin browser posts", () => {
    const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

    process.env.NEXT_PUBLIC_SITE_URL = "https://dev.mattanutra.com";

    try {
      const request = new Request("http://127.0.0.1:3000/api/admin/access", {
        headers: {
          origin: "https://dev.mattanutra.com"
        },
        method: "POST"
      });

      assert.equal(requestOriginAllowed(request), true);
    } finally {
      if (originalSiteUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SITE_URL;
      } else {
        process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
      }
    }
  });

  it("rejects unrelated origins for admin browser posts", () => {
    const request = new Request("http://127.0.0.1:3000/api/admin/access", {
      headers: {
        origin: "https://example.com",
        "x-forwarded-host": "dev.mattanutra.com",
        "x-forwarded-proto": "https"
      },
      method: "POST"
    });

    assert.equal(requestOriginAllowed(request), false);
  });
});
