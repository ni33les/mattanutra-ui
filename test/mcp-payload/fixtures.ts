import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import type { PlanSuccessWire } from "../../lib/agentic/contract/outputs.ts";
import type { PlanRequest } from "../../lib/agentic/plan/types.ts";

const root = new URL("../fixtures/mcp-payload/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
const raw = gunzipSync(readFileSync(new URL("baseline.json.gz", root)));
assert.equal(createHash("sha256").update(raw).digest("hex"), manifest.sha256, "Frozen baseline changed");
export const baseline = JSON.parse(raw.toString()) as { cases: { caseId: string; request: PlanRequest; plan: PlanSuccessWire; discovery?: { request: unknown; response: { result: Record<string, unknown> } }[] }[] };
assert.equal(baseline.cases.length, 18);
export const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
