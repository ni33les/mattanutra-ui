import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildV14HtmlDocument,
  expectedV14HtmlSha256FromFile,
  readV14HtmlSource,
  v14HtmlSha256,
  V14_HTML_RELATIVE_PATH,
  V14_LOGO_SRC
} from "../lib/questionnaire/v14/serve.ts";

const root = process.cwd();

describe("questionnaire v14 immutable HTML", () => {
  it("vendors the approved HTML with a matching sha256 checksum", () => {
    const path = join(root, V14_HTML_RELATIVE_PATH);
    assert.equal(existsSync(path), true);
    const expected = expectedV14HtmlSha256FromFile();
    assert.ok(expected.length === 64, "checksum file should contain sha256");
    assert.equal(v14HtmlSha256(), expected);
    assert.equal(
      createHash("sha256").update(readFileSync(path)).digest("hex"),
      expected
    );
  });

  it("keeps MN_CONFIG, readiness helper, and HealthScore-ready contract", () => {
    const html = readV14HtmlSource();
    assert.match(
      html,
      /const MN_CONFIG = \{ endpoint: '', trackEndpoint: '', version: 'v6-conversational' \};/
    );
    assert.match(html, /MattaNutraProductionReadiness/);
    assert.match(html, /MattaNutraHealthScoreReady/);
    assert.match(html, /healthScoreUrl/);
    assert.match(html, /healthscoreUrl/);
    assert.match(html, /resultUrl/);
    assert.match(html, /mn:healthscore-email-request/);
    assert.match(html, /mn_state_v5/);
    assert.match(html, /\/en\/privacy/);
    assert.match(html, /\/th\/privacy/);
    assert.match(html, /MN_LOGO=/);
  });

  it("injects only endpoints at serve time (source stays unconfigured)", () => {
    const served = buildV14HtmlDocument({
      locale: "en",
      origin: "https://uat.mattanutra.com"
    });
    assert.match(
      served,
      /endpoint: 'https:\/\/uat\.mattanutra\.com\/api\/questionnaire\/v14\/submit'/
    );
    assert.match(
      served,
      /trackEndpoint: 'https:\/\/uat\.mattanutra\.com\/api\/questionnaire\/v14\/track'/
    );
    // Source file remains unconfigured
    const source = readV14HtmlSource();
    assert.match(
      source,
      /const MN_CONFIG = \{ endpoint: '', trackEndpoint: '', version: 'v6-conversational' \};/
    );
    assert.doesNotMatch(
      source,
      /endpoint: 'https:\/\/uat\.mattanutra\.com/
    );
  });

  it("wires document + submit + track API routes", () => {
    const documentRoute = readFileSync(
      join(root, "app/api/questionnaire/v14/document/route.ts"),
      "utf8"
    );
    const submitRoute = readFileSync(
      join(root, "app/api/questionnaire/v14/submit/route.ts"),
      "utf8"
    );
    const trackRoute = readFileSync(
      join(root, "app/api/questionnaire/v14/track/route.ts"),
      "utf8"
    );
    const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");

    assert.match(documentRoute, /buildV14HtmlDocument/);
    assert.match(submitRoute, /submitV14Questionnaire/);
    assert.match(trackRoute, /trackV14Event/);
    assert.match(
      nextConfig,
      /source: "\/:locale\(en\|th\)\/nutrition\/quiz"/
    );
    assert.match(
      nextConfig,
      /destination: "\/api\/questionnaire\/v14\/document\?locale=:locale"/
    );
  });

  it("adapter returns healthScoreUrl and persists answers as-is", () => {
    const adapter = readFileSync(
      join(root, "lib/questionnaire/v14/adapter.ts"),
      "utf8"
    );
    assert.match(adapter, /healthScoreUrl/);
    assert.match(adapter, /persistAssessmentSubmission/);
    assert.match(adapter, /computeHealthScore\(answers/);
    assert.match(adapter, /payload\.answers/);
  });
});
