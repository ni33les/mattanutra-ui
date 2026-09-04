import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { evaluateV3StartGate } from "../lib/agentic/qa/v3-start-gate.ts";
import { infoTool, resetInfoCache } from "../lib/agentic/info.ts";
import { qaPreflight } from "../lib/agentic/qa/preflight.ts";
import { loadAgenticConfig } from "../lib/agentic/config.ts";
import { resetReleaseManifestForTests } from "../lib/agentic/release-manifest.ts";
import { canonicalHash } from "../lib/agentic/value/canonical.ts";

const RED_INFO = JSON.parse(
  readFileSync(new URL("./agentic/ident/red-artifacts/ident-red-01.info.json", import.meta.url), "utf8")
) as {
  httpStatus: number;
  structuredContent: Record<string, unknown>;
};
const RED_HASH = readFileSync(
  new URL("./agentic/ident/red-artifacts/ident-red-01.sha256", import.meta.url),
  "utf8"
).trim();
const RED_PREFLIGHT = JSON.parse(
  readFileSync(
    new URL("./agentic/ident/red-artifacts/ident-red-02.preflight.json", import.meta.url),
    "utf8"
  )
) as {
  structuredContent: {
    manifest?: { schemaChecksum?: string };
  };
};

function canonicalInfoHash(info: Record<string, unknown>) {
  return canonicalHash(info);
}

describe("IDENT-RED public identity evidence", () => {
  it("IDENT-RED-01 captured live public info omitted buildId and schemaChecksum", () => {
    assert.equal(RED_INFO.httpStatus, 200);
    assert.equal(RED_INFO.structuredContent.ok, true);
    assert.equal("buildId" in RED_INFO.structuredContent, false);
    assert.equal("schemaChecksum" in RED_INFO.structuredContent, false);
    assert.equal(canonicalInfoHash(RED_INFO.structuredContent), RED_HASH);
  });

  it("IDENT-RED-02 captured public/QA checksum inconsistency", () => {
    const qaChecksum = RED_PREFLIGHT.structuredContent.manifest?.schemaChecksum ?? "";
    assert.equal(qaChecksum.length, 64);
    assert.equal("schemaChecksum" in RED_INFO.structuredContent, false);
    assert.notEqual(String(RED_INFO.structuredContent.schemaChecksum ?? ""), qaChecksum);
  });

  it("IDENT-RED-03 locked start gate aborts the captured payload without Run A/B or a score", () => {
    const gate = evaluateV3StartGate(RED_INFO.structuredContent);
    assert.equal(gate.status, "INVALID_RUN");
    assert.equal(gate.reason, "missing_live_build_id");
    assert.equal(gate.runA, null);
    assert.equal(gate.runB, null);
    assert.equal(gate.score, null);
  });

  it("IDENT-RED-01 current public info emits non-empty identity fields", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const info = await infoTool({ config: loadAgenticConfig(), locale: "en" });
    assert.equal(info.ok, true);
    assert.ok(String(info.buildId ?? "").length > 0);
    assert.ok(String(info.schemaChecksum ?? "").length > 0);
  });

  it("IDENT-RED-02 current public schemaChecksum equals QA preflight", async () => {
    resetReleaseManifestForTests();
    resetInfoCache();
    const info = await infoTool({ config: loadAgenticConfig(), locale: "en" });
    const preflight = await qaPreflight();
    assert.equal(info.schemaChecksum, preflight.manifest.schemaChecksum);
  });
});
