import { AsyncLocalStorage } from 'node:async_hooks';
import type { CatalogueSnapshot } from '../../../lib/agentic/catalogue/types.ts';
import { createMemoryStore } from '../../../lib/agentic/store/memory.ts';

/** These packs match an immutable captured catalogue, not the live database.
 * Model the publication fence against that exact captured epoch. Production
 * stores still acquire the PostgreSQL epoch lock; no application guard changes. */
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
  return store;
}
