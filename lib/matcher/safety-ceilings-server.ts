import { AsyncLocalStorage } from "node:async_hooks";
import { immutableReferences, installMatcherSafetyScope, type MatcherSafetySnapshot } from "@/lib/matcher/safety-ceilings";

const referenceScope = new AsyncLocalStorage<MatcherSafetySnapshot>();
installMatcherSafetyScope(() => referenceScope.getStore());

/** Server-only asynchronous ownership; shared/browser arithmetic stays pure. */
export function runWithMatcherSafetySnapshot<T>(snapshot: MatcherSafetySnapshot, work: () => T): T {
  return referenceScope.run(immutableReferences(snapshot), work);
}
