import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS } from "../lib/health-score/v4-copy.ts";

const handoffRoot = new URL("../files/healthscore-handoff/", import.meta.url);

function read(rel: string) {
  return readFileSync(new URL(rel, handoffRoot), "utf8");
}

describe("healthscore handoff fixtures", () => {
  it("keeps FINAL handoff docs and reference profiles", () => {
    for (const rel of [
      "README.txt",
      "GAP_MATRIX.json",
      "FINAL/00_HANDOFF.md",
      "FINAL/03_ENGINE_CONTRACT.md",
      "FINAL/05_TEMPLATE.html",
      "FINAL/07_PERSONALIZATION_LAYER.md",
      "FINAL/Profile1_Marcus_v7.html",
      "FINAL/Profile2_Priya_v7.html",
      "FINAL/healthscore.css",
      "CONTENT_LAYER/healthscore_library.py",
      "CONTENT_LAYER/example_profile1_content.json"
    ]) {
      assert.ok(existsSync(new URL(rel, handoffRoot)), rel);
    }
  });

  it("aligns platform forbidden substrings with the content library", () => {
    const lib = read("CONTENT_LAYER/healthscore_library.py");
    for (const term of HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS) {
      assert.match(lib, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  });

  it("documents catalog coverage for en/th/zh-CN", () => {
    const matrix = JSON.parse(read("GAP_MATRIX.json")) as {
      catalog: {
        en: number;
        th: number;
        "zh-CN": number;
        th_missing_vs_en: string[];
        zh_missing_vs_en: string[];
      };
    };
    assert.equal(matrix.catalog.en, matrix.catalog.th);
    assert.equal(matrix.catalog.en, matrix.catalog["zh-CN"]);
    assert.deepEqual(matrix.catalog.th_missing_vs_en, []);
    assert.deepEqual(matrix.catalog.zh_missing_vs_en, []);
    assert.ok(matrix.catalog.en >= 150);
  });

  it("keeps AI validator Stage 6 HTML and numeric rules", () => {
    const validator = readFileSync(
      new URL("../lib/health-score/ai-response-validator.ts", import.meta.url),
      "utf8"
    );
    assert.match(validator, /onlyAllowedHtml|may only include <em>/);
    assert.match(
      validator,
      /validatePageCopyAgainstSeeds|validatePolishedFieldAgainstSeed|integer literal/
    );
    assert.match(validator, /0\.5x–1\.5x|0\.5x-1\.5x|outside 0\.5x/);
    assert.match(validator, /HEALTHSCORE_COPY_FORBIDDEN_SUBSTRINGS/);
  });

  it("locks UI gotcha selectors from the FINAL handoff", () => {
    const panel = readFileSync(
      new URL("../components/nutrition-flow/healthscore-panel.tsx", import.meta.url),
      "utf8"
    );
    const css = readFileSync(
      new URL("../app/customer.css", import.meta.url),
      "utf8"
    );
    const gotchas = read("FINAL/06_GOTCHAS.md");

    assert.match(gotchas, /spectrum marker DOM order/i);
    assert.match(panel, /Handoff 06_GOTCHAS §3/);
    assert.match(panel, /setTimeout\(\(\) => setVisible\(true\), 1800\)/);
    assert.match(css, /\.mn-healthscore-v7 section\.wrap/);
    assert.match(css, /@media \(max-width: 740px\)[\s\S]*section\.wrap[\s\S]*96px 18px/);
    assert.match(css, /stroke-width: 1\.6/);
  });

  it("matches EN finding headlines to the handoff content library", () => {
    const catalog = JSON.parse(
      readFileSync(
        new URL("../content/i18n/source/en.json", import.meta.url),
        "utf8"
      )
    ) as Record<string, { defaultMessage?: string } | string>;
    // Load FINDINGS via a small Python one-liner for exact string compare.
    const libPath = fileURLToPath(
      new URL("CONTENT_LAYER/healthscore_library.py", handoffRoot)
    );
    const raw = execFileSync(
      "python3",
      [
        "-c",
        `import json,runpy; ns=runpy.run_path(${JSON.stringify(libPath)}); print(json.dumps({k:v["headline"] for k,v in ns["FINDINGS"].items()}))`
      ],
      { encoding: "utf8" }
    );
    const findings = JSON.parse(raw) as Record<string, string>;

    for (const [code, headline] of Object.entries(findings)) {
      const key = `customer.healthScore.findings.${code}.headline`;
      const entry = catalog[key];
      const catalogHeadline =
        typeof entry === "string" ? entry : entry?.defaultMessage ?? "";
      assert.equal(catalogHeadline, headline, key);
    }
  });
});
