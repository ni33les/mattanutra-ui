import { catalogueCorrectionState, type CatalogueCorrectionManifest } from "@/lib/catalogue-corrections";
import { parseProductAdministration } from "@/lib/product-administration";
import { snapshotFacts, toCatalogueProduct } from "@/lib/agentic/catalogue/live";
import { buildContributionIndex } from "@/lib/agentic/catalogue/live-supplements";
import type { CatalogueSnapshot } from "@/lib/agentic/catalogue/types";

/** Pure reviewed reconstruction. The original snapshot and facts stay intact.
 * The database applier independently validates the same manifest against rows. */
export function correctedAxSnapshot(snapshot: CatalogueSnapshot, manifest: CatalogueCorrectionManifest) {
  if (manifest.environment !== "dev") throw new Error("AX corrections are DEV only");
  const products = structuredClone(snapshot.products);
  const receipts = [];
  const index = buildContributionIndex(snapshot.supplements);
  for (const correction of manifest.corrections) {
    const productId = correction.entityTable === "products" ? correction.entityId : correction.before.product_id;
    const listings = products.map((product, i) => ({ product, i })).filter(row => row.product.candidate.id === productId);
    if (!listings.length) throw new Error(`Missing reviewed product: ${correction.correctionId}`);
    for (const { product, i } of listings) {
      const candidate = product.candidate;
      if (correction.entityTable === "products") {
        catalogueCorrectionState(correction, { id: candidate.id, administration: candidate.administration });
        candidate.administration = parseProductAdministration(correction.after.administration);
      } else {
        const fields = { name: "name", amount: "amount", unit: "unit", supplement_id: "supplementId", confidence: "confidence", source: "source", source_url: "sourceUrl", source_text: "sourceText", serving_label: "servingLabel" } as const;
        const matches = candidate.facts.filter(fact => Object.entries(fields).every(([raw, mapped]) => (fact[mapped] ?? null) === (correction.before[raw] ?? null)));
        if (matches.length !== 1) throw new Error(`Exact prior fact is missing or ambiguous: ${correction.correctionId}`);
        const fact = matches[0]!;
        const values = Object.fromEntries(Object.entries(fields).map(([raw, mapped]) => [mapped, correction.after[raw]]));
        const supplement = snapshot.supplements.find(row => row.uuid === correction.after.supplement_id);
        if (!supplement) throw new Error("Correction lost its supplement mapping");
        const rebuilt = snapshotFacts([{ ...fact, ...values, mappedName: supplement.name, mappedAliases: supplement.aliases }]);
        if (rebuilt.length !== 1) throw new Error("Correction lost its fact");
        candidate.facts = candidate.facts.map(row => row === fact ? rebuilt[0]! : row);
      }
      const rebuilt = toCatalogueProduct(candidate, snapshot.supplements, index);
      if (!rebuilt || rebuilt.unitPriceMinor !== product.unitPriceMinor || rebuilt.retailerSku !== product.retailerSku || rebuilt.stockStatus !== product.stockStatus) throw new Error("Correction changed a frozen commercial identity");
      products[i] = rebuilt;
    }
    receipts.push({ correctionId: correction.correctionId, beforeFingerprint: correction.beforeFingerprint, afterFingerprint: correction.afterFingerprint, listings: listings.length });
  }
  return { snapshot: { ...snapshot, products, catalogueVersion: `${snapshot.catalogueVersion}:ax-v7-reviewed` }, receipts };
}
