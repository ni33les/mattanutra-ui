import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { serialize, deserialize } from "node:v8";
import { compileGroups, groupsBySeller } from "@/lib/matcher/candidates";
import { orderInvariantRequest } from "@/lib/matcher/canonicalizer";
import { createSearchCursor, advanceSearchCursor, extendSearchCursor, type SearchCursor } from "@/lib/matcher/search-cursor";
import type { CanonicalRequest, CatalogSnapshot, MatcherConfig, ProductGroup } from "@/lib/matcher/types";

export type MatchCursor = {
  version: "match-cursor-1"; identity: string; effort: "standard" | "expanded";
  expansionBudget: number; standardBudget: number; seller: number; expanded: boolean; done: boolean;
  sellers: { sellerId: string; cursor: SearchCursor }[];
};
function allocation(budget: number, count: number, index: number) {
  return Math.floor(budget / count) + (index < budget % count ? 1 : 0);
}
export function matchCursorIdentity(request: CanonicalRequest, catalog: CatalogSnapshot, config: MatcherConfig) {
  return createHash("sha256").update(serialize({ version: "match-cursor-1", request: { ...orderInvariantRequest(request), searchEffort: undefined }, catalog, config })).digest("hex");
}
export function createMatchCursor(request: CanonicalRequest, catalog: CatalogSnapshot, config: MatcherConfig, compiledGroups?: readonly ProductGroup[]): MatchCursor {
  request = orderInvariantRequest(request);
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
  return cursor;
}
export function encodeMatchCursor(cursor: MatchCursor) { return deflateSync(serialize(cursor), { level: 1 }).toString("base64"); }
export function decodeMatchCursor(encoded: string, identity: string): MatchCursor {
  const cursor = deserialize(inflateSync(Buffer.from(encoded, "base64"))) as MatchCursor;
  if (cursor.version !== "match-cursor-1" || cursor.identity !== identity) throw new Error("Matching checkpoint identity changed");
  if (!Number.isSafeInteger(cursor.expansionBudget) || matchCursorAttempts(cursor) > cursor.expansionBudget) throw new Error("Invalid checkpoint work budget");
  return cursor;
}
