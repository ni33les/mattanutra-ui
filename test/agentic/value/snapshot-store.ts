import { AsyncLocalStorage } from 'node:async_hooks';
import type { CatalogueSnapshot } from '../../../lib/agentic/catalogue/types.ts';
import { createMemoryStore } from '../../../lib/agentic/store/memory.ts';

/** These packs match an immutable captured catalogue, not the live database.
 * Model ordinary freshness reads and commercial mutation validation against
 * that exact captured epoch. Matching publication is snapshot based. */
export function createSnapshotMemoryStore(snapshot: Pick<CatalogueSnapshot, 'runtimeRevision'>) {
  const epoch = snapshot.runtimeRevision;
  const store = createMemoryStore();
  const transactionScope = new AsyncLocalStorage<boolean>();
  const transaction = store.transaction.bind(store);
  store.transaction = work => transaction(tx => transactionScope.run(true, () => work(tx)));
  store.isCatalogueRevisionCurrent = async expected => {
    if (!transactionScope.getStore()) throw new Error('Frozen catalogue checks require a transaction');
    return Number.isSafeInteger(epoch) && Number.isSafeInteger(expected) && expected >= 0 && expected === epoch;
  };
  const read = store.getPlanReadState.bind(store);
  store.getPlanReadState = async (...args) => {
    const state = await read(...args);
    return state ? { ...state, catalogueRevision: epoch ?? null } : state;
  };
  return store;
}
