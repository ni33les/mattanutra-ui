import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const V14_DIR = join(root, "content/questionnaire/v14");
const V14_HTML = join(
  V14_DIR,
  "V14_Questionnaire_v3_EN_TH_Final_v1.html"
);
const V14_SHA = join(
  V14_DIR,
  "V14_Questionnaire_v3_EN_TH_Final_v1.html.sha256"
);

describe("questionnaire v14 HTML as reference-only asset", () => {
  it("keeps the approved HTML with matching sha256 (not served)", () => {
    assert.equal(existsSync(V14_HTML), true);
    assert.equal(existsSync(V14_SHA), true);
    const expected = readFileSync(V14_SHA, "utf8").trim().split(/\s+/)[0];
    assert.equal(expected.length, 64);
    const actual = createHash("sha256")
      .update(readFileSync(V14_HTML))
      .digest("hex");
    assert.equal(actual, expected);
  });

  it("documents reference-only role (no HTML document serve path)", () => {
    const readme = readFileSync(join(V14_DIR, "README.md"), "utf8");
    assert.match(readme, /reference/i);
    assert.match(readme, /not served/i);
    assert.match(readme, /ChatQuestionnaire|React/i);

    assert.equal(
      existsSync(join(root, "app/api/questionnaire/v14")),
      false,
      "v14 document/submit/track API routes must not exist"
    );
    assert.equal(
      existsSync(join(root, "lib/questionnaire/v14")),
      false,
      "v14 serve/adapter lib must not exist"
    );

    const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");
    assert.doesNotMatch(
      nextConfig,
      /\/api\/questionnaire\/v14\/document/
    );
    assert.doesNotMatch(
      nextConfig,
      /source:\s*"\/:locale\(en\|th\)\/nutrition\/quiz"/
    );
  });

  it("quiz page renders React ChatQuestionnaire for EN/TH", () => {
    const page = readFileSync(
      join(root, "app/[locale]/nutrition/quiz/page.tsx"),
      "utf8"
    );
    assert.match(page, /ChatQuestionnaire/);
    assert.doesNotMatch(page, /v14HtmlEnabled|QUESTIONNAIRE_V14_HTML/);
    assert.doesNotMatch(page, /buildV14HtmlDocument|v14\/document/);
  });

  it("keeps approved pack contracts inside the reference HTML", () => {
    const html = readFileSync(V14_HTML, "utf8");
    assert.match(
      html,
      /const MN_CONFIG = \{ endpoint: '', trackEndpoint: '', version: 'v6-conversational' \};/
    );
    assert.match(html, /MattaNutraProductionReadiness/);
    assert.match(html, /MattaNutraHealthScoreReady/);
    assert.match(html, /healthScoreUrl/);
    assert.match(html, /mn_state_v5/);
  });
});
