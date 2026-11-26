import { NetworkError } from "../api/client";
import type { KeyValueStore } from "./storage";

export interface Cached<T> {
  data: T;
  /** True when the server could not be reached and this is the last copy we saved. */
  fromCache: boolean;
}

/**
 * Load from the network and remember the answer. If the network is down, hand back
 * the last saved answer instead. Errors from the server itself (401, 404...) are not hidden.
 */
export async function cachedGet<T>(store: KeyValueStore, key: string, load: () => Promise<T>): Promise<Cached<T>> {
  const storageKey = `cache:${key}`;
  try {
    const data = await load();
    await store.setItem(storageKey, JSON.stringify(data)).catch(() => undefined);
    return { data, fromCache: false };
  } catch (err) {
    if (!(err instanceof NetworkError)) throw err;
    const saved = await store.getItem(storageKey).catch(() => null);
    if (saved === null) throw err;
    return { data: JSON.parse(saved) as T, fromCache: true };
  }
}
