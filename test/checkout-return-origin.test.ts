import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { checkoutReturnOrigin, newPlanCheckoutReturnUrl, planCheckoutReturnUrl } from "../lib/checkout-return-origin.ts";

const apex = "https://mattanutra.com";
const www = "https://www.mattanutra.com";
function request(origin?: string, url = "http://internal-app:8080/api/checkout") {
  return new Request(url, { headers: origin ? { origin } : {} });
}
function environment(value: string, run: () => void) {
  const previous = process.env.MATTANUTRA_ENV;
  process.env.MATTANUTRA_ENV = value;
  try { run(); } finally {
    if (previous === undefined) delete process.env.MATTANUTRA_ENV;
    else process.env.MATTANUTRA_ENV = previous;
  }
}

describe("checkout return origin", () => {
  it("preserves both production hosts so Stripe redirects retain their host-only cookies", () => {
    environment("prd", () => {
      for (const configured of [apex, www]) for (const origin of [apex, www]) {
        assert.equal(checkoutReturnOrigin(request(origin), configured), origin);
      }
    });
  });

  it("uses only the configured origin in development and UAT", () => {
    for (const env of ["dev", "uat"]) environment(env, () => {
      const configured = `https://${env}.mattanutra.com`;
      assert.equal(checkoutReturnOrigin(request(configured), configured), configured);
      for (const origin of [apex, www, "https://dev.mattanutra.com", "https://uat.mattanutra.com"]) {
        if (origin !== configured) assert.equal(checkoutReturnOrigin(request(origin), configured), configured);
      }
      // An inconsistent environment must not expand the configured allowlist.
      assert.equal(checkoutReturnOrigin(request(www), apex), apex);
    });
  });

  it("does not turn an attacker-controlled origin or proxy host into a return destination", () => {
    environment("prd", () => {
      for (const origin of ["https://attacker.example", "https://mattanutra.com.attacker.example", "https://uat.mattanutra.com",
        "https://dev.mattanutra.com", "http://www.mattanutra.com", "https://www.mattanutra.com:8443", "null",
        "https://attacker@www.mattanutra.com", "https://www.mattanutra.com/path"]) {
        assert.equal(checkoutReturnOrigin(request(origin), apex), apex, origin);
      }
      const hostileProxy = new Request("http://internal-app:8080/api/checkout", {
        headers: { host: "attacker.example", "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" }
      });
      assert.equal(checkoutReturnOrigin(hostileProxy, apex), apex);
    });
  });

  it("falls back to an allowlisted request URL or the configured site for server calls", () => {
    environment("prd", () => {
      assert.equal(checkoutReturnOrigin(request(undefined, `${www}/api/checkout`), apex), www);
      assert.equal(checkoutReturnOrigin(request(undefined, "https://untrusted.example/api/checkout"), apex), apex);
      assert.equal(checkoutReturnOrigin(undefined, `${apex}/`), apex);
    });
    environment("dev", () => {
      assert.equal(checkoutReturnOrigin(request("http://localhost:3000"), "http://localhost:3000"), "http://localhost:3000");
    });
  });

  it("keeps a new plan's original return URL when the retry changes host, locale or configuration", () => {
    environment("prd", () => {
      const previous = process.env.NEXT_PUBLIC_SITE_URL;
      process.env.NEXT_PUBLIC_SITE_URL = apex;
      try {
        const persisted = newPlanCheckoutReturnUrl("th", request(www));
        assert.equal(persisted, `${www}/th/nutrition/payment/return?session_id={CHECKOUT_SESSION_ID}`);
        assert.equal(planCheckoutReturnUrl("th", persisted, apex), persisted);
        assert.equal(planCheckoutReturnUrl("en", persisted, "https://changed-config.example"), persisted);
      } finally {
        if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
        else process.env.NEXT_PUBLIC_SITE_URL = previous;
      }
    });
  });

  it("preserves the historical configured URL for legacy plan attempts with a lost provider response", () => {
    for (const missing of [undefined, null, ""]) {
      assert.equal(planCheckoutReturnUrl("en", missing, apex),
        `${apex}/en/nutrition/payment/return?session_id={CHECKOUT_SESSION_ID}`);
    }
  });

  it("freezes new plan URLs before creating Stripe sessions and keeps product request origin", () => {
    const plan = readFileSync(new URL("../lib/stripe-payments.ts", import.meta.url), "utf8");
    const retail = readFileSync(new URL("../lib/retail-product-checkout.ts", import.meta.url), "utf8");
    assert.match(plan, /stripeCheckoutReturnUrl: newPlanCheckoutReturnUrl\(input\.locale, input\.request\)/);
    assert.match(plan, /return_url: planCheckoutReturnUrl\(input\.locale, payment\.metadata\?\.stripeCheckoutReturnUrl\)/);
    assert.match(retail, /return_url: `\$\{checkoutReturnOrigin\(input\.request\)\}[^`]+\{CHECKOUT_SESSION_ID\}/);
  });
});
