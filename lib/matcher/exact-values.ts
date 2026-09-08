/** Portable encoding for exact matcher facts, including BigInt and nutrient maps. */
export function serializeExactValue(value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: String(value) };
  if (value instanceof Map) return { $map: [...value].map(([key, child]) => [key, serializeExactValue(child)]) };
  if (Array.isArray(value)) return value.map(serializeExactValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, serializeExactValue((value as Record<string, unknown>)[key])]));
  return value;
}

/** Exact equality for the JSON facts, arrays and nutrient maps used in offers. */
export function exactValueEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([key, value]) => b.has(key) && exactValueEqual(value, b.get(key)));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => exactValueEqual(value, b[index]));
  if (Object.getPrototypeOf(a) !== Object.prototype && Object.getPrototypeOf(a) !== null) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.hasOwn(right, key) && exactValueEqual(left[key], right[key]));
}
