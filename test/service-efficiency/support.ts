import assert from "node:assert/strict";
import { fixtureSnapshot } from "../../lib/agentic/catalogue/fixtures.ts";
import { installGoldCatalogue } from "../helpers/gold-catalogue.ts";
import { normalizePlanRequest } from "../../lib/agentic/plan/normalize.ts";
import { loadAgenticConfig } from "../../lib/agentic/config.ts";
export async function input() {
  installGoldCatalogue(); const snapshot = fixtureSnapshot();
  const normalized = await normalizePlanRequest({ config: loadAgenticConfig(), snapshot, request: {
    destinationCountry: "TH", locale: "en", optimization: "balanced", requirements: {},
    profile: { ageYears: 38, sex: "male", lifeStage: "adult" },
    targets: [{ name: "Vitamin D3", amount: 2000, unit: "IU" }, { name: "Magnesium", amount: 200, unit: "mg" }]
  } });
  assert.ok("state" in normalized); return { snapshot, state: normalized.state };
}
