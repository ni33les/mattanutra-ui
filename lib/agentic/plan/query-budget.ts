const GLOBAL = "global";
const byNamespace = new Map<string, Map<string, number>>();
let activeNamespace = GLOBAL;

function bucket(namespace = activeNamespace) {
  const key = namespace || GLOBAL;
  const existing = byNamespace.get(key);
  if (existing) {
    return existing;
  }
  const created = new Map<string, number>();
  byNamespace.set(key, created);
  return created;
}

export function setQueryNamespace(namespace?: string) {
  activeNamespace = namespace?.trim() || GLOBAL;
  bucket(activeNamespace);
}

export function getQueryNamespace() {
  return activeNamespace;
}

export function resetQueryBudget(namespace?: string) {
  if (namespace) {
    byNamespace.delete(namespace);
    if (activeNamespace === namespace) {
      activeNamespace = GLOBAL;
    }
    return;
  }
  byNamespace.clear();
  activeNamespace = GLOBAL;
}

export function countQuery(name: string) {
  const counts = bucket();
  counts.set(name, (counts.get(name) ?? 0) + 1);
}

export function queryBudgetSnapshot(namespace?: string) {
  const counts = bucket(namespace ?? activeNamespace);
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
}

export function queryCount(name: string, namespace?: string) {
  return bucket(namespace ?? activeNamespace).get(name) ?? 0;
}
