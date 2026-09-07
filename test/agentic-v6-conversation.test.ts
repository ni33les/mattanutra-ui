import { infoConversationBudget } from "./helpers/info-conversation-budget.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assessPreferences } from "../lib/matcher/preferences.ts";
import { clientDiscovery, readContractResource } from "../lib/agentic/contract/guide.ts";
import { AGENTIC_INPUT_SCHEMAS, REQUIREMENTS_SCHEMA } from "../lib/agentic/contract/schemas.ts";
import { validateToolIssues } from "../lib/agentic/contract/validate.ts";
import { AGENTIC_OUTPUT_SCHEMAS } from "../lib/agentic/contract/outputs.ts";
import { infoTool } from "../lib/agentic/info.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";

describe("v6 conversational discovery and advisory preferences", () => {
  it("ANNA-AX-01: existing locale-only discovery explains basis and provides five executable operation templates", () => {
    const value = clientDiscovery("en");
    assert.match(value.clientInstructions, /total_daily/);
    assert.match(value.clientInstructions, /supplemental/);
    assert.match(value.clientInstructions, /advisory/i);
    assert.match(value.clientInstructions, /20%/);
    assert.ok(value.clientExamples.some(example => example.arguments.request?.targets?.some(target => target.basis === "supplemental")));
    for (const operation of ["create", "get", "revise", "answer", "select"]) assert.ok(value.clientExamples.some(example => example.arguments.operation === operation));
    for (const example of value.clientExamples) assert.deepEqual(validateToolIssues(AGENTIC_INPUT_SCHEMAS[example.tool], example.arguments), [], example.name);
  });
  it("ANNA-AX-02: historical v5 guide and schema remain byte-identical to the released artefacts", () => {
    for (const [suffix, file] of [["client-guide", "README.md"], ["schema", "schema.json"]]) {
      const resource = readContractResource(`mattanutra://contract/5.0.0/${suffix}`);
      assert.ok(resource);
      const released = readFileSync(new URL(`../contract/mcp/5.0.0/${file}`, import.meta.url), "utf8");
      assert.equal(resource.contents[0].text, file === "schema.json" ? released.replace(/\n$/, "") : released);
    }
  });
  it("ANNA-AX-03: all retained numeric preference names publish advisory semantics and zero/null remain valid", () => {
    for (const name of ["maxProductCount", "maxDailyPills", "maxPriceMinor"]) {
      assert.match(JSON.stringify(REQUIREMENTS_SCHEMA.properties[name as keyof typeof REQUIREMENTS_SCHEMA.properties]), /advisory/i);
      for (const value of [0, null, 1]) assert.deepEqual(validateToolIssues(REQUIREMENTS_SCHEMA, { [name]: value }), []);
    }
  });
  it("ANNA-AX-04: deviations above 20 percent are prominent without rounded boundary errors", () => {
    for (const [actual, expected] of [[119.999999, false], [120, false], [120.000001, true], [150, true]] as const) {
      const rows = assessPreferences({ maxDailyPills: 100 }, { productCount: 1, dailyPills: actual, firstOrderGoodsPriceMinor: 500, currency: "THB" });
      const row = rows.find(item => item.kind === "daily_pills")!;
      assert.equal(row.prominent, expected);
      assert.equal(row.preferred, 100); assert.equal(row.actual, actual);
      assert.equal(row.status, "above_preference");
    }
  });
  it("ANNA-AX-05: zero, missing metadata and cleared preferences never fabricate numbers or divide by zero", () => {
    const rows = assessPreferences({ maxDailyPills: 0, maxProductCount: null, maxPriceMinor: 0 }, { productCount: 8, dailyPills: null, firstOrderGoodsPriceMinor: 100, currency: "THB" });
    const pills = rows.find(item => item.kind === "daily_pills")!;
    assert.equal(pills.status, "unknown"); assert.equal(pills.complete, false); assert.equal(pills.actual, null); assert.equal(pills.percent, null); assert.equal(pills.delta, null);
    const price = rows.find(item => item.kind === "first_order_goods_price")!;
    assert.equal(price.prominent, true); assert.equal(price.percent, null); assert.equal(price.delta, 100);
    assert.equal(rows.find(item => item.kind === "product_count")!.status, "not_requested");
    for (const locale of ["en", "th", "zh-CN"]) assert.ok(assessPreferences({ maxDailyPills: 2 }, { productCount: 1, dailyPills: 3, firstOrderGoodsPriceMinor: 100, currency: "THB" }, locale)[1]!.message.length > 20);
  });
  it("ANNA-AX-08: tools-only info returns conforming localized instructions and an optional exact operation schema", async () => {
    const isolatedInfo = { conditionCodes: [], medicationCodes: [], supportedCountries: [{ countryCode: "TH", countryName: "Thailand", currency: "THB" }] };
    const config = loadAgenticConfig();
    const messages = [];
    for (const locale of ["en", "th", "zh-CN"]) {
      const overview = await infoTool({ config, locale, isolatedInfo });
      assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.info, overview), []);
      assert.ok(overview.clientExamples.some(example => example.name === "create-supplemental-target"));
      assert.equal(overview.planSchemaJson, undefined);
      assert.equal(overview.clientGuideText, undefined);
      assert.equal(infoConversationBudget(overview).passed, true, JSON.stringify(infoConversationBudget(overview)));
      messages.push(overview.clientInstructions);
      const detail = await infoTool({ config, locale, isolatedInfo, view: "plan_schema", planOperation: "select" });
      assert.deepEqual(validateToolIssues(AGENTIC_OUTPUT_SCHEMAS.info, detail), []);
      assert.equal(JSON.parse(detail.planSchemaJson!).properties.operation.const, "select");
    }
    assert.equal(new Set(messages).size, 3);
  });
});
