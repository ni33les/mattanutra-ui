import { readFileSync } from "node:fs";
import { correctedAxSnapshot } from "../../lib/agentic/catalogue/ax-corrections.ts";
import { replaceCatalogueSnapshot } from "../../lib/agentic/catalogue/snapshot.ts";
import { installRealCatalogue } from "../ax-refinement/helpers.ts";
import type { PlanRequest } from "../../lib/agentic/plan/types.ts";
export const goldens = JSON.parse(readFileSync("test/fixtures/mcp-7-2-3/goldens.json", "utf8")) as Record<"d3" | "k2_d3", PlanRequest>;
export async function installCatalogue() {
  const frozen = await installRealCatalogue("dev");
  const manifest = JSON.parse(readFileSync("data/catalogue-corrections/mcp-7.2.2-dev.json", "utf8"));
  const corrected = correctedAxSnapshot(frozen.snapshot, manifest).snapshot;
  replaceCatalogueSnapshot(corrected); return { ...frozen, snapshot: corrected };
}
