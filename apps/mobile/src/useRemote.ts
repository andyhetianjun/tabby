import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { cachedGet } from "./lib/cache";
import { deviceStorage } from "./lib/storage";

export interface Remote<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Showing a saved copy because the server could not be reached. */
  offline: boolean;
  reload(): Promise<void>;
}

/** Load data whenever the screen comes into focus, falling back to the saved copy when offline. */
export function useRemote<T>(cacheKey: string, load: () => Promise<T>): Remote<T> {
  const [state, setState] = useState<Omit<Remote<T>, "reload">>({
    data: null,
    loading: true,
    error: null,
    offline: false,
  });

  const reload = useCallback(async () => {
    try {
      const { data, fromCache } = await cachedGet(deviceStorage, cacheKey, load);
      setState({ data, loading: false, error: null, offline: fromCache });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Something went wrong" }));
    }
  }, [cacheKey, load]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { ...state, reload };
}
