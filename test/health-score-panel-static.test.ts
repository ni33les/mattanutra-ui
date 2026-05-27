import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelSource = readFileSync(
  new URL("../components/nutrition-flow/healthscore-panel.tsx", import.meta.url),
  "utf8"
);

describe("HealthScore panel static guardrails", () => {
  it("renders locked score, pillar, and subtraction values from deterministic content", () => {
    assert.match(panelSource, /page\?\.locked\.score\s*\?\?\s*result\.score/);
    assert.match(panelSource, /normalizedPillars\(result\)/);
    assert.match(panelSource, /page\?\.locked\.subtraction/);
  });

  it("keeps V3 pricing labels and Thai static fallbacks in the panel", () => {
    assert.match(panelSource, /Right Amount Formula/);
    assert.match(panelSource, /Living Protocol/);
    assert.match(panelSource, /คะแนนสุขภาพของคุณคือ/);
    assert.match(panelSource, /สูตรของคุณถูกสร้างอย่างไร/);
  });

  it("guards legacy localized copy from leaking into the wrong locale", () => {
    assert.match(panelSource, /textFitsLocale/);
    assert.match(panelSource, /localizedLegacyText/);
  });
});
