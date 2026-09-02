const counts = new Map<string, number>();

export function resetQueryBudget() {
  counts.clear();
}

export function countQuery(name: string) {
  counts.set(name, (counts.get(name) ?? 0) + 1);
}

export function queryBudgetSnapshot() {
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function queryCount(name: string) {
  return counts.get(name) ?? 0;
}
