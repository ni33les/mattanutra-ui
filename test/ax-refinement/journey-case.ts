import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { refinementJourney } from "../../scripts/ax-refinement/client.mjs";
import { profiles, publicRequest, runtime, installRealCatalogue, uninstallRealCatalogue } from "./helpers.ts";
import { withMemoryTaskExecutor } from "../helpers/completed-mcp-client.ts";
import { handleJsonRpc } from "../../lib/agentic/mcp/dispatcher.ts";
import { beginDeterministicIdsForTests, endDeterministicIdsForTests } from "../../lib/agentic/capabilities.ts";

import type { Locale } from "../../lib/i18n.ts";

export function cleanupRefinementJourney() { uninstallRealCatalogue(); endDeterministicIdsForTests(); }

export async function runRefinementJourney(profile: (typeof profiles)[number], locale: Locale) {
    await installRealCatalogue("dev"); beginDeterministicIdsForTests();
    const instance = runtime(`journey-${profile.id}-${locale}`);
    const result = await withMemoryTaskExecutor(instance, () => refinementJourney({ request: { ...publicRequest(profile.request), locale },
      discovery: profile.id === "A1" || profile.id === "A3" || profile.id === "A5" ? "resources" : "tools_only", key: `ax-journey-${profile.id}-${locale}`,
      rpc: async (method: string, params: Record<string, unknown>) => {
        const reply = await handleJsonRpc(instance, { id: 1, method, params });
        assert.ok(reply?.result, JSON.stringify(reply)); return reply.result;
      }
    }));
    if (process.env.AX_REFINEMENT_EVIDENCE_DIR) writeFileSync(join(process.env.AX_REFINEMENT_EVIDENCE_DIR, `journey-${profile.id}-${locale}.json`), JSON.stringify(result, null, 2), { flag: "wx" });
}
