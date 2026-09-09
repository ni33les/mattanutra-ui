import { AsyncLocalStorage } from "node:async_hooks";
import { serialize, deserialize } from "node:v8";
import { recordServiceMetric } from "@/lib/service-metrics";

/** Bound retained encoded values and keys; callers measure actual heap separately.
 * Encoding once also prevents callers from mutating another request's cached facts. */
export class ByteBoundedCache<T> {
  private readonly entries = new Map<string, { value: Buffer | null; immutable?: T; bytes: number }>();
  private readonly immutable: boolean;
  private readonly limit: number;
  bytes = 0;
  constructor(limit: number, immutable = false) {
    this.immutable = immutable;
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Cache byte budget must be a non-negative safe integer");
    this.limit = limit;
  }
  get(key: string): T | undefined {
    const row = this.entries.get(key);
    recordServiceMetric(row ? "cache.hit" : "cache.miss");
    if (!row) return undefined;
    this.entries.delete(key); this.entries.set(key, row);
    return row.value ? deserialize(row.value) as T : row.immutable!;
  }
  set(key: string, value: T) {
    const encoded = serialize(value), bytes = encoded.byteLength + key.length * 2 + 16;
    this.delete(key);
    if (bytes > this.limit) return;
    while (this.bytes + bytes > this.limit) { this.delete(this.entries.keys().next().value!); recordServiceMetric("cache.eviction"); }
    this.entries.set(key, this.immutable ? { value: null, immutable: freezeFacts(structuredClone(value)), bytes } : { value: encoded, bytes }); this.bytes += bytes;
    recordServiceMetric("cache.bytes", this.bytes);
  }
  private delete(key: string) { const row = this.entries.get(key); if (row) { this.bytes -= row.bytes; this.entries.delete(key); } }
  clear() { this.entries.clear(); this.bytes = 0; }
}

function freezeFacts<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeFacts(child);
    Object.freeze(value);
  }
  return value;
}

type ReleaseUnstarted = () => Promise<void>;
export type SharedWorkContext<C> = { signal: AbortSignal; notify: (checkpoint: C) => Promise<ReleaseUnstarted | void> };
type Owner<C> = { signal?: AbortSignal; checkpoint?: (value: C) => Promise<ReleaseUnstarted | void> };
type Subscriber<T, C> = Owner<C> & { resolve: (value: T) => void; reject: (error: unknown) => void; cleanup: () => void };
type Flight<T, C> = { controller: AbortController; owners: Set<Subscriber<T, C>> };

/** Only immutable matching outputs belong here. Each subscriber performs its own
 * lease-fenced writes; loss of one owner cannot cancel another owner's work. */
export class SharedMatchWork<T, C> {
  private readonly completed: ByteBoundedCache<T>;
  private readonly pending = new Map<string, Flight<T, C>>();
  constructor(limit: number) { this.completed = new ByteBoundedCache<T>(limit); }
  run(key: string, owner: Owner<C>, compute: (context: SharedWorkContext<C>) => Promise<T>): Promise<T> {
    if (owner.signal?.aborted) return Promise.reject(owner.signal.reason);
    const cached = this.completed.get(key); if (cached !== undefined) return Promise.resolve(cached);
    let flight = this.pending.get(key);
    if (!flight && this.pending.size >= 16) return Promise.reject(new Error("Matcher capacity exhausted"));
    if (flight && flight.owners.size >= 16) return Promise.reject(new Error("Matcher subscriber capacity exhausted"));
    const created = !flight;
    if (!flight) { flight = { controller: new AbortController(), owners: new Set() }; this.pending.set(key, flight); }
    const active = flight;
    const detach = (subscriber: Subscriber<T, C>, error: unknown) => {
      if (!active.owners.delete(subscriber)) return;
      subscriber.cleanup(); subscriber.reject(error);
      if (!active.owners.size) {
        active.controller.abort(error);
        if (this.pending.get(key) === active) this.pending.delete(key);
      }
    };
    const ownerContext = AsyncLocalStorage.snapshot();
    const result = new Promise<T>((resolve, reject) => {
      const cancelled = () => detach(subscriber, owner.signal?.reason);
      const subscriber = { ...owner, checkpoint: owner.checkpoint ? (value: C) => ownerContext(owner.checkpoint!, value) : undefined, resolve, reject, cleanup: () => owner.signal?.removeEventListener("abort", cancelled) };
      active.owners.add(subscriber); owner.signal?.addEventListener("abort", cancelled, { once: true });
    });
    if (created) void (async () => {
      try {
        const value = await compute({ signal: active.controller.signal, notify: async checkpoint => {
          active.controller.signal.throwIfAborted();
          const releases: ReleaseUnstarted[] = [];
          await Promise.all([...active.owners].map(async subscriber => {
            try { const release = await subscriber.checkpoint?.(checkpoint); if (release) releases.push(release); }
            catch (error) { detach(subscriber, error); }
          }));
          const releaseUnstarted = releases.length ? async () => { await Promise.all(releases.map(release => release())); } : undefined;
          if (active.controller.signal.aborted) await releaseUnstarted?.();
          active.controller.signal.throwIfAborted();
          return releaseUnstarted;
        } });
        active.controller.signal.throwIfAborted();
        this.completed.set(key, value);
        for (const subscriber of active.owners) { subscriber.cleanup(); subscriber.resolve(structuredClone(value)); }
      } catch (error) {
        for (const subscriber of active.owners) { subscriber.cleanup(); subscriber.reject(error); }
      } finally {
        active.owners.clear(); if (this.pending.get(key) === active) this.pending.delete(key);
      }
    })();
    return result;
  }
  clearCompleted() { this.completed.clear(); }
}
