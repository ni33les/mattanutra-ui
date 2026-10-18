import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> };

function configuredHeaders(environment: "development" | "production"): HeaderRule[] {
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
    import loadConfig from "next/dist/server/config.js";
    const config = await loadConfig.default("phase-production-server", process.cwd());
    process.stdout.write(JSON.stringify(await config.headers()));
  `], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, NODE_ENV: environment },
    encoding: "utf8"
  }));
}

function directive(policy: string, name: string) {
  return policy.split(";").map(value => value.trim().split(/\s+/)).find(parts => parts[0] === name)?.slice(1) ?? [];
}

describe("Meta transport CSP", () => {
  for (const environment of ["development", "production"] as const) {
    it(`allows native Pixel and the setup tool without an additional gateway in ${environment}`, () => {
      const policies = configuredHeaders(environment).flatMap(rule => rule.headers
        .filter(header => header.key === "Content-Security-Policy")
        .map(header => ({ source: rule.source, policy: header.value })));
      const customerPolicies = policies.filter(({ source }) => source.startsWith("/:locale") && !source.includes(":internal"));
      assert.equal(customerPolicies.length, 2, "Both the locale root and nested customer pages need the policy");
      const permittedConnections = new Set([
        "'self'", "https://connect.facebook.net", "https://www.facebook.com",
        ...(environment === "production"
          ? ["https://api.stripe.com", "https://checkout.stripe.com", "https://r.stripe.com"]
          : ["ws:", "wss:", "http://localhost:*", "http://127.0.0.1:*"])
      ]);
      for (const { policy } of customerPolicies) {
        const connections = directive(policy, "connect-src");
        assert.ok(connections.includes("'self'"), "Application event capture stays available");
        assert.ok(connections.includes("https://www.facebook.com"), "Native Pixel stays available");
        assert.ok(connections.every(source => permittedConnections.has(source)), "Only direct native tracking may leave the browser");
        const scripts = directive(policy, "script-src");
        assert.ok(scripts.includes("https://connect.facebook.net"));
        assert.ok(scripts.includes("https://www.facebook.com/signals/iwl.js"));
        assert.ok(directive(policy, "img-src").includes("https://www.facebook.com"));
      }
      for (const { policy } of policies.filter(({ source }) => source === "/(.*)" || source.includes(":internal"))) {
        assert.ok(!policy.includes("facebook.com") && !policy.includes("facebook.net"), "Internal pages retain their restrictive policy");
      }
    });
  }
});
