import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient, type ApiClient } from "./api/client";
import { createLocalClient, resetLocalState } from "./api/localClient";
import { deviceStorage } from "./lib/storage";

interface SessionData {
  baseUrl: string;
  token: string;
  userName: string;
  /** No server: everything lives in this device's storage. */
  demo?: boolean;
}

interface SessionValue {
  ready: boolean;
  session: SessionData | null;
  client: ApiClient | null;
  /** True when the app was built to run only in demo mode (no server address to enter). */
  demoOnly: boolean;
  signIn(baseUrl: string, name: string): Promise<void>;
  startDemo(): Promise<void>;
  /** Forget the demo's saved changes and start again from the sample group. */
  resetDemo(): Promise<void>;
  signOut(): Promise<void>;
}

const STORE_KEY = "session";
export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/** Set EXPO_PUBLIC_DEMO_ONLY=1 at build time to make a build that never asks for a server. */
export const DEMO_ONLY = process.env.EXPO_PUBLIC_DEMO_ONLY === "1";
const DEMO_SESSION: SessionData = { baseUrl: "", token: "local", userName: "You", demo: true };

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    deviceStorage
      .getItem(STORE_KEY)
      .then((raw) => {
        if (raw) setSession(JSON.parse(raw) as SessionData);
        else if (DEMO_ONLY) setSession(DEMO_SESSION);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(async (baseUrl: string, name: string) => {
    const url = baseUrl.trim().replace(/\/+$/, "");
    const res = await createClient({ baseUrl: url }).register(name.trim());
    const data: SessionData = { baseUrl: url, token: res.token, userName: res.user.name };
    await deviceStorage.setItem(STORE_KEY, JSON.stringify(data));
    setSession(data);
  }, []);

  const startDemo = useCallback(async () => {
    await deviceStorage.setItem(STORE_KEY, JSON.stringify(DEMO_SESSION));
    setSession(DEMO_SESSION);
  }, []);

  const resetDemo = useCallback(async () => {
    await resetLocalState(deviceStorage);
    // A new client starts from a fresh copy of the sample group.
    setSession({ ...DEMO_SESSION });
  }, []);

  const signOut = useCallback(async () => {
    await deviceStorage.removeItem(STORE_KEY);
    setSession(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      session,
      client: !session
        ? null
        : session.demo
          ? createLocalClient({ store: deviceStorage, userName: session.userName })
          : createClient({ baseUrl: session.baseUrl, token: session.token }),
      demoOnly: DEMO_ONLY,
      signIn,
      startDemo,
      resetDemo,
      signOut,
    }),
    [ready, session, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

/** For screens that only render when signed in. */
export function useClient(): ApiClient {
  const { client } = useSession();
  if (!client) throw new Error("not signed in");
  return client;
}
