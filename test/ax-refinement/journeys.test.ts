import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, afterEach } from "node:test";
import { refinementJourney } from "../../scripts/ax-refinement/client.mjs";
import { profiles, runtime, installRealCatalogue, uninstallRealCatalogue } from "./helpers.ts";
import { handleJsonRpc } from "../../lib/agentic/mcp/dispatcher.ts";
import { beginDeterministicIdsForTests, endDeterministicIdsForTests } from "../../lib/agentic/capabilities.ts";

afterEach(() => { uninstallRealCatalogue(); endDeterministicIdsForTests(); });
for (const locale of ["en", "th", "zh-CN"] as const) for (const profile of profiles) {
  test(`AXR-REG-01 AXR-REG-02 ${profile.id} ${locale} published refinement preserves coverage, advice and current selection`, { timeout: 90000 }, async () => {
    await installRealCatalogue("dev"); beginDeterministicIdsForTests();
    const instance = runtime(`journey-${profile.id}-${locale}`);
    const result = await refinementJourney({ request: { ...structuredClone(profile.request), locale },
      discovery: profile.id === "A1" || profile.id === "A3" || profile.id === "A5" ? "resources" : "tools_only", key: `ax-journey-${profile.id}-${locale}`,
      rpc: async (method: string, params: Record<string, unknown>) => {
        const reply = await handleJsonRpc(instance, { id: 1, method, params });
        assert.ok(reply?.result, JSON.stringify(reply)); return reply.result;
      }
    });
    if (process.env.AX_REFINEMENT_EVIDENCE_DIR) writeFileSync(join(process.env.AX_REFINEMENT_EVIDENCE_DIR, `journey-${profile.id}-${locale}.json`), JSON.stringify(result, null, 2), { flag: "wx" });
  });
}
