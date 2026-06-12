import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelSource = readFileSync(
  new URL("../components/nutrition-flow/healthscore-panel.tsx", import.meta.url),
  "utf8"
);
const copySource = readFileSync(
  new URL("../components/nutrition-flow/healthscore-panel-copy.ts", import.meta.url),
  "utf8"
);

describe("HealthScore panel static guardrails", () => {
  it("renders locked score, pillar, and HealthScore subtraction preview values from deterministic content", () => {
    assert.match(panelSource, /page\?\.locked\.score\s*\?\?\s*result\.score/);
    assert.match(panelSource, /normalizedPillars\(result\)/);
    assert.match(panelSource, /page\?\.locked\.subtraction/);
    assert.match(panelSource, /seed\?\.labelChosen/);
    assert.match(panelSource, /subtraction\.chosen/);
  });

  it("keeps V3 pricing labels and Thai static fallbacks in the panel", () => {
    assert.match(copySource, /Right Amount Formula/);
    assert.match(copySource, /Living Protocol/);
    assert.match(copySource, /คะแนนสุขภาพของคุณคือ/);
    assert.match(copySource, /ตัวอย่างแผนถูกคัดกรองอย่างไร/);
  });

  it("does not label HealthScore subtraction as a final selected formula count", () => {
    assert.match(copySource, /shortlisted/);
    assert.doesNotMatch(copySource, /right for your score/);
    assert.doesNotMatch(copySource, /เหมาะกับคะแนนของคุณ/);
    assert.doesNotMatch(copySource, /适合您的分数/);
  });

  it("guards legacy localized copy from leaking into the wrong locale", () => {
    assert.match(panelSource, /textFitsLocale/);
    assert.match(panelSource, /localizedLegacyText/);
  });
});
