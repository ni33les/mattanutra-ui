#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MCP_URL = process.env.MCP_URL ?? "https://dev.mattanutra.com/api/mcp";
const results = [];

function record(id, pass, detail, score) {
  results.push({ detail, id, pass: Boolean(pass), score });
}

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

const limits = read("lib/agentic/plan/limits.ts");
const safety = read("lib/matcher/safety.ts");
const ceilings = `${read("lib/matcher/safety-ceilings.ts")}\n${read("lib/agentic/catalogue/load-safety-ceilings.ts")}`;
record(
  "T02",
  /supplement_safety_limits/.test(ceilings) &&
    !/return 40/.test(limits) &&
    !/amount:\s*40/.test(safety) &&
    /action: "block"/.test(safety) &&
    /matcherSafetyCeilings/.test(read("lib/agentic/plan/matching.ts")) &&
    /matcherSafetyCeilings/.test(read("lib/matcher/adapters/web.ts")),
  "Admin supplement_safety_limits feed shared matcher; no hardcoded 40",
  10
);

const v4 = read("lib/health-score/v4.ts");
record(
  "T03",
  /function gapOrStrengthCard/.test(v4) &&
    /pillar\.value >= 70/.test(v4) &&
    /sedentary: "sitting"/.test(v4) &&
    /"trains daily": "active"/.test(v4),
  "Pillar gap copy only for weak pillars; answer aliases map into scoring",
  10
);

const checkoutPage = read("app/[locale]/basket/checkout/page.tsx");
const orderSummary = read("components/retail-checkout/order-summary.tsx");
record(
  "T04",
  /unit_price_amount/.test(checkoutPage) &&
    /product_recommendation_items\.price_amount/.test(checkoutPage) &&
    /unitPriceAmount/.test(orderSummary) &&
    /formatCurrencyAmount\(locale, unitPrice/.test(orderSummary),
  "Basket/checkout unit prices come from recommendation/retail records",
  10
);

const summary = read("lib/formulation-summary.ts");
const reveal = read("components/reveal-final-results.tsx");
const firstName = read("lib/assessment-first-name.ts");
record(
  "T05",
  /firstNameFromAssessmentAnswers/.test(summary) &&
    /result\.firstName/.test(reveal) &&
    /"panya"/.test(firstName) &&
    /"demo"/.test(firstName),
  "Reveal profile uses assessment firstName; fixture brand names blocked",
  10
);

const rg = spawnSync(
  "rg",
  ["-i", "panya", "--glob", "!files/**", "--glob", "!node_modules/**", "--glob", "!.git/**", "--glob", "!.next/**"],
  { cwd: ROOT, encoding: "utf8" }
);
const panyaHits = (rg.stdout || "")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
const allow = [
  "/lib/panya",
  "/lib/panya.ts",
  "/lib/panya-chat-agent.ts",
  "/lib/admin-panya.ts",
  "/app/api/admin/panya/",
  "/components/admin/panya-view.tsx",
  "/scripts/apply-panya-schema.ts",
  "view: \"panya\"",
  'view !== "panya"',
  "panyaSection",
  "panyaNavigation",
  "panyaTitle",
  "panyaData",
  "panya.read",
  "panya.write",
  "panya_escalation",
  "public.panya",
  "from public.panya",
  "customer.revealFinalCopy.panya",
  "outbound.panya.",
  "AdminPanya",
  "PanyaConfig",
  "PanyaView",
  "PanyaSection",
  "test/panya-",
  "panya-welcome",
  "panya-customer-agent",
  "panya-line-cta",
  "panya-chat-agent"
];
function allowed(line) {
  const lower = line.toLowerCase();
  if (!/panya/.test(lower)) {
    return true;
  }
  if (/nong mata/.test(lower) && !/[A-Za-z]panya|panya[A-Za-z]/.test(line.split(":")[0] ?? "")) {
    return allow.some((item) => lower.includes(item.toLowerCase())) || !/\bpanya\b/i.test(line.split(".ts")[0] ?? line);
  }
  return allow.some((item) => lower.includes(item.toLowerCase()));
}
const leftover = panyaHits.filter((line) => {
  const body = line.split(":", 3).slice(2).join(":") || line;
  if (/Nong Mata/.test(body) && !/\bPanya\b/.test(body) && !/\bPANYA\b/.test(body)) {
    return !allow.some((item) => line.toLowerCase().includes(item.toLowerCase()));
  }
  return /\bPanya\b|\bPANYA\b/.test(body);
});
record(
  "T06",
  leftover.length === 0,
  leftover.length === 0
    ? "No user-facing Panya leftover; identifiers/API paths allow-listed"
    : leftover.slice(0, 8).join(" | "),
  leftover.length === 0 ? 10 : Math.max(0, 10 - leftover.length)
);

const helpers = read("components/formulation-support-helpers.ts");
record(
  "T07",
  /localeText/.test(helpers) &&
    /if \(english\)/.test(helpers) &&
    /product_translation_locale/.test(checkoutPage) &&
    /product_translation_locale/.test(read("lib/agentic/commerce/checkout-products.ts")) &&
    !/fallback\?\.\[locale\] \?\? fallback\?\.en \?\? localized/.test(helpers),
  "Catalog locale name, English fallback, no invented name map on display",
  10
);

const passed = results.filter((item) => item.pass).length;
console.log(`Official MattaNutra Phase 1 Pack, ${passed}/${results.length}`);
for (const item of results) {
  console.log(`${item.id} ${item.pass ? "10/10" : `${item.score}/10`} ${item.pass ? "PASS" : "FAIL"} ${item.detail}`);
}

if (MCP_URL) {
  try {
    const response = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "info", arguments: {} }
      })
    });
    const text = await response.text();
    const raw = text.includes("data:")
      ? text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .at(-1)
          ?.slice(5)
      : text;
    const body = JSON.parse(raw ?? "{}");
    const sc = body.result?.structuredContent ?? body.result ?? {};
    console.log(
      `info.buildId ${sc.buildId ?? "missing"} checkoutBuild ${sc.checkoutBuild ?? "missing"} match ${sc.buildId === sc.checkoutBuild}`
    );
  } catch (error) {
    console.log(`info probe skipped: ${error instanceof Error ? error.message : error}`);
  }
}

process.exit(passed === results.length ? 0 : 1);
