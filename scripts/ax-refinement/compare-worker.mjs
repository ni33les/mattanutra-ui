import { deserialize } from "node:v8";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const root = process.argv[2];
const { match } = await import(pathToFileURL(`${root}/lib/matcher/index.ts`));
const { setMatcherSafetyCeilings } = await import(pathToFileURL(`${root}/lib/matcher/safety-ceilings.ts`));
let bytes = Buffer.alloc(0); for await (const chunk of process.stdin) bytes = Buffer.concat([bytes, chunk]);
const { request, catalog, ceilings, referenceIdentity } = deserialize(bytes);
setMatcherSafetyCeilings(ceilings, referenceIdentity);
const explored = new Set();
const vector = ids => [...ids].map(id => id.slice(id.indexOf(":") + 1)).sort().join("|");
const result = match(request, catalog, undefined, undefined, (seller, state) => explored.add(`${seller}|${vector(state.selectedVariantIds)}`));
const selected = result.selected;
const simplify = basket => basket ? {
  sellerId: basket.sellerId, products: basket.productIds, variants: basket.variantIds,
  priceMinor: basket.priceMinor, pills: basket.pillCountKnown === false ? null : basket.dailyPills,
  productCount: basket.productCount, doseFit: basket.doseFit, coverage: basket.coverageSummary,
  safety: basket.safety, roles: basket.roles, purchaseEligible: basket.purchaseEligible
} : null;
const sorted = [...explored].sort();
process.stdout.write(JSON.stringify({ selected: simplify(selected), options: result.alternatives.map(simplify),
  search: result.searchSummary, selectedKey: selected ? `${selected.sellerId}|${vector(selected.variantIds)}` : null,
  explored: sorted, poolFingerprint: createHash("sha256").update(JSON.stringify(sorted)).digest("hex")
}, (_, value) => typeof value === "bigint" ? value.toString() : value instanceof Map ? [...value] : value));
