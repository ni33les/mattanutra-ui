export function mergeBySemanticKey<T>(
  items: readonly T[],
  keyOf: (item: T) => string
): T[] {
  return [...items].sort((left, right) => keyOf(left).localeCompare(keyOf(right)));
}
