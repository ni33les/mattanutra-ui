import { serviceMeasurementContext } from "@/lib/service-metrics";
const GLOBAL = "global";
const byNamespace = new Map<string, Map<string, number>>();
let activeNamespace = GLOBAL;

function bucket(namespace = getQueryNamespace(), map = serviceMeasurementContext()?.queries ?? byNamespace) {
  const key = namespace || GLOBAL;
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const created = new Map<string, number>();
  map.set(key, created);
  while (map.size > 128) map.delete(map.keys().next().value!);
  return created;
}

export function setQueryNamespace(namespace?: string) {
  const scope = serviceMeasurementContext();
  if (scope) scope.queryNamespace = namespace?.trim() || GLOBAL;
  else activeNamespace = namespace?.trim() || GLOBAL;
  bucket(activeNamespace);
}

export function getQueryNamespace() {
  return serviceMeasurementContext()?.queryNamespace ?? activeNamespace;
}

export function captureQueryBudgetState() {
  return {
    activeNamespace,
    byNamespace: new Map(
      [...byNamespace.entries()].map(([key, counts]) => [key, new Map(counts)])
    )
  };
}

export function restoreQueryBudgetState(snapshot: ReturnType<typeof captureQueryBudgetState>) {
  byNamespace.clear();
  for (const [key, counts] of snapshot.byNamespace) {
    byNamespace.set(key, new Map(counts));
  }
  activeNamespace = snapshot.activeNamespace;
}

export function resetQueryBudget(namespace?: string) {
  const scope = serviceMeasurementContext();
  if (scope) {
    if (namespace) scope.queries.delete(namespace); else scope.queries.clear();
    if (!namespace || scope.queryNamespace === namespace) scope.queryNamespace = GLOBAL;
  }
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
  if (serviceMeasurementContext()) {
    const diagnostic = bucket(getQueryNamespace(), byNamespace);
    diagnostic.set(name, (diagnostic.get(name) ?? 0) + 1);
  }
}

export function queryBudgetSnapshot(namespace?: string) {
  const counts = namespace ? bucket(namespace, byNamespace) : bucket();
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
