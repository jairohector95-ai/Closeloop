import type { StateStorage } from "zustand/middleware";

/**
 * Persistence boundary.
 *
 * Phase 1 keeps the whole workspace in the browser's localStorage. Phase 2
 * replaces this adapter with one backed by Supabase/Postgres (or swaps the
 * store's actions for API calls) without touching the UI or domain logic.
 */
export interface PersistenceAdapter extends StateStorage {
  readonly name: string;
}

export function createLocalStorageAdapter(): PersistenceAdapter {
  return {
    name: "localStorage",
    getItem: (key) => {
      try {
        return typeof window === "undefined" ? null : window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        if (typeof window !== "undefined") window.localStorage.setItem(key, value);
      } catch {
        // Storage may be full or blocked (private mode). The app keeps working in memory.
      }
    },
    removeItem: (key) => {
      try {
        if (typeof window !== "undefined") window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

export function createMemoryAdapter(): PersistenceAdapter {
  const map = new Map<string, string>();
  return {
    name: "memory",
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}
