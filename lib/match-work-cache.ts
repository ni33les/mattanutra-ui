// Interfaces are introduced with the RED ownership and byte-budget cases.
export type SharedWorkContext<C> = { signal: AbortSignal; notify: (checkpoint: C) => Promise<void> };
export class ByteBoundedCache<T> {
  constructor(_limit: number) { throw new Error("Byte-bounded cache not implemented"); }
  bytes = 0;
  get(_key: string): T | undefined { return undefined; }
  set(_key: string, _value: T): void {}
}
export class SharedMatchWork<T, C> {
  constructor(_limit: number) { throw new Error("Shared work not implemented"); }
  run(_key: string, _owner: { signal?: AbortSignal; checkpoint?: (value: C) => Promise<void> }, _compute: (context: SharedWorkContext<C>) => Promise<T>): Promise<T> { throw new Error("Shared work not implemented"); }
}
