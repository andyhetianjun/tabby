import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient, type ApiClient } from "./api/client";
import { deviceStorage } from "./lib/storage";

interface SessionData {
  baseUrl: string;
  token: string;
  userName: string;
}

interface SessionValue {
  ready: boolean;
  session: SessionData | null;
  client: ApiClient | null;
  signIn(baseUrl: string, name: string): Promise<void>;
  signOut(): Promise<void>;
}

const STORE_KEY = "session";
export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    deviceStorage
      .getItem(STORE_KEY)
      .then((raw) => raw && setSession(JSON.parse(raw) as SessionData))
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

  const signOut = useCallback(async () => {
    await deviceStorage.removeItem(STORE_KEY);
    setSession(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      session,
      client: session ? createClient({ baseUrl: session.baseUrl, token: session.token }) : null,
      signIn,
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
