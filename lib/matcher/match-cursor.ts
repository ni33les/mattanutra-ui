import { sha256Hex } from "@/lib/sha256";
import { serializeExactValue } from "@/lib/matcher/exact-values";
import { compileGroups, groupsBySeller } from "@/lib/matcher/candidates";
import { orderInvariantRequest } from "@/lib/matcher/canonicalizer";
import { resolvePracticalProfile } from "@/lib/matcher/practical-scoring";
import { createSearchCursor, advanceSearchCursor, extendSearchCursor, type SearchCursor } from "@/lib/matcher/search-cursor";
import type { CanonicalRequest, CatalogSnapshot, MatcherConfig, ProductGroup } from "@/lib/matcher/types";

export type MatchCursor = {
  version: "match-cursor-1"; identity: string; effort: "standard" | "expanded";
  expansionBudget: number; standardBudget: number; seller: number; expanded: boolean; done: boolean;
  sellers: { sellerId: string; cursor: SearchCursor }[];
};
// Worker inputs are immutable. Reuse their canonical view for every chunk so
// target display order cannot change bounded exploration or discard arithmetic caches.
const canonicalCursorRequests = new WeakMap<CanonicalRequest, CanonicalRequest>();
function cursorRequest(request: CanonicalRequest): CanonicalRequest {
  let canonical = canonicalCursorRequests.get(request);
  if (!canonical) {
    canonical = orderInvariantRequest(request);
    canonicalCursorRequests.set(request, canonical);
    canonicalCursorRequests.set(canonical, canonical);
  }
  return canonical;
}
function allocation(budget: number, count: number, index: number) {
  return Math.floor(budget / count) + (index < budget % count ? 1 : 0);
}
export function matchCursorIdentity(request: CanonicalRequest, catalog: CatalogSnapshot, config: MatcherConfig) {
  return sha256Hex(JSON.stringify(serializeExactValue({ version: "match-cursor-1", scoringProfileHash: resolvePracticalProfile(request).hash, request: { ...cursorRequest(request), searchEffort: undefined }, catalog: { ...catalog, availabilityAsOf: undefined }, config })));
}
export function createMatchCursor(request: CanonicalRequest, catalog: CatalogSnapshot, config: MatcherConfig, compiledGroups?: readonly ProductGroup[]): MatchCursor {
  request = cursorRequest(request);
  const groups = groupsBySeller(compiledGroups ?? compileGroups(request, catalog), request, config.sellerGroupLimit);
  const standardBudget = Math.max(0, Math.floor(config.expansionBudget)), effort = request.searchEffort ?? "standard";
  return { version: "match-cursor-1", identity: matchCursorIdentity(request, catalog, config), effort, standardBudget,
    expansionBudget: effort === "expanded" ? Math.max(64_000, standardBudget) : standardBudget,
    seller: 0, expanded: false, done: groups.length === 0,
    sellers: groups.map((seller, index) => ({ sellerId: seller.sellerId,
      cursor: createSearchCursor(seller.groups, request, { ...config, expansionBudget: allocation(standardBudget, groups.length, index) }) })) };
}
export function matchCursorAttempts(cursor: MatchCursor) {
  return cursor.sellers.reduce((sum, seller) => sum + seller.cursor.expansionAttempts, 0);
}
export function expandMatchCursor(cursor: MatchCursor) {
  cursor.effort = "expanded"; cursor.expansionBudget = Math.max(64_000, cursor.standardBudget);
  cursor.done = false;
  if (!cursor.expanded) {
    cursor.sellers.forEach((seller, index) => extendSearchCursor(seller.cursor, allocation(cursor.expansionBudget, cursor.sellers.length, index)));
    cursor.expanded = true; cursor.seller = 0;
  }
  return cursor;
}
export function advanceMatchCursor(cursor: MatchCursor, request: CanonicalRequest, chunkBudget: number) {
  if (!Number.isSafeInteger(chunkBudget) || chunkBudget < 1) throw new Error("Invalid match chunk budget");
  request = cursorRequest(request);
  const start = matchCursorAttempts(cursor);
  while (!cursor.done && matchCursorAttempts(cursor) - start < chunkBudget) {
    if (cursor.seller >= cursor.sellers.length) {
      if (cursor.effort === "expanded" && !cursor.expanded) { expandMatchCursor(cursor); continue; }
      cursor.done = true; break;
    }
    const seller = cursor.sellers[cursor.seller]!;
    if (!seller.cursor.done) advanceSearchCursor(seller.cursor, request, chunkBudget - (matchCursorAttempts(cursor) - start));
    if (seller.cursor.done) cursor.seller++;
  }
  // Completion is metadata, not another expansion. An exact chunk boundary
  // must not require a new dispatch and a duplicate full checkpoint.
  if (cursor.seller >= cursor.sellers.length && (cursor.effort !== "expanded" || cursor.expanded)) cursor.done = true;
  return cursor;
}
