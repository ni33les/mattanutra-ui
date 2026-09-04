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

export function replaceQueryBudget(namespace: string, counts: Record<string, number>) {
  byNamespace.set(
    namespace,
    new Map(Object.entries(counts).map(([key, value]) => [key, Number(value) || 0]))
  );
}

export function queryCount(name: string, namespace?: string) {
  return bucket(namespace ?? activeNamespace).get(name) ?? 0;
}

export function dependencyBudget(namespace?: string) {
  const queries = queryBudgetSnapshot(namespace);
  return {
    catalogueSnapshots: queries["catalogue.snapshot.TH"] ?? 0,
    planMatchHits: queries["plan.match.hit"] ?? 0,
    planMatchMisses: queries["plan.match.miss"] ?? 0,
    polling: false as const,
    sleeps: 0 as const
  };
}
