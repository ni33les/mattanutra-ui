import { AsyncLocalStorage } from "node:async_hooks";
/** Count request-owned consumed queries, not lazy SQL fragments or setup work. */
export function measureDatabaseTraffic(raw) {
  const scopes = new AsyncLocalStorage();
  let current = { sqlStatements: 0, applicationSelects: 0, rowBytes: 0 };
  const query = (value, text) => {
    if (!value || typeof value.then !== "function") return value;
    const owner = scopes.getStore(); if (!owner) return value;
    let consumed = false;
    return new Proxy(value, { get: (target, key) => key === "then" ? (...callbacks) => {
      if (!consumed) {
        consumed = true; owner.sqlStatements++;
        if (/^\s*select/i.test(text) && !/set_config\(/i.test(text)) owner.applicationSelects++;
        return target.then(rows => { owner.rowBytes += Buffer.byteLength(JSON.stringify(rows)); return rows; }).then(...callbacks);
      }
      return target.then(...callbacks);
    } : Reflect.get(target, key) });
  };
  const wrap = sql => new Proxy(sql, {
    apply: (target, receiver, args) => query(Reflect.apply(target, receiver, args), Array.isArray(args[0]) ? args[0].join(" ? ") : String(args[0])),
    get: (target, key) => key === "begin" ? async work => {
      const owner = scopes.getStore(); if (owner) owner.sqlStatements++;
      try { return await target.begin(tx => work(wrap(tx))); } finally { if (owner) owner.sqlStatements++; }
    } : key === "unsafe" ? (...args) => query(target.unsafe(...args), args[0]) : Reflect.get(target, key)
  });
  return { sql: wrap(raw), observe: work => scopes.run(current, work), reset: () => { current = { sqlStatements: 0, applicationSelects: 0, rowBytes: 0 }; }, measurements: () => ({ ...current }) };
}
