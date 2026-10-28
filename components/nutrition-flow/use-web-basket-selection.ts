"use client";

import { useSyncExternalStore } from "react";
import { readStoredWebBasketSelection } from "@/lib/web-basket-selection";

const changed = "mattanutra:web-basket-changed";
const memory = new Map<string, string>();
const serverSnapshot = () => null;

function subscribe(callback: () => void) {
  window.addEventListener(changed, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(changed, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Session-only product IDs; the caller's revision identity deliberately excludes display language. */
export function useWebBasketSelection(identity: string, productIds: readonly string[], defaults: readonly string[]) {
  const key = `mattanutra:web-basket:v1:${identity}`;
  const raw = useSyncExternalStore(subscribe, () => {
    if (memory.has(key)) return memory.get(key)!;
    try { return window.sessionStorage.getItem(key); } catch { return null; }
  }, serverSnapshot);
  const selectedIds = readStoredWebBasketSelection(raw, productIds) ?? [...defaults];

  function select(ids: readonly string[]) {
    const value = JSON.stringify({ version: 1, ids });
    try { window.sessionStorage.setItem(key, value); memory.delete(key); }
    catch { memory.set(key, value); }
    window.dispatchEvent(new Event(changed));
  }

  return [selectedIds, select] as const;
}
