/** Worker-only checkpoint envelope. The browser matcher never imports this module. */
import { serialize, deserialize } from "node:v8";
import { deflateSync, inflateSync } from "node:zlib";
import type { SearchCursor } from "@/lib/matcher/search-cursor";
import { matchCursorAttempts, type MatchCursor } from "@/lib/matcher/match-cursor";

export function encodeSearchCursor(cursor: SearchCursor) { return serialize(cursor).toString("base64"); }
export function decodeSearchCursor(text: string, expectedIdentity: string): SearchCursor {
  const cursor = deserialize(Buffer.from(text, "base64")) as SearchCursor;
  if (cursor.version !== "search-cursor-1" || cursor.identity !== expectedIdentity) throw new Error("Search cursor identity changed");
  if (!Number.isSafeInteger(cursor.expansionBudget) || !Number.isSafeInteger(cursor.expansionAttempts) || cursor.expansionAttempts < 0 || cursor.expansionAttempts > cursor.expansionBudget) throw new Error("Invalid search cursor budget");
  return cursor;
}
export function encodeMatchCursor(cursor: MatchCursor) { return deflateSync(serialize(cursor), { level: 1 }).toString("base64"); }
export function decodeMatchCursor(encoded: string, identity: string): MatchCursor {
  const cursor = deserialize(inflateSync(Buffer.from(encoded, "base64"))) as MatchCursor;
  if (cursor.version !== "match-cursor-1" || cursor.identity !== identity) throw new Error("Matching checkpoint identity changed");
  if (!Number.isSafeInteger(cursor.expansionBudget) || matchCursorAttempts(cursor) > cursor.expansionBudget) throw new Error("Invalid checkpoint work budget");
  return cursor;
}
