import { useCallback, useEffect, useState } from "react";

/** `null` username: auth is off on the backend. */
export type Session = { status: "checking" } | { status: "signed-out" } | { status: "signed-in"; username: string | null };

export async function fetchSession(): Promise<Session> {
  const res = await fetch("/api/auth/session");
  if (res.status === 401) return { status: "signed-out" };
  if (!res.ok) throw new Error(`session check failed: ${res.status}`);
  const { username } = (await res.json()) as { username: string };
  return { status: "signed-in", username: username || null };
}

// Must be called once, at the app root.
export function useSession() {
  const [session, setSession] = useState<Session>({ status: "checking" });

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    const check = () =>
      fetchSession()
        .then(setSession)
        .catch(() => {
          retry = setTimeout(check, 3000);
        });
    check();
    return () => clearTimeout(retry);
  }, []);

  /** Resolves to an error message, or null on success. */
  const signIn = useCallback(async (username: string, password: string): Promise<string | null> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.status === 204) {
      setSession({ status: "signed-in", username });
      return null;
    }
    if (res.status === 429) {
      const minutes = Math.ceil(Number(res.headers.get("Retry-After") ?? "600") / 60);
      return `Too many attempts. Try again in ${minutes} min.`;
    }
    return res.status === 401 ? "Wrong username or password." : "Sign-in is unavailable right now.";
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setSession({ status: "signed-out" });
  }, []);

  const expire = useCallback(() => setSession({ status: "signed-out" }), []);

  return { session, signIn, signOut, expire };
}
