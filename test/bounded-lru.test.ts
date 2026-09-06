import assert from "node:assert/strict";
import { it } from "node:test";
import { BoundedLru } from "../lib/bounded-lru.ts";

it("evicts the least recently used entry while retaining false values", () => {
  const cache = new BoundedLru<string, boolean>(2);
  cache.set("a", false);
  cache.set("b", true);
  assert.equal(cache.get("a"), false);
  cache.set("c", true);
  assert.equal(cache.get("b"), undefined);
  for (let i = 0; i < 1000; i++) cache.set(String(i), false);
  assert.equal(cache.size, 2);
  cache.set("999", true);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("999"), true);
});
