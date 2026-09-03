import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  canonicalScoreRows,
  scoreMkt09,
  scoreTech07,
  scoreTrust06,
  scoreV3Assertions,
  scoreVal01
} from "../lib/agentic/qa/v3-scorer.ts";
import { CONNECTOR_COPY } from "../lib/agentic/discovery/content.ts";

const passGolden = JSON.parse(
  readFileSync(new URL("./agentic/det-v3/score-goldens/pass.json", import.meta.url), "utf8")
) as {
  contribution: Record<string, number>;
  description: string;
  latency: unknown;
  responsibility: unknown;
};
const failGolden = JSON.parse(
  readFileSync(new URL("./agentic/det-v3/score-goldens/fail.json", import.meta.url), "utf8")
) as typeof passGolden;

function staleRunnerScore(input: typeof passGolden) {
  return {
    "MKT-09": (input.contribution.paymentMinor ?? 0) - (input.contribution.productCostMinor ?? 0) === 4000,
    "TECH-07": typeof (input.latency as { p95?: unknown }).p95 === "number",
    "TRUST-06": /\bresponsibility-3\.0\.0\b/.test(input.description),
    "VAL-01": /\bsafety\b/i.test(input.description)
  };
}

describe("Slice 0 v3.0 scorer conformance", () => {
  it("SCORE-VAL01-RED stale runner rejects the valid connector PASS golden", () => {
    const stale = staleRunnerScore(passGolden);
    assert.equal(stale["VAL-01"], false, "stale runner required the literal word safety");
    assert.equal(scoreVal01({ description: passGolden.description }).passed, true);
    assert.equal(scoreVal01({ description: failGolden.description }).passed, false);
    assert.equal(scoreVal01({ description: CONNECTOR_COPY.en }).passed, true);
  });

  it("SCORE-TECH07-RED stale runner misses tech07.live and plan_p95", () => {
    const stale = staleRunnerScore(passGolden);
    assert.equal(stale["TECH-07"], false, "stale runner read a missing p95 field");
    assert.equal(scoreTech07(passGolden.latency).passed, true);
    assert.equal(scoreTech07(failGolden.latency).passed, false);
  });

  it("SCORE-MKT09-RED stale runner omits acquisition and fees", () => {
    const stale = staleRunnerScore(passGolden);
    assert.equal(stale["MKT-09"], false, "stale runner used 39800-34800 without acquisition");
    assert.equal(scoreMkt09(passGolden.contribution).passed, true);
    assert.equal(scoreMkt09(failGolden.contribution).passed, false);
  });

  it("SCORE-TRUST06-RED stale runner required the version inside marketing prose", () => {
    const stale = staleRunnerScore(passGolden);
    assert.equal(stale["TRUST-06"], false, "stale runner looked for responsibility-3.0.0 in connector copy");
    assert.equal(scoreTrust06(passGolden.responsibility).passed, true);
    assert.equal(scoreTrust06(failGolden.responsibility).passed, false);
  });

  it("eight goldens score twice with identical canonical rows", () => {
    const first = scoreV3Assertions(passGolden);
    const second = scoreV3Assertions(passGolden);
    const failFirst = scoreV3Assertions(failGolden);
    const failSecond = scoreV3Assertions(failGolden);
    assert.deepEqual(
      first.map((row) => row.passed),
      [true, true, true, true]
    );
    assert.deepEqual(
      failFirst.map((row) => row.passed),
      [false, false, false, false]
    );
    assert.equal(canonicalScoreRows(first), canonicalScoreRows(second));
    assert.equal(canonicalScoreRows(failFirst), canonicalScoreRows(failSecond));
  });
});
